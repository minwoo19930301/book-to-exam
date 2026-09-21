import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Exercise the same Pages handlers in local previews, without embedding server data in the client bundle.
function localPages() {
  return { name: "local-pages-api", configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      const url = new URL(req.url, "http://127.0.0.1");
      const routes = { "/api/score": "/functions/api/score.js", "/api/models": "/functions/api/models.js", "/api/grade": "/functions/api/grade.js", "/api/grade-temp": "/functions/api/grade-temp.js" };
      const mcp = /^\/api\/mcp(?:\/([^/]+))?$/.exec(url.pathname);
      const modulePath = routes[url.pathname] || (mcp && "/functions/_lib/mcp.js");
      if (!modulePath) return next();
      try {
        const chunks = []; let length = 0;
        for await (const chunk of req) { length += chunk.length; if (length > 65536) { res.writeHead(413); res.end(); return; } chunks.push(chunk); }
        const host = req.headers.host || "127.0.0.1:4179";
        const request = new Request(`http://${host}${req.url}`, { method: req.method, headers: req.headers,
          ...(req.method !== "GET" && req.method !== "HEAD" ? { body: Buffer.concat(chunks) } : {}) });
        const module = await server.ssrLoadModule(modulePath);
        const context = { request, env: {}, params: { id: mcp?.[1] || "public" } };
        const response = mcp ? await module.handleMcp(context, context.params.id) : req.method === "POST" ? await module.onRequestPost(context) : new Response(null, { status: 405 });
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(Buffer.from(await response.arrayBuffer()));
      } catch (error) {
        res.writeHead(500, { "content-type": "application/json" }); res.end(JSON.stringify({ error: error.message }));
      }
    });
  } };
}
export default defineConfig({ plugins: [react(), localPages()], build: { outDir: "dist", emptyOutDir: true } });
