#!/usr/bin/env python3
"""Import existing HTML transcription into a traceable, dependency-free history KB.

This is not OCR or scan reconstruction. Imported text and page labels remain
unverified; all automatic topic/exam links are retrieval candidates only.
"""
from __future__ import annotations

import argparse
from collections import Counter
from dataclasses import dataclass, field
from hashlib import sha256
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import subprocess
from urllib.parse import quote
from figures import attach_figures, load_figures

ROOT = Path(__file__).resolve().parents[2]
REPO = "https://github.com/chaeeun-kim-teacher/smart-textbooks"
SUBJECTS = {"seoyangsa": "서양사", "hanguksa": "한국사", "dongyangsa": "동양사", "gyoyukron": "역사교육론"}
KNOWN_ISSUES = {
    "dongyangsa-textbook-page-165": [{
        "id": "lin-fu-transcription", "status": "known-discrepancy", "quote": "순무 일부",
        "note": "포르투갈과의 교역 허용을 건의한 인물은 중국어 사료의 林富(임부)입니다. 전사의 '일부'를 인명 정답으로 사용하지 않습니다.",
        "referenceUrl": "https://www.macaudata.mo/macaubook/book256/html/007001.htm", "referenceTitle": "마카오 문헌 · 명산장 12.2 林富의 교역 건의",
    }, {
        "id": "xiangshan-ao-transcription", "status": "known-discrepancy", "quote": "랑산오(마카오)",
        "note": "중국어 사료는 香山澳(향산오)로 적습니다. '랑산오'는 전사 오류이며 이 표기를 정답으로 요구하는 문항은 사용하지 않습니다.",
        "referenceUrl": "https://www.macaudata.mo/macaubook/book256/html/007001.htm", "referenceTitle": "마카오 문헌 · 명산장 12.2 香山澳 교역",
    }],
    "hanguksa-textbook-page-8": [{
        "id": "byeon-office-1416", "status": "known-discrepancy", "quote": "영중추부사(領中樞府事) 변계량(卞季良)이 상서(上書)하였다.",
        "note": "이 상소의 태종 16년 6월 1일 실록 기사는 변계량의 관직을 경승부 윤(敬承府尹)으로 적습니다. 가져온 전사의 관직 표기는 출제 근거에서 제외합니다.",
        "referenceUrl": "https://sillok.history.go.kr/id/kca_11606001_002", "referenceTitle": "조선왕조실록 · 태종 16년 6월 1일 변계량 상소",
    }],
    "hanguksa-textbook-page-97": [{
        "id": "eumyang-council-transcription", "status": "known-discrepancy", "quote": "응방의의소(鷹坊擬議所)",
        "note": "인종 9년 6월 향도 관련 기사의 기관명은 한국사데이터베이스에서 음양회의소(陰陽會議所)로 확인됩니다. 전사의 응방의의소 표기는 정답 근거에서 제외합니다.",
        "referenceUrl": "https://db.history.go.kr/id/kr_085r_0010_0010_0020_0320", "referenceTitle": "국사편찬위원회 · 고려사 권85 향도 기사",
    }],
    "hanguksa-textbook-page-73": [{
        "id": "gwon-jik-transcription", "status": "known-discrepancy", "quote": "권식(權直)",
        "note": "서경 천도 추진 기사에 등장하는 시중의 이름은 권직(權直)입니다. 같은 한자를 권식으로 적은 전사는 정답 근거에서 제외합니다.",
        "referenceUrl": "https://db.history.go.kr/id/kj_002r_0020_0050_0020", "referenceTitle": "국사편찬위원회 · 고려사절요 정종 4년 3월",
    }, {
        "id": "jeongjong-article-year", "status": "known-discrepancy", "quote": "『고려사절요』 정종 2년",
        "note": "정종의 사망과 서경 천도 추진을 회고하는 해당 기사는 정종 4년(949) 3월에 수록되어 있습니다. 전사 말미의 정종 2년 표기는 출제 근거에서 제외합니다.",
        "referenceUrl": "https://db.history.go.kr/id/kj_002r_0020_0050_0020", "referenceTitle": "국사편찬위원회 · 고려사절요 정종 4년 3월",
    }],
    "dongyangsa-textbook-page-241": [{
        "id": "ryukyu-capital-naha", "status": "known-discrepancy", "quote": "류큐의 수도 나하",
        "note": "류큐 왕국의 왕도 슈리와 무역항 나하를 구별해야 합니다. 오키나와현 공식 안내는 슈리성을 왕국의 중심, 나하를 교역항으로 설명합니다. 원문은 보존하되 이 구절은 출제 근거에서 제외합니다.",
        "referenceUrl": "https://www.pref.okinawa.lg.jp/kyoiku/kodomo/1002705/1002706.html", "referenceTitle": "오키나와현 공식 · 역사 개요",
    }],
    "seoyangsa-textbook-page-234": [{
        "id": "fdr-election-date", "status": "known-discrepancy", "quote": "루스벨트 당선(1933)",
        "note": "원문의 당선 연도는 오류가 의심됩니다. FDR은 1932년 대통령 선거에서 당선되었고 1933년 취임했습니다. 가져온 원문은 보존하며 이 구절은 출제 근거에서 제외합니다.",
        "referenceUrl": "https://www.fdrlibrary.org/fdr-presidency", "referenceTitle": "Franklin D. Roosevelt Presidential Library · FDR's Presidency",
    }],
    "seoyangsa-textbook-page-246": [{
        "id": "berlin-blockade-end-month", "status": "known-discrepancy", "quote": "1949. 6. 봉쇄 해제",
        "note": "베를린 봉쇄 해제는 1949년 5월입니다. 원문의 6월 표기는 정답 근거에서 제외합니다.",
        "referenceUrl": "https://history.state.gov/milestones/1945-1952/berlin-airlift", "referenceTitle": "미 국무부 역사실 · The Berlin Airlift",
    }],
    "gyoyukron-textbook-page-81": [{
        "id": "primary-secondary-time-only", "status": "oversimplification", "quote": "역사적 사실이 일어났던 때와 같은 시대에 만들어졌는가의 여부에 따라 1·2차 사료로 구분(동시대성)",
        "note": "1·2차 사료는 제작 시기만으로 구분할 수 없습니다. 나중에 작성된 회고록·구술 증언도 당사자의 직접 경험 자료가 될 수 있으며 연구 질문과 자료의 관계를 함께 보아야 합니다.",
        "referenceUrl": "https://ask.loc.gov/faq/303148", "referenceTitle": "미 의회도서관 · What is a primary source?",
    }],
}
for _page in (273, 275):
    KNOWN_ISSUES[f"dongyangsa-textbook-page-{_page}"] = [{
        "id": "japan-land-reform-share", "status": "known-discrepancy", "quote": "전체 농지의 80%",
        "note": "일본 농림수산성 자료의 매수 농지 비율은 전체의 약 3할이며, 소작지 비율은 46%에서 10%로 감소한 것으로 설명됩니다. '전체 농지의 80%'는 분모가 혼동된 수치이므로 출제 근거에서 제외합니다.",
        "referenceUrl": "https://www.maff.go.jp/j/keiei/koukai/kaikaku/pdf/kaisei_sh.pdf", "referenceTitle": "일본 농림수산성 · 농지제도의 변천",
    }]
