const tools = [
  { name: "list_notes", description: "메모 제목 목록" },
  { name: "get_note", description: "메모 한 장. arguments.id 예: p9" },
  { name: "list_questions", description: "객관식·빈칸 문항 목록" },
  { name: "get_question", description: "문항 한 개. arguments.id 예: q1" },
  { name: "list_essays", description: "서술형 문항과 채점 기준" },
  { name: "get_essay", description: "서술형 한 문항. arguments.id 예: e5" },
  { name: "pick_random", description: "객관식·빈칸·서술형 한 문항씩 무작위" },
];

async function load(request, path) {
  const r = await fetch(new URL(path, request.url));
  if (!r.ok) throw new Error(path);
  return r.json();
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
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
  if (name === "list_questions") {
    const qs = await load(request, "/data/questions.json");
    return qs.map((q) => ({ id: q.id, type: q.type, prompt: q.prompt }));
  }
  if (name === "get_question") {
    const qs = await load(request, "/data/questions.json");
    const q = qs.find((x) => x.id === args.id);
    if (!q) throw new Error("없는 문항");
    return q;
  }
  if (name === "list_essays" || name === "get_essay") {
    const essays = await load(request, "/data/essays.json");
    if (name === "list_essays") return essays;
    const e = essays.find((x) => x.id === args.id);
    if (!e) throw new Error("없는 문항");
    return e;
  }
  if (name === "pick_random") {
    const [qs, essays] = await Promise.all([
      load(request, "/data/questions.json"),
      load(request, "/data/essays.json"),
    ]);
    return {
      mc: pick(qs.filter((q) => q.type === "mc")),
      blank: pick(qs.filter((q) => q.type === "blank")),
      essay: pick(essays),
    };
  }
  throw new Error("unknown tool");
}

export function describe(id, origin) {
  return {
    name: "bookvideotoexam",
    title: "BookVideoToExam",
    id,
    url: `${origin}/api/mcp/${id}`,
    tools,
    grade: "POST /api/grade  { provider, apiKey, items|essay, answer }",
    gradeTemp: "POST /api/grade-temp  { sessionId, items|essay, answer }",
  };
}

export async function handleMcp(context, id) {
  const origin = new URL(context.request.url).origin;
  if (context.request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "content-type",
        "access-control-allow-methods": "GET,POST,OPTIONS",
      },
    });
  }
  if (context.request.method === "GET") {
    return Response.json(describe(id, origin), { headers: { "access-control-allow-origin": "*" } });
  }
  try {
    const body = await context.request.json();
    const name = body.name || body.tool;
    const args = body.arguments || body.args || {};
    const result = await call(context.request, name, args);
    return Response.json({ ok: true, id, result }, { headers: { "access-control-allow-origin": "*" } });
  } catch (err) {
    return Response.json({ ok: false, id, error: String(err.message || err) }, {
      status: 400,
      headers: { "access-control-allow-origin": "*" },
    });
  }
}
