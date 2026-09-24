#include "graph_engine.h"

#include <vector>
#include <queue>
#include <cmath>
#include <algorithm>
#include <cstring>
#include <limits>

#if defined(_OPENMP)
#include <omp.h>
#endif

////////////////////////////////////////////////////////////////
// HARDWARE & GRAPH INVARIANT DEFINES
////////////////////////////////////////////////////////////////
#define GRAPH_INVALID_NODE          0xFFFFFFFF
#define GRAPH_EPSILON_WEIGHT        1e-6
#define GRAPH_MAX_MULE_RATIO        1.15

////////////////////////////////////////////////////////////////
// DISJOINT SET UNION (DSU) - WEAKLY CONNECTED COMPONENT TRACKER
////////////////////////////////////////////////////////////////
/*
* Memory Layout:
* Parent: Flattened root index table
* Size:   Component vertex counter (indexed by root)
*/
struct DSUTracker
{
    std::vector<uint32_t> Parent;
    std::vector<uint32_t> Size;

    DSUTracker(size_t N)
    {
        Parent.resize(N);
        Size.resize(N, 1);
        for (size_t i = 0; i < N; i++)
        {
            Parent[i] = static_cast<uint32_t>(i);
        }
    }

    uint32_t Find(uint32_t Node)
    {
        uint32_t Root = Node;
        while (Root != Parent[Root])
        {
            Root = Parent[Root];
        }
        // Path compression
        uint32_t Curr = Node;
        while (Curr != Root)
        {
            uint32_t Nxt = Parent[Curr];
            Parent[Curr] = Root;
            Curr = Nxt;
        }
        return Root;
    }

    void Unite(uint32_t A, uint32_t B)
    {
        uint32_t RootA = Find(A);
        uint32_t RootB = Find(B);
        if (RootA != RootB)
        {
            if (Size[RootA] < Size[RootB])
            {
                std::swap(RootA, RootB);
            }
            Parent[RootB] = RootA;
            Size[RootA] += Size[RootB];
        }
    }

    uint32_t GetComponentSize(uint32_t Node)
    {
        return Size[Find(Node)];
    }
};

////////////////////////////////////////////////////////////////
// 1. FAST BFS (SHORTEST PATH TRACER)
////////////////////////////////////////////////////////////////
/*
* Flat CSR Navigation:
* Neighbors of node U are located at:
* col_idx[row_ptr[U] ... row_ptr[U + 1] - 1]
*/
struct BFSThreadScratch
{
    std::vector<uint32_t> Parent;
    std::vector<uint32_t> VisitedToken;
    std::vector<uint32_t> Queue;
    uint32_t CurrentToken = 0;

    void EnsureCapacity(size_t N)
    {
        if (Parent.size() < N)
        {
            Parent.resize(N);
            VisitedToken.assign(N, 0);
            Queue.resize(N);
            CurrentToken = 0;
        }
    }
};

static thread_local BFSThreadScratch s_BFSScratch;