BLOCK = {"p", "div", "section", "li", "h1", "h2", "h3", "h4", "h5", "h6", "tr", "br", "hr"}
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}
STOP = set("대한 위한 통해 관련 역사 내용 다음 경우 당시 이후 이전 이를 그는 또는 그리고 그러나 특히 가운데 따른 위해 모든 여러 주로 중심 주요 특징 설명 정리 문제 학년도 전공 역사교육론 서양사 한국사 동양사 기출 학습 자료 사료 정치 경제 사회 문화 중요 확립 전개 발전 변화 시작 실시 국가 시대 수업 학생 교사 제시 한다 하였다 되었다 있었다 것이다 있는 대한 것으로 것을 통해서 된다 있습니다 쓰시오 서술하시오 괄호 밑줄 공통 들어갈".split())
STOP.update("전쟁 조약 개혁 협약 교육 평가 지식 방법 이해 배경 영향 결과 과정 의미 성격 체제 권력 왕조 제도 정책 조직 사건 활동 원인 목표 관계 수립 형성 발달 성립 통합 통치 행정 군사 경제적 정치적 사회적 문화적 역사적 역사학 국제 교육과정 역사교육 역사수업 학습자 교과서 새로운 일반적 구체적 실질적 종교개혁 산업혁명 근대국가 민족주의 민주주의 자유주의 전체 근대 현대 고대 중세 중국 일본 유럽 영국 프랑스 러시아 미국 운동 농민 시민 노동자 조선 고려 신라 사건명 제국주의 한국전쟁 들어갈 해당하는 고려하여 나타난".split())


