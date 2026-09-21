"""
HTML Viewer Builder
Assembles the complete standalone dual-column interactive textbook viewer
from OCR JSON cache and the master HTML template.
"""

import os
import re
import json
import argparse
from typing import List, Dict, Any
from spine_splitter import find_spine_split, partition_spread
from formatter import sort_and_group_lines, format_page_html

def build_viewer(image_list_path: str,
                 cache_dir: str,
                 template_path: str,
                 output_html_path: str,
                 book_title: str = "스마트 교재 뷰어"):
    
    with open(template_path, "r", encoding="utf-8") as f:
        template = f.read()

    # Load image metadata list (or discover images)
    # image_list can be a JSON array of dicts: [{"id": "page-1", "badge": "22-23쪽", "title": "...", "img_path": "..."}]
    with open(image_list_path, "r", encoding="utf-8") as f:
        cards_data = json.load(f)

    cards_html = []
    toc_html = []

    print(f"[Builder] Building viewer for {len(cards_data)} spreads...")

    for i, item in enumerate(cards_data, 1):
        cid = item.get("id", f"page-{i}")
        badge = item.get("badge", f"Spread {i}")
        title = item.get("title", f"Page Spread {i}")
        time_tag = item.get("time", "")
        img_path = item["img_path"]
        base_name = os.path.basename(img_path)
        cache_file = os.path.join(cache_dir, base_name + ".json")

        # Sidebar TOC item
        time_badge = f'<span class="toc-badge">{time_tag}</span>' if time_tag else ''
        toc_html.append(f"""
        <a href="#{cid}" class="toc-item">
          <span><strong>{badge}</strong> {title}</span>
          {time_badge}
        </a>""")

        left_html = ""
        right_html = ""

        if os.path.exists(cache_file):
            with open(cache_file, "r", encoding="utf-8") as cfp:
                ocr_items = json.load(cfp)

            split_x = find_spine_split(ocr_items)
            left_items, right_items = partition_spread(ocr_items, split_x)

            left_lines = sort_and_group_lines(left_items)
            right_lines = sort_and_group_lines(right_items)

            left_html = format_page_html(left_lines, "왼쪽")
            right_html = format_page_html(right_lines, "오른쪽")
        else:
            left_html = "<p class='body-line'>OCR 데이터가 없습니다.</p>"
            right_html = "<p class='body-line'>OCR 데이터가 없습니다.</p>"

        # Parse badge into left/right labels if format like "22–23쪽"
        nums = re.findall(r"\d+", badge)
        left_label = f"왼쪽 {nums[0]}쪽" if len(nums) >= 1 else "왼쪽 면"
        right_label = f"오른쪽 {nums[1]}쪽" if len(nums) >= 2 else "오른쪽 면"

        card_snippet = f"""
      <section class="book-page-card" id="{cid}">
        <div class="page-header">
          <div class="page-title-row">
            <span class="page-badge">{badge}</span>
            <span class="page-time">{time_tag}</span>
          </div>
          <h2 class="page-title">{title}</h2>
        </div>
        <div class="image-wrapper" onclick="openZoomModal('{img_path}')">
          <img src="{img_path}" alt="{badge} 스캔본" loading="lazy" class="scan-img">
          <div class="zoom-hint">🔍 클릭하여 고화질 확대 / 이동</div>
        </div>
        <div class="spread-pages">
          <div class="spread-col" data-side="left">
            <div class="spread-label">{left_label}</div>
            <div class="raw-text-wrapper">
              {left_html}
            </div>
          </div>
          <div class="spread-col" data-side="right">
            <div class="spread-label">{right_label}</div>
            <div class="raw-text-wrapper">
              {right_html}
            </div>
          </div>
        </div>
      </section>"""
        cards_html.append(card_snippet)

    # Replace placeholders in template
    output_content = template.replace("{{BOOK_TITLE}}", book_title)
    output_content = output_content.replace("{{TOC_ITEMS}}", "\n".join(toc_html))
    output_content = output_content.replace("{{CARDS_CONTAINER}}", "\n".join(cards_html))

    with open(output_html_path, "w", encoding="utf-8") as out:
        out.write(output_content)

    print(f"[Builder] Successfully generated {output_html_path} ({os.path.getsize(output_html_path):,} bytes)!")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build interactive digital textbook viewer HTML")
    parser.add_argument("--cards", required=True, help="Path to cards metadata JSON")
    parser.add_argument("--cache", required=True, help="Path to OCR JSON cache directory")
    parser.add_argument("--template", default="template/smart_viewer_template.html", help="Path to HTML template")
    parser.add_argument("--output", required=True, help="Output HTML path")
    parser.add_argument("--title", default="스마트 교재 뷰어", help="Title of the book")

    args = parser.parse_args()
    build_viewer(args.cards, args.cache, args.template, args.output, args.title)