GRAPHENGINE_API size_t find_shortest_path_bfs(
    const uint32_t* row_ptr,
    const uint32_t* col_idx,
    uint32_t num_nodes,
    uint32_t src,
    uint32_t dst,
    uint32_t* path_out
)
{
    if (row_ptr == nullptr || col_idx == nullptr || num_nodes == 0 || src >= num_nodes || dst >= num_nodes || path_out == nullptr)
    {
        return 0;
    }

    if (src == dst)
    {
        path_out[0] = src;
        return 1;
    }

    s_BFSScratch.EnsureCapacity(num_nodes);

    // Increment token; if 32-bit uint wraps, perform a one-time zeroing
    if (++s_BFSScratch.CurrentToken == 0)
    {
        std::fill(s_BFSScratch.VisitedToken.begin(), s_BFSScratch.VisitedToken.end(), 0);
        s_BFSScratch.CurrentToken = 1;
    }

    const uint32_t Token = s_BFSScratch.CurrentToken;
    auto& Parent = s_BFSScratch.Parent;
    auto& VisitedToken = s_BFSScratch.VisitedToken;
    auto& Queue = s_BFSScratch.Queue;

    size_t QHead = 0;
    size_t QTail = 0;

    Queue[QTail++] = src;
    VisitedToken[src] = Token;
    Parent[src] = GRAPH_INVALID_NODE;

    bool TargetFound = false;

    while (QHead < QTail)
    {
        uint32_t Curr = Queue[QHead++];
        uint32_t EdgeStart = row_ptr[Curr];
        uint32_t EdgeEnd = row_ptr[Curr + 1];

        for (uint32_t E = EdgeStart; E < EdgeEnd; E++)
        {
            uint32_t Neighbor = col_idx[E];

            if (VisitedToken[Neighbor] != Token)
            {
                VisitedToken[Neighbor] = Token;
                Parent[Neighbor] = Curr;
                Queue[QTail++] = Neighbor;

                if (Neighbor == dst)
                {
                    TargetFound = true;
                    goto PathAssembly;
                }
            }
        }
    }

PathAssembly:
    if (!TargetFound)
    {
        return 0;
    }

    size_t PathLen = 0;
    uint32_t CurrNode = dst;

    while (CurrNode != GRAPH_INVALID_NODE)
    {
        path_out[PathLen++] = CurrNode;
        CurrNode = Parent[CurrNode];
    }

    for (size_t i = 0; i < (PathLen >> 1); i++)
    {
        std::swap(path_out[i], path_out[PathLen - 1 - i]);
    }

    return PathLen;
}

////////////////////////////////////////////////////////////////
// 2. INVERTED BRANDES BETWEENNESS CENTRALITY (PARALLELIZED)
////////////////////////////////////////////////////////////////
struct BrandesThreadScratch
{
    std::vector<double> Dist;
    std::vector<double> Sigma;
    std::vector<double> Delta;
    std::vector<uint32_t> OrderStack;
    std::vector<double> LocalCentrality;

    // Flat Predecessor Arena (Head-Next Singly Linked List)
    std::vector<uint32_t> PredHead;
    std::vector<uint32_t> PredList;
    std::vector<uint32_t> PredNext;
    size_t PredPoolTop;

    using PairDistNode = std::pair<double, uint32_t>;
    std::priority_queue<PairDistNode, std::vector<PairDistNode>, std::greater<PairDistNode>> PQ;

    BrandesThreadScratch(size_t N, size_t InitialPredCap)
        : Dist(N, std::numeric_limits<double>::infinity()),
        Sigma(N, 0.0),
        Delta(N, 0.0),
        OrderStack(N),
        LocalCentrality(N, 0.0),
        PredHead(N, GRAPH_INVALID_NODE),
        PredList(InitialPredCap),
        PredNext(InitialPredCap),
        PredPoolTop(0)
    {}

    inline void ResetPred(uint32_t V)
    {
        PredHead[V] = GRAPH_INVALID_NODE;
    }

    inline void AddPred(uint32_t V, uint32_t U)
    {
        if (PredPoolTop >= PredList.size())
        {
            size_t NewCap = std::max(PredList.size() * 2, static_cast<size_t>(1024));
            PredList.resize(NewCap);
            PredNext.resize(NewCap);
        }
        size_t Idx = PredPoolTop++;
        PredList[Idx] = U;
        PredNext[Idx] = PredHead[V];
        PredHead[V] = static_cast<uint32_t>(Idx);
    }
};