@dataclass
class Node:
    tag: str
    attrs: dict = field(default_factory=dict)
    children: list = field(default_factory=list)

    def has(self, cls):
        return cls in self.attrs.get("class", "").split()

    def find(self, *, cls=None, tag=None):
        found = []
        for child in self.children:
            if not isinstance(child, Node):
                continue
            if (cls is None or child.has(cls)) and (tag is None or child.tag == tag):
                found.append(child)
            found.extend(child.find(cls=cls, tag=tag))
        return found

    def text(self):
        def walk(n):
            if isinstance(n, str):
                return n
            if n.tag in {"script", "style"}:
                return ""
            val = "".join(walk(c) for c in n.children)
            return "\n" + val + "\n" if n.tag in BLOCK else val
        lines = [re.sub(r"[\t \u00a0]+", " ", line).strip() for line in walk(self).splitlines()]
        return "\n".join(line for line in lines if line)

    def first_text(self, cls):
        matches = self.find(cls=cls)
        return matches[0].text() if matches else ""


class DOM(HTMLParser):
    def __init__(self, text):
        super().__init__(convert_charrefs=True)
        self.root = Node("root")
        self.stack = [self.root]
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        node = Node(tag, dict(attrs))
        self.stack[-1].children.append(node)
        if tag not in VOID:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i].tag == tag:
                del self.stack[i:]
                break

    def handle_data(self, data):
        self.stack[-1].children.append(data)


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")


def source_for(path, commit, anchor, page_label, kind, *, viewer_base=None):
    source = {
        "repo": REPO, "commit": commit, "path": path, "anchor": anchor,
        "url": f"{REPO}/blob/{commit}/{quote(path)}#{quote(anchor)}",
        "rawUrl": f"https://raw.githubusercontent.com/chaeeun-kim-teacher/smart-textbooks/{commit}/{quote(path)}",
        "pageLabel": page_label, "kind": kind,
        "textStatus": "imported-unverified", "scanVerified": False,
        "pageMappingStatus": "source-label-unverified",
    }
    if re.fullmatch(r"\d+[–—\-~]?\d*쪽", page_label):
        source["printedPages"] = [int(x) for x in re.findall(r"\d+", page_label)]
    if viewer_base:
        source["viewerUrl"] = f"{viewer_base.rstrip('/')}/{quote(path)}#{quote(anchor)}"
    return source


def outer_wrappers(card):
    """Preserve each text subtree exactly once even with nested wrappers."""
    out = []
    def walk(node):
        for child in node.children:
            if not isinstance(child, Node):
                continue
            if child.has("raw-text-wrapper"):
                out.append(child)
            else:
                walk(child)
    walk(card)
    return out


def quality_flags(text, title):
    flags = []
    if len(text) < 100:
        flags.append("short-text")
    if re.search(r"표지|머리말|차례|저자 소개|편저자|판권", title):
        flags.append("front-matter")
    if re.search(r"�|OCR|판독\s*불가|인식\s*불가|확인\s*필요|복원\s*필요|텍스트\s*없음", text, re.I):
        flags.append("source-noise-or-placeholder")
    lines = text.splitlines()
    if len(lines) > 8 and len(set(lines)) < len(lines) * .7:
        flags.append("repeated-lines")
    if len(re.findall(r"[a-zA-Z]", text)) > max(100, len(text) * .25):
        flags.append("high-latin-share-review")
    return {"reviewStatus": "needs-review", "flags": flags, "automaticExamEligible": False,
            "note": "휴리스틱 경고는 OCR 정확도 점수가 아닙니다. 경고가 없어도 원본 검수 전입니다."}


def source_chapters(dom):
    mapping, chapter = {}, ""
    for n in dom.find():
        if n.has("toc-chapter-header"):
            chapter = n.text()
        elif n.has("toc-item") and n.attrs.get("href", "").startswith("#"):
            mapping[n.attrs["href"][1:]] = chapter
    return mapping


def extract_notes(path, subject, kind, commit, viewer_base=None):
    dom = DOM(path.read_text()).root
    chapter_map = source_chapters(dom)
    result = []
    for card in dom.find(cls="book-page-card"):
        wrappers = outer_wrappers(card)
        # Image-only cards are not presented as extracted source text.
        if not wrappers or not any(w.text() for w in wrappers):
            continue
        anchor = card.attrs.get("id")
        if not anchor:
            raise ValueError(f"Source card without locator: {path}")
        source = source_for(path.name, commit, anchor, card.first_text("page-badge"), kind, viewer_base=viewer_base)
        headings = []
        for w in wrappers:
            for h in w.find():
                if h.tag in {"h3", "h4", "h5", "h6"} and h.text():
                    headings.append(h.text())
        text = "\n\n".join(w.text() for w in wrappers if w.text())
        images = card.find(tag="img")
        source["imagePaths"] = [i.attrs["src"] for i in images if i.attrs.get("src")]
        source["textSha256"] = sha256(text.encode()).hexdigest()
        source["knownIssues"] = KNOWN_ISSUES.get(f"{subject}-{kind}-{anchor}", [])
        result.append({
            "id": f"{subject}-{kind}-{anchor}", "subject": subject, "kind": kind,
            "title": card.first_text("page-title") or anchor,
            "text": text, "html": "", "sourceUrl": source.get("viewerUrl", source["url"]),
            "source": source, "headings": list(dict.fromkeys(headings)),
            "chapter": chapter_map.get(anchor) or card.first_text("page-chapter-tag"),
            "pageLabels": [n.text() for n in card.find(cls="spread-label")],
            "quality": quality_flags(text, card.first_text("page-title")),
        })
    return result, dom


