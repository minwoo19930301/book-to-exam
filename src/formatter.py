"""
Formatter Module
Filters running headers/footers, clusters OCR fragments into natural visual lines,
and converts them into structured semantic HTML.
"""

import re
from typing import List, Dict, Any

def escape(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

def is_noise(d: Dict[str, Any]) -> bool:
    """
    Identifies non-content artifacts such as:
    1. Running footers / bottom page numbers (y < 0.05).
    2. Running top timeline breadcrumbs / dynasty markers (y > 0.88).
    3. Upper-right floating dynasty tabs.
    """
    txt = d["text"].strip()
    y = d["y"]
    x = d["x"]
    if not txt:
        return True
        
    # Bottom margin page numbers and chapter tag
    if y < 0.05 and (txt.isdigit() or any(h in txt for h in ["PART", "CHAPTER", "역사", "교재", "페이지"])):
        return True
        
    # Top margin timeline breadcrumbs
    if y > 0.88:
        timeline_keywords = [
            "하", "상", "주", "춘추", "전국", "진", "한", "위진", "남북조", "수", "당", "송", "요", "금", "원", "명", "청",
            "중화민국", "중화인민", "공화국", "직설", "철시", "당한", "광회", "애", "공", "분리", "붕리", "CHAPTER", "PART"
        ]
        if len(txt) <= 3 or any(kw in txt for kw in timeline_keywords):
            return True
            
    # Upper-right timeline tab buttons
    if y >= 0.79 and x >= 0.58 and len(txt) <= 8:
        dyn_kw = ["진", "한", "수", "당", "송", "요", "금", "원", "명", "청", "민국", "공화", "관한서", "3화", "등", "?"]
        if any(kw in txt for kw in dyn_kw):
            return True
            
    return False

def sort_and_group_lines(items: List[Dict[str, Any]], y_threshold: float = 0.012) -> List[str]:
    """
    Groups individual OCR bounding boxes into visual lines and sorts them in natural reading order.
    
    1. Filters out noise.
    2. Sorts items top-to-bottom (y descending).
    3. Groups items whose vertical centers are within `y_threshold` (~1.2% of page height).
    4. Sorts grouped items left-to-right (x ascending) and joins them with spaces.
    5. Returns ordered list of clean line strings.
    """
    clean = [d for d in items if not is_noise(d)]
    raw_sorted = sorted(clean, key=lambda d: -d["y"])
    
    lines: List[List[Dict[str, Any]]] = []
    for it in raw_sorted:
        placed = False
        for line in lines:
            avg_y = sum(x["y"] for x in line) / len(line)
            if abs(it["y"] - avg_y) < y_threshold:
                line.append(it)
                placed = True
                break
        if not placed:
            lines.append([it])
            
    # Sort lines from top to bottom
    lines.sort(key=lambda line: -(sum(x["y"] for x in line) / len(line)))
    
    result_lines: List[str] = []
    for line in lines:
        line.sort(key=lambda x: x["x"])
        joined = " ".join(x["text"].strip() for x in line if x["text"].strip())
        if joined:
            result_lines.append(joined)
            
    return result_lines

def format_page_html(lines: List[str], side_label: str = "") -> str:
    """
    Renders clean lines into rich semantic HTML:
    - Major headings: `1.`, `가.`, large section numbers
    - Subheadings: `(1)`, `1)`
    - Bullet list lines: `•`, `-`, `①`, `㉠`, `가)`
    - Historical document boxes: `[사료탐구]`, `[자료탐구]`
    """
    html_parts = []
    in_saryo = False
    saryo_title = ""
    saryo_body: List[str] = []
    
    for txt in lines:
        is_saryo_head = False
        if ("사료" in txt or "자료" in txt) and any(kw in txt for kw in ["탐구", "읽기", "분석", "비교", "살펴보기", "사료 1", "사료 2", "사료 3", "자료 1"]):
            is_saryo_head = True
        elif txt.startswith("[사료") or txt.startswith("[자료") or txt.endswith("사료]") or txt.endswith("자료]"):
            is_saryo_head = True
            
        if is_saryo_head:
            if in_saryo:
                html_parts.append(render_saryo_box(saryo_title, saryo_body))
                saryo_body = []
            in_saryo = True
            saryo_title = txt.strip("[] ")
            continue
            
        # Detect section break that concludes an open saryo box
        is_new_section = False
        if any(txt.startswith(p) for p in ["1.", "2.", "3.", "4.", "5.", "(1)", "(2)", "(3)", "①", "②", "③"]):
            is_new_section = True
            
        if in_saryo and is_new_section:
            html_parts.append(render_saryo_box(saryo_title, saryo_body))
            in_saryo = False
            saryo_title = ""
            saryo_body = []
            
        if in_saryo:
            saryo_body.append(txt)
            continue
            
        # Major heading
        if re.match(r"^[0-9]\.\s+", txt) or re.match(r"^[가-하]\.\s+", txt) or re.match(r"^[0-9]\s+[가-힣]{2,}", txt):
            html_parts.append(f'<h4 style="color:#0f172a; margin:16px 0 8px 0; font-size:1.1rem; font-weight:700; border-bottom:1px solid #e2e8f0; padding-bottom:4px;">{escape(txt)}</h4>')
        # Subheading
        elif re.match(r"^\([0-9]+\)\s*", txt) or re.match(r"^[0-9]\)\s*", txt) or re.match(r"^\([가-하]\)\s*", txt):
            html_parts.append(f'<h5 style="color:#0369a1; margin:12px 0 6px 0; font-size:1.02rem; font-weight:600;">{escape(txt)}</h5>')
        # Bullet list item
        elif any(txt.startswith(p) for p in ["•", "-", "·", "①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩", "㉠", "㉡", "㉢", "㉣", "㉤", "가)", "나)", "다)"]):
            html_parts.append(f'<p class="list-line" style="margin-bottom:6px; padding-left:14px; border-left:2px solid #38bdf8; line-height:1.65; color:#1e293b;">{escape(txt)}</p>')
        # Body line
        else:
            html_parts.append(f'<p class="body-line" style="margin-bottom:6px; line-height:1.7; color:#334155;">{escape(txt)}</p>')
            
    if in_saryo:
        html_parts.append(render_saryo_box(saryo_title, saryo_body))
        
    return "\n".join(html_parts)

def render_saryo_box(title: str, lines: List[str]) -> str:
    content = " ".join(lines)
    return f"""<div class="historical-box" style="background:#f8fafc; border-left:4px solid #3b82f6; padding:12px 16px; margin:12px 0; border-radius:6px;">
  <p style="margin:4px 0; color:#1e293b; font-size:0.95rem; font-weight:700;"><strong>[사료탐구] {escape(title)}</strong></p>
  <p style="margin:4px 0; color:#334155; font-size:0.92rem; line-height:1.65;">{escape(content)}</p>
</div>"""
