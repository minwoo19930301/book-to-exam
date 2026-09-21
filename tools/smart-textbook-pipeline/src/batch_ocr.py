"""
Batch OCR Runner
Executes native Apple Vision OCR across all textbook images in parallel with thread pool caching.
"""

import os
import sys
import json
import glob
import subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Tuple

def ensure_ocr_tool(src_path: str = None, bin_path: str = None) -> str:
    """Resolve bundled sources independently of the caller's working directory."""
    src_path = src_path or os.path.join(os.path.dirname(__file__), "ocr_tool.swift")
    bin_path = bin_path or os.path.join(os.path.dirname(os.path.dirname(__file__)), ".cache", "ocr_tool")
    src_path = os.path.abspath(src_path)
    bin_path = os.path.abspath(bin_path)
    os.makedirs(os.path.dirname(bin_path), exist_ok=True)
    if os.path.exists(bin_path) and os.access(bin_path, os.X_OK):
        return bin_path
    print(f"[Build] Compiling native Apple Vision OCR tool: {src_path} -> {bin_path}...")
    subprocess.run(["swiftc", "-O", src_path, "-o", bin_path], check=True)
    print("[Build] Compilation successful!")
    return bin_path

def process_single_image(ocr_bin: str, img_path: str, cache_dir: str) -> Tuple[str, str, int]:
    base = os.path.basename(img_path)
    cache_file = os.path.join(cache_dir, base + ".json")
    if os.path.exists(cache_file) and os.path.getsize(cache_file) > 10:
        return base, "cached", 0
        
    try:
        res = subprocess.run([ocr_bin, img_path], capture_output=True, text=True, check=True)
        data = json.loads(res.stdout)
        with open(cache_file, "w", encoding="utf-8") as out:
            json.dump(data, out, ensure_ascii=False, indent=2)
        return base, "success", len(data)
    except Exception as e:
        return base, f"error: {e}", 0

def run_batch_ocr(image_paths: List[str], cache_dir: str, max_workers: int = 8):
    os.makedirs(cache_dir, exist_ok=True)
    ocr_bin = ensure_ocr_tool()
    
    total = len(image_paths)
    print(f"[Batch OCR] Starting parallel processing of {total} images (workers={max_workers})...")
    completed = 0
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(process_single_image, ocr_bin, p, cache_dir): p for p in image_paths}
        for f in as_completed(futures):
            base, status, count = f.result()
            completed += 1
            if completed % 10 == 0 or completed == total:
                print(f"  [{completed:3d}/{total:3d}] {base}: {status} ({count} items)")
    print("[Batch OCR] Completed all images successfully!")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python3 batch_ocr.py <images_directory_or_glob> <cache_directory>")
        sys.exit(1)
        
    target_pattern = sys.argv[1]
    out_cache = sys.argv[2]
    if os.path.isdir(target_pattern):
        imgs = sorted(glob.glob(os.path.join(target_pattern, "*.jpg")) + glob.glob(os.path.join(target_pattern, "*.png")))
    else:
        imgs = sorted(glob.glob(target_pattern))
        
    run_batch_ocr(imgs, out_cache)
