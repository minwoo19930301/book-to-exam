import { describe, handleMcp } from "../_lib/mcp.js";

function mint() {
  return "bve_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function onRequestOptions() {
  return new Response(null, {
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "GET,POST,OPTIONS",
    },
  });
}

export async function onRequestGet(context) {
  const origin = new URL(context.request.url).origin;
  const id = mint();
  return Response.json({
    ...describe(id, origin),
    note: "임시 id를 붙인 주소를 MCP로 쓰세요. 예: " + origin + "/api/mcp/" + id,
  }, { headers: { "access-control-allow-origin": "*" } });
}

export async function onRequestPost(context) {
  const url = new URL(context.request.url);
  if (url.searchParams.get("create") === "1") {
    const origin = url.origin;
    const id = mint();
    return Response.json(describe(id, origin), { headers: { "access-control-allow-origin": "*" } });
  }
  return handleMcp(context, mint());
}
