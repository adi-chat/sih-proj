import numpy as np

def normalize_vector(v: np.ndarray, eps: float = 1e-9) -> np.ndarray:
    """Normalizes vector to unit sphere for stable associative retrieval."""
    norm = np.linalg.norm(v, axis=0, keepdims=True)
    return v / np.maximum(norm, eps)

def compute_hopfield_energy(state: np.ndarray, memory_matrix: np.ndarray, beta: float = 8.0) -> float:
    """
    Computes modern Hopfield Lyapunov energy:
    E(x) = -lse(beta * M^T * x) / beta + 0.5 * ||x||^2
    """
    logits = beta * np.dot(memory_matrix.T, state)
    max_logit = np.max(logits)
    lse = max_logit + np.log(np.sum(np.exp(logits - max_logit)))
    return float(-(lse / beta) + 0.5 * np.dot(state, state))

def hopfield_energy_update(
    state_vector: np.ndarray, 
    memory_matrix: np.ndarray, 
    beta: float = 8.0,
    max_iter: int = 15,
    tol: float = 1e-5
) -> np.ndarray:
    """
    Iterative continuous attractor dynamics:
    x^(t+1) = M * softmax(beta * M^T * x^(t))
    Iterates until energy convergence or tolerance limit.
    """
    M = normalize_vector(memory_matrix)
    x = normalize_vector(state_vector.flatten())
    
    for _ in range(max_iter):
        logits = beta * np.dot(M.T, x)
        weights = np.exp(logits - np.max(logits))
        weights /= np.sum(weights)
        
        x_next = np.dot(M, weights)
        x_next = normalize_vector(x_next)
        
        if np.linalg.norm(x_next - x) < tol:
            break
        x = x_next
        
    return x

def classify_syndicate_archetype(case_vector: np.ndarray, prototype_basins: np.ndarray, beta: float = 8.0) -> tuple:
    """
    Matches case vector against known syndicate archetypes.
    Returns: (best_match_idx, confidence_score, final_energy)
    """
    norm_basins = normalize_vector(prototype_basins)
    norm_case = normalize_vector(case_vector.flatten())
    
    converged_state = hopfield_energy_update(norm_case, norm_basins, beta=beta)
    energy = compute_hopfield_energy(converged_state, norm_basins, beta=beta)
    
    similarities = np.dot(norm_basins.T, converged_state)
    best_match = int(np.argmax(similarities))
    confidence = float(np.clip(similarities[best_match], 0.0, 1.0))
    
    return best_match, confidence