GRAPHENGINE_API void compute_brandes_centrality(
    const uint32_t* row_ptr,
    const uint32_t* col_idx,
    const float* weights,
    size_t num_nodes,
    double* centrality_out
)
{
    if (row_ptr == nullptr || col_idx == nullptr || weights == nullptr || num_nodes == 0 || centrality_out == nullptr)
    {
        return;
    }

    std::memset(centrality_out, 0, num_nodes * sizeof(double));

    size_t TotalEdges = row_ptr[num_nodes];

    // Weakly Connected Component tracking for local normalization
    DSUTracker DSU(num_nodes);
    for (uint32_t U = 0; U < num_nodes; U++)
    {
        uint32_t EdgeStart = row_ptr[U];
        uint32_t EdgeEnd = row_ptr[U + 1];
        for (uint32_t E = EdgeStart; E < EdgeEnd; E++)
        {
            DSU.Unite(U, col_idx[E]);
        }
    }

    int MaxThreads = 1;
#if defined(_OPENMP)
    MaxThreads = omp_get_max_threads();
#endif
    std::vector<BrandesThreadScratch*> ThreadScratches(MaxThreads, nullptr);

#pragma omp parallel
    {
        int TID = 0;
#if defined(_OPENMP)
        TID = omp_get_thread_num();
#endif

        // Ensure InitPredCap is bounded and never zero
        size_t InitPredCap = std::max<size_t>(
            1024,
            std::min(TotalEdges, std::max<size_t>(num_nodes * 2, 4096))
        );

        BrandesThreadScratch Scratch(num_nodes, InitPredCap);
        ThreadScratches[TID] = &Scratch;

#pragma omp for schedule(dynamic, 64)
        for (int64_t SIdx = 0; SIdx < static_cast<int64_t>(num_nodes); SIdx++)
        {
            uint32_t S = static_cast<uint32_t>(SIdx);

            // Skip terminal vertices with zero out-degree
            if (row_ptr[S + 1] - row_ptr[S] == 0)
            {
                continue;
            }

            Scratch.Dist[S] = 0.0;
            Scratch.Sigma[S] = 1.0;
            Scratch.PQ.push({ 0.0, S });
            size_t StackTop = 0;

            // Forward Dijkstra Pass
            while (!Scratch.PQ.empty())
            {
                auto [D, U] = Scratch.PQ.top();
                Scratch.PQ.pop();

                if (D > Scratch.Dist[U])
                {
                    continue;
                }

                Scratch.OrderStack[StackTop++] = U;

                uint32_t EdgeStart = row_ptr[U];
                uint32_t EdgeEnd = row_ptr[U + 1];

                for (uint32_t E = EdgeStart; E < EdgeEnd; E++)
                {
                    uint32_t V = col_idx[E];
                    double ClampedWeight = std::max(0.0, static_cast<double>(weights[E]));
                    double EdgeCost = 1.0 / (ClampedWeight + GRAPH_EPSILON_WEIGHT);
                    double NewDist = Scratch.Dist[U] + EdgeCost;

                    // Safe IEEE 754 Infinity Branching
                    if (Scratch.Dist[V] == std::numeric_limits<double>::infinity())
                    {
                        Scratch.Dist[V] = NewDist;
                        Scratch.Sigma[V] = Scratch.Sigma[U];
                        Scratch.ResetPred(V);
                        Scratch.AddPred(V, U);
                        Scratch.PQ.push({ NewDist, V });
                    }
                    else
                    {
                        double Diff = NewDist - Scratch.Dist[V];
                        double Tol = std::max(NewDist, Scratch.Dist[V]) * 1e-12;

                        if (Diff < -Tol)
                        {
                            Scratch.Dist[V] = NewDist;
                            Scratch.Sigma[V] = Scratch.Sigma[U];
                            Scratch.ResetPred(V);
                            Scratch.AddPred(V, U);
                            Scratch.PQ.push({ NewDist, V });
                        }
                        else if (std::abs(Diff) <= Tol)
                        {
                            Scratch.Sigma[V] += Scratch.Sigma[U];
                            Scratch.AddPred(V, U);
                        }
                    }
                }
            }

            // Backward Dependency Accumulation Pass
            while (StackTop > 0)
            {
                uint32_t W = Scratch.OrderStack[--StackTop];

                for (uint32_t PIdx = Scratch.PredHead[W]; PIdx != GRAPH_INVALID_NODE; PIdx = Scratch.PredNext[PIdx])
                {
                    uint32_t P = Scratch.PredList[PIdx];
                    if (Scratch.Sigma[W] > 0.0)
                    {
                        Scratch.Delta[P] += (Scratch.Sigma[P] / Scratch.Sigma[W]) * (1.0 + Scratch.Delta[W]);
                    }
                }

                if (W != S)
                {
                    Scratch.LocalCentrality[W] += Scratch.Delta[W];
                }

                // O(V_s) Fast Memory Reset: Cleans only visited nodes
                Scratch.Dist[W] = std::numeric_limits<double>::infinity();
                Scratch.Sigma[W] = 0.0;
                Scratch.Delta[W] = 0.0;
                Scratch.PredHead[W] = GRAPH_INVALID_NODE;
            }

            Scratch.PredPoolTop = 0;
        }

        // Parallel static reduction across thread scratch buffers
#pragma omp for schedule(static)
        for (int64_t i = 0; i < static_cast<int64_t>(num_nodes); i++)
        {
            double Sum = 0.0;
            for (int t = 0; t < MaxThreads; t++)
            {
                if (ThreadScratches[t] != nullptr)
                {
                    Sum += ThreadScratches[t]->LocalCentrality[i];
                }
            }
            centrality_out[i] = Sum;
        }
    }

    // Component-Relative Normalization
    for (uint32_t i = 0; i < num_nodes; i++)
    {
        uint32_t CompSize = DSU.GetComponentSize(i);
        if (CompSize > 2)
        {
            double Scale = 1.0 / (static_cast<double>(CompSize - 1) * static_cast<double>(CompSize - 2));
            centrality_out[i] *= Scale;
        }
        else
        {
            centrality_out[i] = 0.0;
        }
    }
}

