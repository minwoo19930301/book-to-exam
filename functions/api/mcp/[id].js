import { handleMcp } from "../../_lib/mcp.js";

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
  return handleMcp(context, context.params.id);
}

export async function onRequestPost(context) {
  return handleMcp(context, context.params.id);
}
