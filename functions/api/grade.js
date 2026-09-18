import { gradeBody, json } from "../_lib/grade.js";

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "POST,OPTIONS",
    },
  });
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const graded = await gradeBody(body, context.env, { requireKey: true });
    return json(graded);
  } catch (err) {
    return json({ error: String(err.message || err) }, 500);
  }
}
