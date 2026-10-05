// Search only the current subject's supplied notes. Query text is never compiled
// as a regular expression: % joins literal pieces matched in order by indexOf.
export function normalizeSearchText(value) {
  return String(value ?? '').normalize('NFC').toLowerCase().replace(/\s+/gu, '');
}

function searchable(value) {
  const text = String(value ?? '').normalize('NFC');
  let normalized = '';
  const starts = [], ends = [];
  let offset = 0;
  for (const character of text) {
    const folded = character.toLowerCase();
    if (!/\s/u.test(character)) {
      normalized += folded;
      for (let i = 0; i < folded.length; i++) { starts.push(offset); ends.push(offset + character.length); }
    }
    offset += character.length;
  }
  return { text, normalized, starts, ends };
}

export function noteLocation(note, index) {
  const kind = note.kind || note.source?.kind;
  const collection = kind === 'gichul' ? '기출' : kind === 'textbook' ? '교재' : '메모';
  const pages = note.source?.pageLabel || (note.source?.printedPages?.length ? `${note.source.printedPages.join('·')}쪽` : null);
  return `${collection} · ${pages || `자료 ${index + 1}`}`;
}

export function buildViewerIndex(notes) {
  return notes.map((note, index) => ({ note, index, location: noteLocation(note, index), title: searchable(note.title), body: searchable(note.text) }));
}

function findPattern(field, pieces) {
  if (!pieces.length) return [];
  const ranges = [];
  let cursor = 0;
  for (const piece of pieces) {
    const start = field.normalized.indexOf(piece, cursor);
    if (start < 0) return null;
    const end = start + piece.length;
    ranges.push([field.starts[start], field.ends[end - 1]]);
    cursor = end;
  }
  return ranges;
}

function mergeRanges(ranges) {
  const merged = [];
  for (const range of [...ranges].sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([...range]);
  }
  return merged;
}

function snippets(field, ranges) {
  const windows = [];
  for (const [start, end] of ranges.length ? ranges : [[0, 0]]) {
    const a = Math.max(0, start - 40), b = Math.min(field.text.length, Math.max(start + 110, end + 35));
    const last = windows[windows.length - 1];
    if (last && a <= last[1] && b - last[0] <= 230) last[1] = Math.max(last[1], b);
    else if (!last || start >= last[1]) windows.push([a, b]);
    if (windows.length >= 3) break;
  }
  return windows.map(([start, end]) => ({
    text: field.text.slice(start, end), before: start > 0, after: end < field.text.length,
    ranges: ranges.filter(([a, b]) => a < end && b > start).map(([a, b]) => [Math.max(0, a - start), Math.min(end, b) - start]),
  }));
}

export function searchViewerNotes(index, query) {
  const terms = [...new Set(String(query ?? '').trim().normalize('NFC').split(/\s+/u).filter(Boolean))]
    .map(term => term.split('%').map(normalizeSearchText).filter(Boolean));
  if (!terms.length) return [];
  const results = [];
  for (const row of index) {
    const titleRanges = [], bodyRanges = [];
    let matches = true;
    for (const pieces of terms) {
      const title = findPattern(row.title, pieces), body = findPattern(row.body, pieces);
      if (title === null && body === null) { matches = false; break; }
      if (title) titleRanges.push(...title);
      if (body) bodyRanges.push(...body);
    }
    if (!matches) continue;
    const body = mergeRanges(bodyRanges);
    results.push({ ...row, titleRanges: mergeRanges(titleRanges), snippets: snippets(row.body, body) });
  }
  return results;
}

export function highlightParts(text, ranges) {
  const parts = [];
  let offset = 0;
  for (const [start, end] of mergeRanges(ranges)) {
    if (start > offset) parts.push({ text: text.slice(offset, start), match: false });
    parts.push({ text: text.slice(start, end), match: true });
    offset = end;
  }
  if (offset < text.length) parts.push({ text: text.slice(offset), match: false });
  return parts;
}