////////////////////////////////////////////////////////////////
// 3. TERMINAL SHATTER-POINT DETECTOR
////////////////////////////////////////////////////////////////
GRAPHENGINE_API void detect_shatter_points(
    const uint32_t* row_ptr,
    const uint32_t* col_idx,
    size_t num_nodes,
    uint8_t* is_shatter_out
)
{
    if (row_ptr == nullptr || col_idx == nullptr || num_nodes == 0 || is_shatter_out == nullptr)
    {
        return;
    }

    std::memset(is_shatter_out, 0, num_nodes * sizeof(uint8_t));

    size_t TotalEdges = row_ptr[num_nodes];
    std::vector<uint32_t> InDegree(num_nodes, 0);

    for (size_t E = 0; E < TotalEdges; E++)
    {
        uint32_t Target = col_idx[E];
        if (Target < num_nodes)
        {
            InDegree[Target]++;
        }
    }

    for (size_t U = 0; U < num_nodes; U++)
    {
        uint32_t OutDegree = row_ptr[U + 1] - row_ptr[U];
        if (OutDegree == 0 && InDegree[U] > 0)
        {
            is_shatter_out[U] = 1;
        }
    }
}

////////////////////////////////////////////////////////////////
// 4. FLOW-VELOCITY MONEY MULE FAN-OUT DETECTOR
////////////////////////////////////////////////////////////////
GRAPHENGINE_API void detect_mule_fanout(
    const uint32_t* row_ptr,
    const uint32_t* col_idx,
    const float* weights,
    size_t num_nodes,
    float velocity_ratio_threshold,
    uint8_t* is_mule_out
)
{
    if (row_ptr == nullptr || col_idx == nullptr || weights == nullptr || num_nodes == 0 || is_mule_out == nullptr)
    {
        return;
    }

    std::memset(is_mule_out, 0, num_nodes * sizeof(uint8_t));

    std::vector<double> Inflow(num_nodes, 0.0);
    std::vector<double> Outflow(num_nodes, 0.0);

    for (uint32_t U = 0; U < num_nodes; U++)
    {
        uint32_t EdgeStart = row_ptr[U];
        uint32_t EdgeEnd = row_ptr[U + 1];

        for (uint32_t E = EdgeStart; E < EdgeEnd; E++)
        {
            uint32_t V = col_idx[E];
            float W = weights[E];

            Outflow[U] += W;
            if (V < num_nodes)
            {
                Inflow[V] += W;
            }
        }
    }

    for (size_t U = 0; U < num_nodes; U++)
    {
        uint32_t OutDegree = row_ptr[U + 1] - row_ptr[U];

        if (Inflow[U] > 0.0 && OutDegree >= 2)
        {
            double Ratio = Outflow[U] / Inflow[U];
            if (Ratio >= static_cast<double>(velocity_ratio_threshold) && Ratio <= GRAPH_MAX_MULE_RATIO)
            {
                is_mule_out[U] = 1;
            }
        }
    }
}