def extract_kice(path, commit, viewer_base=None):
    notes, dom = extract_notes(path, "kice", "exam", commit, viewer_base)
    tracked = set(subprocess.check_output(["git", "-C", str(path.parent), "-c", "core.quotepath=false", "ls-tree", "-r", "--name-only", commit, "--", "임용기출_평가원"], text=True).splitlines())
    documents = {}
    for section in dom.find(cls="doc-break"):
        attrs = section.attrs
        links = section.find(tag="a")
        pdf = next((a.attrs.get("href") for a in links if a.attrs.get("href", "").endswith(".pdf")), None)
        documents[attrs["data-doc"]] = {
            "id": attrs["data-doc"], "year": attrs.get("data-year"), "round": attrs.get("data-round"),
            "paper": attrs.get("data-paper"), "pdfPath": pdf,
            "pdfUrl": f"{REPO}/blob/{commit}/{quote(pdf)}" if pdf in tracked else None,
            "pdfAvailability": "tracked-in-source-repo" if pdf in tracked else "referenced-but-not-in-source-repo",
            "sourceUrl": f"{REPO}/blob/{commit}/{quote(path.name)}#{quote(attrs['id'])}",
            "anchor": attrs["id"],
        }
    cards = {c.attrs.get("id"): c for c in dom.find(cls="book-page-card")}
    for n in notes:
        card = cards[n["source"]["anchor"]]
        doc = documents[card.attrs["data-doc"]]
        n["document"] = doc
        n["title"] = f'{doc["year"]}학년도 {doc["round"]} {doc["paper"]} · {n["source"]["pageLabel"]}'
        # Keep document/page chunks: multi-column PDF extraction is not a reliable
        # automatic question-boundary detector. Never imply complete question text.
        n["recordType"] = "exam-page-excerpt"
        n["questionNumbers"] = []
        n["questionNumbersStatus"] = "not-segmented"
        n["source"]["extractionCaveat"] = "기존 PDF 추출 HTML의 면 단위 텍스트. 문항 경계·다단 순서·도표·정답은 검증하지 않음."
    return notes, list(documents.values())


def terms(text):
    words = re.findall(r"[가-힣]{2,}|[A-Za-z]{3,}", text.lower())
    def distinctive(w):
        stem = re.sub(r"(에서|에게|으로|부터|까지|처럼|보다|에는|에서는|과|와|의|을|를|은|는|이|가)$", "", w)
        return w not in STOP and stem not in STOP and len(w) >= 3
    return {w for w in words if distinctive(w)}






def concept_exam_refs(term, exams):
    # Full curated phrase only. Whitespace and the explicit possessive
    # connector in a term such as '솔론의 개혁' can vary; no inferred aliases.
    variants = {re.sub(r"\s+", "", term).casefold(), re.sub(r"\s+", "", term.replace("의 ", " ")).casefold()}
    refs = []
    for e in sorted(exams, key=lambda x: (-int(x["document"]["year"]), x["id"])):
        normalized, positions = [], []
        for i, ch in enumerate(e["text"]):
            if not ch.isspace():
                normalized.append(ch.casefold())
                positions.append(i)
        normalized = "".join(normalized)
        variant = next((v for v in sorted(variants) if v in normalized), None)
        if variant is None:
            continue
        begin = positions[normalized.index(variant)]
        start = max(0, begin - 80)
        refs.append({"id": e["id"], "title": e["title"], "url": e["sourceUrl"], "matchStatus": "candidate", "matchMethod": "normalized-concept-term", "matchedTerms": [term], "matchedNormalizedTerm": variant, "excerpt": e["text"][start:start + 420], "documentId": e["document"]["id"], "pageLabel": e["source"]["pageLabel"]})
        if len(refs) == 3:
            break
    return refs








