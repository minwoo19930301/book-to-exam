import { listModels } from "../_lib/models.js";
import { json } from "../_lib/grade.js";

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const models = await listModels(body.provider || "gemini", body.apiKey);
    if (!models.length) throw new Error("이 키로 쓸 수 있는 모델이 없습니다.");
    return json({ models });
  } catch (error) {
    return json({ error: error.message || "모델 목록을 가져오지 못했습니다." }, 400);
  }
}
