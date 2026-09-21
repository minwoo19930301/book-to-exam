import { onRequestPost as score } from "./score.js";
import { json } from "../_lib/grade.js";
export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    return score({ ...context, request: new Request(context.request.url, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, mode: "temp" }),
    }) });
  } catch { return json({ error: "잘못된 요청입니다." }, 400); }
}