////////////////////////////////////////////////////////////////
// 5. TARJAN'S STRONGLY CONNECTED COMPONENTS (ITERATIVE)
////////////////////////////////////////////////////////////////
struct TarjanDFSFrame
{
    uint32_t Node;
    uint32_t EdgeIndex;
};

GRAPHENGINE_API size_t compute_tarjan_scc(
    const uint32_t* row_ptr,
    const uint32_t* col_idx,
    size_t num_nodes,
    uint32_t* comp_labels_out
)
{
    if (row_ptr == nullptr || col_idx == nullptr || num_nodes == 0 || comp_labels_out == nullptr)
    {
        return 0;
    }

    std::vector<uint32_t> DiscTime(num_nodes, GRAPH_INVALID_NODE);
    std::vector<uint32_t> LowLink(num_nodes, GRAPH_INVALID_NODE);
    std::vector<uint8_t> OnStack(num_nodes, 0);

    std::vector<uint32_t> NodeStack(num_nodes);
    size_t NodeStackTop = 0;

    std::vector<TarjanDFSFrame> CallStack(num_nodes);
    size_t CallStackTop = 0;

    uint32_t Timer = 0;
    uint32_t ComponentCount = 0;

    for (uint32_t i = 0; i < num_nodes; i++)
    {
        if (DiscTime[i] != GRAPH_INVALID_NODE)
        {
            continue;
        }

        DiscTime[i] = LowLink[i] = ++Timer;
        NodeStack[NodeStackTop++] = i;
        OnStack[i] = 1;

        CallStack[CallStackTop++] = { i, row_ptr[i] };

        while (CallStackTop > 0)
        {
            TarjanDFSFrame& Frame = CallStack[CallStackTop - 1];
            uint32_t U = Frame.Node;

            if (Frame.EdgeIndex < row_ptr[U + 1])
            {
                uint32_t E = Frame.EdgeIndex++;
                uint32_t V = col_idx[E];

                if (DiscTime[V] == GRAPH_INVALID_NODE)
                {
                    DiscTime[V] = LowLink[V] = ++Timer;
                    NodeStack[NodeStackTop++] = V;
                    OnStack[V] = 1;

                    CallStack[CallStackTop++] = { V, row_ptr[V] };
                }
                else if (OnStack[V])
                {
                    LowLink[U] = std::min(LowLink[U], DiscTime[V]);
                }
            }
            else
            {
                if (CallStackTop > 1)
                {
                    uint32_t Parent = CallStack[CallStackTop - 2].Node;
                    LowLink[Parent] = std::min(LowLink[Parent], LowLink[U]);
                }

                if (LowLink[U] == DiscTime[U])
                {
                    while (NodeStackTop > 0)
                    {
                        uint32_t W = NodeStack[--NodeStackTop];
                        OnStack[W] = 0;
                        comp_labels_out[W] = ComponentCount;
                        if (W == U)
                        {
                            break;
                        }
                    }
                    ComponentCount++;
                }

                CallStackTop--;
            }
        }
    }

    return ComponentCount;
}