#!/usr/bin/env python3
"""
Smart Textbook Pipeline CLI
End-to-end pipeline: Scanned Book Images -> Native Apple Vision OCR -> Dynamic Spine Split -> Smart Interactive HTML5 Viewer.
"""

import os
import sys
import glob
import json
import argparse
from src.batch_ocr import run_batch_ocr
from src.builder import build_viewer

def main():
    parser = argparse.ArgumentParser(description="Convert 1-2s page-turn video/scans into an interactive digital textbook viewer.")
    parser.add_argument("--images", required=True, help="Directory containing scanned textbook images (*.jpg, *.png)")
    parser.add_argument("--output", default="output_viewer.html", help="Path for generated HTML viewer")
    parser.add_argument("--title", default="스마트 디지털 교재 뷰어", help="Book title")
    parser.add_argument("--cache", default="./ocr_cache", help="Directory to store raw OCR JSON cache")
    parser.add_argument("--workers", type=int, default=8, help="Number of parallel OCR threads")
    
    args = parser.parse_args()

    # 1. Discover images
    img_patterns = [os.path.join(args.images, "*.jpg"), os.path.join(args.images, "*.jpeg"), os.path.join(args.images, "*.png")]
    images = []
    for pat in img_patterns:
        images.extend(glob.glob(pat))
    images = sorted(list(set(images)))

    if not images:
        print(f"[Error] No images found in {args.images}")
        sys.exit(1)

    print(f"[Pipeline] Found {len(images)} images in {args.images}")

    # 2. Run Native Apple Vision OCR in Parallel
    run_batch_ocr(images, args.cache, max_workers=args.workers)

    # 3. Create metadata list
    cards_meta = []
    for idx, img_p in enumerate(images, 1):
        cards_meta.append({
            "id": f"page-{idx}",
            "badge": f"{idx * 2 - 2}–{idx * 2 - 1}쪽" if idx > 1 else "표지",
            "title": f"{args.title} #{idx}",
            "time": f"⏱ {idx * 2:02d}s",
            "img_path": os.path.abspath(img_p)
        })

    meta_tmp_path = os.path.join(args.cache, "_cards_meta.json")
    with open(meta_tmp_path, "w", encoding="utf-8") as f:
        json.dump(cards_meta, f, ensure_ascii=False, indent=2)

    # 4. Build Standalone Interactive HTML Viewer
    template_path = os.path.join(os.path.dirname(__file__), "template/smart_viewer_template.html")
    build_viewer(meta_tmp_path, args.cache, template_path, args.output, args.title)

    print(f"\n✨ [Success] All done! Open your viewer in any browser:")
    print(f"   open {args.output}\n")

if __name__ == "__main__":
    main()
