"""
Spine Splitter Module
Computes the dynamic book spine gutter to cleanly separate left and right pages
in two-page textbook spread scans without cross-column bleeding.
"""

from typing import List, Dict, Tuple, Any

def find_spine_split(items: List[Dict[str, Any]], 
                     min_x: float = 0.32, 
                     max_x: float = 0.58, 
                     step: float = 0.005) -> float:
    """
    Finds the optimal x-coordinate for splitting a two-page spread.
    
    In real book captures, camera angle, curvature, and margins cause the center spine 
    gutter to drift anywhere between x=0.35 and 0.55. A naive 0.50 split causes severe 
    column bleeding (e.g. right page text dumped into the left page).
    
    Algorithm:
    1. Filter out running top header timeline and bottom footer page numbers (body: 0.08 <= y <= 0.85).
    2. Evaluate candidate split lines across the range [min_x, max_x].
    3. Score each candidate:
       - Minimize the number of text bounding boxes intersected (primary penalty).
       - Maximize the gutter margin to neighboring boxes (primary reward).
       - Tie-breaker: slight preference towards center (x ≈ 0.46).
    
    Returns:
        float: The optimal x split coordinate.
    """
    body_items = [d for d in items if 0.08 <= d["y"] <= 0.85]
    if not body_items:
        body_items = items
    if not body_items:
        return 0.45
    
    candidates = []
    x = min_x
    while x <= max_x:
        # Bounding boxes that strictly contain x with a safety margin
        intersecting = [d for d in body_items if d["x"] + 0.005 < x < (d["x"] + d["w"] - 0.005)]
        
        # Closest edges on left and right side of x
        left_edges = [d["x"] for d in body_items if d["x"] >= x]
        right_edges = [d["x"] + d["w"] for d in body_items if d["x"] + d["w"] <= x]
        
        min_dist_r = min([xp - x for xp in left_edges]) if left_edges else 0.0
        min_dist_l = min([x - xp for xp in right_edges]) if right_edges else 0.0
        margin = min_dist_l + min_dist_r
        
        # Score tuple: (-cuts, margin, -distance_from_center)
        score = (-len(intersecting), margin, -abs(x - 0.46))
        candidates.append((score, x))
        x += step
        
    candidates.sort(key=lambda c: c[0], reverse=True)
    return candidates[0][1]


def partition_spread(items: List[Dict[str, Any]], split_x: float) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Partitions OCR items into Left Page and Right Page.
    
    Uses bounding box center point (x + w/2) to reliably classify boxes 
    even when slight character overhangs touch the spine margin.
    """
    left_items = [d for d in items if (d["x"] + d["w"] / 2.0) < split_x]
    right_items = [d for d in items if (d["x"] + d["w"] / 2.0) >= split_x]
    return left_items, right_items
