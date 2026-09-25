import ctypes
import os
from typing import List, Tuple, Optional

_base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
_bin_dir = os.path.join(_base_dir, "core_engine", "bin")
_dll_path = os.path.join(_bin_dir, "Graph_Engine.dll")
_lib = None

try:
    if os.path.exists(_dll_path):
        if hasattr(os, "add_dll_directory"):
            os.add_dll_directory(_bin_dir)
        _lib = ctypes.CDLL(_dll_path)
    else:
        alt_path = os.path.abspath("core_engine/bin/Graph_Engine.dll")
        if os.path.exists(alt_path):
            if hasattr(os, "add_dll_directory"):
                os.add_dll_directory(os.path.dirname(alt_path))
            _lib = ctypes.CDLL(alt_path)
        else:
            print(f"[!] Warning: Graph_Engine.dll not found at {_dll_path}")
except Exception as e:
    print(f"[!] C++ Engine load warning: {e}")

def verify_engine_loaded() -> bool:
    return _lib is not None

def get_engine_lib():
    return _lib

def compute_brandes_centrality(num_nodes: int, row_ptr: List[int], col_idx: List[int], weights: List[float]) -> List[float]:
    if not verify_engine_loaded() or not hasattr(_lib, "compute_brandes_centrality"):
        raise RuntimeError("C++ compute_brandes_centrality not available")
    
    func = _lib.compute_brandes_centrality
    func.argtypes = [
        ctypes.POINTER(ctypes.c_int),
        ctypes.POINTER(ctypes.c_int),
        ctypes.POINTER(ctypes.c_double),
        ctypes.c_size_t,
        ctypes.POINTER(ctypes.c_double)
    ]
    func.restype = None

    c_row_ptr = (ctypes.c_int * len(row_ptr))(*row_ptr)
    c_col_idx = (ctypes.c_int * len(col_idx))(*col_idx)
    c_weights = (ctypes.c_double * len(weights))(*weights)
    c_centrality_out = (ctypes.c_double * num_nodes)()

    func(c_row_ptr, c_col_idx, c_weights, ctypes.c_size_t(num_nodes), c_centrality_out)
    return [float(x) for x in c_centrality_out]

def detect_shatter_points(num_nodes: int, row_ptr: List[int], col_idx: List[int]) -> List[int]:
    if not verify_engine_loaded() or not hasattr(_lib, "detect_shatter_points"):
        raise RuntimeError("C++ detect_shatter_points not available")
    
    func = _lib.detect_shatter_points
    func.argtypes = [
        ctypes.POINTER(ctypes.c_int),
        ctypes.POINTER(ctypes.c_int),
        ctypes.c_size_t,
        ctypes.POINTER(ctypes.c_ubyte)
    ]
    func.restype = None

    c_row_ptr = (ctypes.c_int * len(row_ptr))(*row_ptr)
    c_col_idx = (ctypes.c_int * len(col_idx))(*col_idx)
    output_buffer = (ctypes.c_ubyte * num_nodes)()

    func(c_row_ptr, c_col_idx, ctypes.c_size_t(num_nodes), output_buffer)
    return [i for i, val in enumerate(output_buffer) if val > 0]

def detect_mule_fanout(num_nodes: int, row_ptr: List[int], col_idx: List[int], weights: List[float], threshold: float = 0.9) -> List[dict]:
    if not verify_engine_loaded() or not hasattr(_lib, "detect_mule_fanout"):
        raise RuntimeError("C++ detect_mule_fanout not available")
    
    func = _lib.detect_mule_fanout
    func.argtypes = [
        ctypes.POINTER(ctypes.c_int),
        ctypes.POINTER(ctypes.c_int),
        ctypes.POINTER(ctypes.c_double),
        ctypes.c_size_t,
        ctypes.c_float,
        ctypes.POINTER(ctypes.c_ubyte)
    ]
    func.restype = None

    c_row_ptr = (ctypes.c_int * len(row_ptr))(*row_ptr)
    c_col_idx = (ctypes.c_int * len(col_idx))(*col_idx)
    c_weights = (ctypes.c_double * len(weights))(*weights)
    output_buffer = (ctypes.c_ubyte * num_nodes)()

    func(c_row_ptr, c_col_idx, c_weights, ctypes.c_size_t(num_nodes), ctypes.c_float(threshold), output_buffer)
    return [{"node": i, "flag": int(val)} for i, val in enumerate(output_buffer) if val > 0]

def find_shortest_path_bfs(num_nodes: int, row_ptr: List[int], col_idx: List[int], source_node: int, target_node: int) -> List[int]:
    func_name = "find_shortest_path_bfs" if hasattr(_lib, "find_shortest_path_bfs") else "compute_bfs_path"
    if not verify_engine_loaded() or not hasattr(_lib, func_name):
        raise RuntimeError(f"C++ BFS function {func_name} not available")
    
    func = getattr(_lib, func_name)
    func.argtypes = [
        ctypes.POINTER(ctypes.c_int),
        ctypes.POINTER(ctypes.c_int),
        ctypes.c_size_t,
        ctypes.c_int,
        ctypes.c_int,
        ctypes.POINTER(ctypes.c_int),
        ctypes.POINTER(ctypes.c_int)
    ]
    func.restype = None

    c_row_ptr = (ctypes.c_int * len(row_ptr))(*row_ptr)
    c_col_idx = (ctypes.c_int * len(col_idx))(*col_idx)
    path_buf = (ctypes.c_int * num_nodes)()
    path_len = ctypes.c_int(0)

    func(c_row_ptr, c_col_idx, ctypes.c_size_t(num_nodes), ctypes.c_int(source_node), ctypes.c_int(target_node), path_buf, ctypes.byref(path_len))
    resolved_len = path_len.value
    return list(path_buf[:resolved_len]) if resolved_len > 0 else []