def build(source_root, output_root=ROOT, viewer_base=None):
    commit = subprocess.check_output(["git", "-C", str(source_root), "rev-parse", "HEAD"], text=True).strip()
    data = output_root / "public/data"
    knowledge = output_root / "knowledge"
    knowledge.mkdir(parents=True, exist_ok=True)
    figures = load_figures(output_root)
    kice_path = source_root / "평가원_역사기출_스마트_교재뷰어.html"
    exams, documents = extract_kice(kice_path, commit, viewer_base)
    attach_figures(exams, figures)
    write_json(data / "subjects/kice/pages.json", exams)
    write_json(data / "subjects/kice/documents.json", documents)
    source_files, manifest, all_notes = [kice_path], [], []
    for subject, title in SUBJECTS.items():
        notes = []
        for kind, suffix in [("textbook", ""), ("gichul", "기출")]:
            path = source_root / f"{title}{suffix}_스마트_교재뷰어.html"
            source_files.append(path)
            part, _ = extract_notes(path, subject, kind, commit, viewer_base)
            notes.extend(part)
        attach_figures(notes, figures)
        subject_dir = data / "subjects" / subject
        write_json(subject_dir / "notes.json", notes)
        for name in ["facts", "questions", "blanks", "essays"]:
            if not (subject_dir / f"{name}.json").exists():
                write_json(subject_dir / f"{name}.json", [])
        actual = {name: len(json.loads((subject_dir / f"{name}.json").read_text())) for name in ["facts", "questions", "blanks", "essays"]}
        manifest.append({"id": subject, "title": title, "description": f"{title} 교재와 그림을 읽고 근거가 있는 문제로 연습합니다.", "dataPath": f"/data/subjects/{subject}", "counts": {"notes": len(notes), "concepts": actual["facts"], "questions": actual["questions"], "blanks": actual["blanks"], "essays": actual["essays"]}, "sourceStatus": "imported-unverified"})
        all_notes.extend(notes)
    memo_path = data / "notes.json"
    memo_notes = json.loads(memo_path.read_text()) if memo_path.exists() else []
    if memo_notes:
        actual = {name: len(json.loads((data / f"{name}.json").read_text())) for name in ["facts", "questions", "blanks", "essays"]}
        manifest.insert(0, {"id": "hand-memo", "title": "손글씨 메모", "description": "손글씨 메모와 문제로 복습합니다.", "dataPath": "/data", "counts": {"notes": len(memo_notes), "concepts": actual["facts"], "questions": actual["questions"], "blanks": actual["blanks"], "essays": actual["essays"]}, "sourceStatus": "existing-app-transcription-unverified"})
    write_json(data / "subjects.json", manifest)
    file_stats = []
    for p in source_files:
        cards = DOM(p.read_text()).root.find(cls="book-page-card")
        text_cards = [c for c in cards if any(w.text() for w in outer_wrappers(c))]
        text_ids = {id(c) for c in text_cards}
        missing = [c for c in cards if id(c) not in text_ids]
        file_stats.append({"path": p.name, "sha256": sha256(p.read_bytes()).hexdigest(), "cards": len(cards), "importedTextCards": len(text_cards), "imageOnlyCards": sum(bool(c.find(tag="img")) for c in missing), "nonTextIndexCards": sum(not c.find(tag="img") for c in missing)})
    flag_counts = Counter(f for n in all_notes + exams for f in n["quality"]["flags"])
    write_json(knowledge / "source-manifest.json", {
        "schemaVersion": 2, "repo": REPO, "commit": commit,
        "sourceStatus": "imported-unverified", "scanVerified": False, "files": file_stats,
        "counts": {"newSubjects": len(SUBJECTS), "notes": len(all_notes), "handMemoNotes": len(memo_notes), "examDocumentIndexEntries": len(documents), "examPdfFilesPresent": sum(d["pdfUrl"] is not None for d in documents), "examPageExcerpts": len(exams)},
        "quality": {"reviewStatus": "needs-review", "flagCounts": dict(sorted(flag_counts.items())), "knownIssues": KNOWN_ISSUES, "automaticSourceExamEligibility": False},
        "questionBoundaryVerified": False, "examAnswerVerified": False,
    })
    # Raw transcriptions are data. Only hand-selected compact Markdown becomes KB.
    if any((knowledge / "compact").glob("*/*.md")):
        from compact import compile_kb
        compile_kb(output_root)
    return manifest


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--source", type=Path, required=True, help="smart-textbooks checkout")
    p.add_argument("--output", type=Path, default=ROOT)
    p.add_argument("--viewer-base", help="Optional verified deployed viewer base URL")
    args = p.parse_args()
    result = build(args.source, args.output, args.viewer_base)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
