const tools = [
  { name: "list_notes", description: "손글씨 메모 제목 목록" },
  { name: "get_note", description: "메모 한 장의 본문. arguments.id 예: p9" },
  { name: "list_essays", description: "서술형 문항과 채점 기준" },
  { name: "get_essay", description: "서술형 한 문항. arguments.id 예: e5" },
];

async function load(request, path) {
  const r = await fetch(new URL(path, request.url));
  if (!r.ok) throw new Error(path);
  return r.json();
}

async function call(request, name, args = {}) {
  if (name === "list_notes") {
    const notes = await load(request, "/data/notes.json");
    return notes.map((n) => ({ id: n.id, title: n.title }));
  }
  if (name === "get_note") {
    const notes = await load(request, "/data/notes.json");
    const n = notes.find((x) => x.id === args.id);
    if (!n) throw new Error("없는 쪽");
    return { id: n.id, title: n.title, text: n.text };
  }
  if (name === "list_essays" || name === "get_essay") {
    const essays = await load(request, "/data/essays.json");
    if (name === "list_essays") return essays;
    const e = essays.find((x) => x.id === args.id);
    if (!e) throw new Error("없는 문항");
    return e;
  }
  throw new Error("unknown tool");
}

export async function onRequestGet() {
  return Response.json({
    name: "sonnote",
    title: "손노트",
    tools,
    grade: "POST /api/grade  { provider, apiKey, essay, answer }",
  });
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const name = body.name || body.tool;
    const args = body.arguments || body.args || {};
    const result = await call(context.request, name, args);
    return Response.json({ ok: true, result });
  } catch (err) {
    return Response.json({ ok: false, error: String(err.message || err) }, { status: 400 });
  }
}
