import sqlite3
import os
import sys
from typing import Dict, Any

# --- UPGRADED: Dynamic Database Path Discovery ---
_script_dir = getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__)))

def resolve_db_path() -> str:
    candidates = [
        os.path.abspath(os.path.join(_script_dir, "..", "core_engine", "data", "crimenet_sovereign_mesh.db")),
        os.path.abspath(os.path.join(_script_dir, "..", "..", "core_engine", "data", "crimenet_sovereign_mesh.db")),
        os.path.abspath("core_engine/data/crimenet_sovereign_mesh.db")
    ]
    for p in candidates:
        if os.path.exists(p):
            return p
    return candidates[0]

def fetch_graph_data_for_case(case_id: str) -> Dict[str, Any]:
    # UPGRADE: Point directly to the dynamically resolved database file
    db_path = resolve_db_path()
    
    if not os.path.exists(db_path):
        raise FileNotFoundError(f"Database not found at {db_path}. Please place crimenet_sovereign_mesh.db there.")

    # UPGRADE: Added timeout=30.0 to prevent "database is locked" errors during multi-user queries
    conn = sqlite3.connect(db_path, timeout=30.0)
    cursor = conn.cursor()
    
    # Query edges associated with the specific case identifier
    cursor.execute(
        "SELECT source_node, target_node, weight FROM graph_edges WHERE case_id = ?", 
        (case_id,)
    )
    rows = cursor.fetchall()
    conn.close()

    if not rows:
        return {"num_nodes": 0, "row_ptr": [0], "col_idx": [], "weights": []}

    # Map unique node names to contiguous integer IDs [0, N-1]
    node_map = {}
    def get_node_id(node_str):
        if node_str not in node_map:
            node_map[node_str] = len(node_map)
        return node_map[node_str]

    # --- UPGRADE: Multi-Edge Deduplication & Strict CSR Sorting ---
    edge_dict = {}
    for src, tgt, w in rows:
        u = get_node_id(src)
        v = get_node_id(tgt)
        
        # If multiple edges exist between u and v, accumulate their weights
        if (u, v) in edge_dict:
            edge_dict[(u, v)] += float(w)
        else:
            edge_dict[(u, v)] = float(w)

    num_nodes = len(node_map)
    
    # Rebuild edges list and sort strictly by Source (u) FIRST, then Target (v)
    edges = [(u, v, w) for (u, v), w in edge_dict.items()]
    edges.sort(key=lambda x: (x[0], x[1]))

    row_ptr = [0] * (num_nodes + 1)
    col_idx = []
    weights = []

    current_node = 0
    for u, v, w in edges:
        while current_node < u:
            current_node += 1
            row_ptr[current_node] = len(col_idx)
        col_idx.append(v)
        weights.append(w)

    while current_node < num_nodes:
        current_node += 1
        row_ptr[current_node] = len(col_idx)

    return {
        "num_nodes": num_nodes,
        "row_ptr": row_ptr,
        "col_idx": col_idx,
        "weights": weights
    }