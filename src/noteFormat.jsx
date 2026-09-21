function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function inline(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
}

function lineClass(raw) {
  const t = raw.trim();
  if (/^<[^>\n]+>/.test(t)) return "nh";
  if (t.startsWith("* ")) return "nh";
  if (t.startsWith("- ") || t.startsWith("※") || t.startsWith("▷") || t.startsWith("→")) return "nli";
  if (/^[①-⑳]/.test(t) || /^\d+[.)]/.test(t)) return "nnum";
  return "nl";
}

function pad(raw) {
  return Math.min((raw.match(/^ */)?.[0] || "").length, 16) * 7;
}

function cells(items) {
  const short = items.length >= 2 && items.every((it) => it.length < 40);
  const cls = short ? "note-grid" : "note-box";
  return `<div class="${cls}">${items.map((it) => `<div class="cell">${inline(it)}</div>`).join("")}</div>`;
}

function collectBrace(lines, start) {
  const line = lines[start];
  const idx = line.indexOf("{");
  const label = line.slice(0, idx).trim();
  const items = [];
  const rest = line.slice(idx + 1);
  let i = start;
  if (rest.includes("}")) {
    const inner = rest.replace(/\}.*$/, "").trim();
    if (inner) items.push(inner);
    return { label, items, next: i + 1 };
  }
  if (rest.trim()) items.push(rest.trim());
  i += 1;
  while (i < lines.length) {
    const L = lines[i];
    if (!L.trim()) {
      i += 1;
      break;
    }
    if (L.includes("{") && /^\s*[①-⑳*]/.test(L)) break;
    if (L.includes("}")) {
      const inner = L.replace(/\}.*/, "").trim();
      if (inner) items.push(inner);
      i += 1;
      break;
    }
    items.push(L.trim());
    i += 1;
  }
  return { label, items, next: i };
}

export function formatNote(text) {
  const lines = String(text || "").split("\n");
  const out = [];
  let i = 0;
  let defs = [];

  function flushDefs() {
    if (!defs.length) return;
    out.push(cells(defs.map((d) => d.replace(/^\*\s/, ""))));
    defs = [];
  }

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      flushDefs();
      out.push('<div class="nl gap"></div>');
      i += 1;
      continue;
    }
    if (/\*\*.+\*\*\s*[=:]/.test(line.trim()) && !line.includes("{")) {
      defs.push(line.trim());
      i += 1;
      continue;
    }
    flushDefs();
    if (line.includes("{")) {
      const g = collectBrace(lines, i);
      const box = cells(g.items);
      if (g.label) {
        out.push(`<div class="note-row"><div class="nh">${inline(g.label.replace(/^\*\s/, ""))}</div>${box}</div>`);
      } else {
        out.push(box);
      }
      i = g.next;
      continue;
    }
    if (/①/.test(line) && /②/.test(line) && /\s{2,}/.test(line)) {
      const parts = line.split(/(?=[①-⑳])/).map((s) => s.trim()).filter(Boolean);
      if (parts.length >= 2) {
        out.push(cells(parts));
        i += 1;
        continue;
      }
    }
    if (line.includes("↔")) {
      const parts = line.split("↔").map((s) => s.trim()).filter(Boolean);
      out.push(`<div class="note-grid split">${parts.map((p) => `<div class="cell nh">${inline(p)}</div>`).join("")}</div>`);
      i += 1;
      continue;
    }
    out.push(`<div class="${lineClass(line)}" style="padding-left:${pad(line)}px">${inline(line.replace(/^\*\s/, ""))}</div>`);
    i += 1;
  }
  flushDefs();
  return out.join("");
}
