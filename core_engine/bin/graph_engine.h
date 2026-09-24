#pragma once

#include <stdint.h>
#include <stddef.h>

#if defined(_MSC_VER)
	#ifdef GRAPHENGINE_EXPORTS
		#define GRAPHENGINE_API __declspec(dllexport)
	#else
		#define GRAPHENGINE_API __declspec(dllimport)
	#endif
#else
	#define GRAPHENGINE_API	__attribute__((visibility("default")))
#endif

#ifdef __cplusplus
extern "C" {
#endif

// 1. Bidirectional BFS Pathfinding
GRAPHENGINE_API size_t find_shortest_path_bfs(
    const uint32_t* row_ptr,
    const uint32_t* col_idx,
    uint32_t num_nodes,
    uint32_t src,
    uint32_t dst,
    uint32_t* path_out
);

// 2. Component-Relative Inverted Brandes Centrality
GRAPHENGINE_API void compute_brandes_centrality(
    const uint32_t* row_ptr,
    const uint32_t* col_idx,
    const float* weights,
    size_t num_nodes,
    double* centrality_out
);

// 3. Terminal Shatter-Point Pruning
GRAPHENGINE_API void detect_shatter_points(
    const uint32_t* row_ptr,
    const uint32_t* col_idx,
    size_t num_nodes,
    uint8_t* is_shatter_out
);

// 4. Flow-Velocity Mule Fan-Out Detector
GRAPHENGINE_API void detect_mule_fanout(
    const uint32_t* row_ptr,
    const uint32_t* col_idx,
    const float* weights,
    size_t num_nodes,
    float velocity_ratio_threshold,
    uint8_t* is_mule_out
);

// 5. Tarjan's Strongly Connected Components (SCC)
// comp_labels_out must be pre-allocated to size [num_nodes]
// Returns the total number of components discovered
GRAPHENGINE_API size_t compute_tarjan_scc(
    const uint32_t* row_ptr,
    const uint32_t* col_idx,
    size_t num_nodes,
    uint32_t* comp_labels_out
);

#ifdef __cplusplus
}
#endif