import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Dev only: serve web/api/*.ts at /api/* so `npm run dev` works without `vercel dev`.
// Production uses Vercel's function runtime with the same `{ fetch }` handlers.
function devApi(): Plugin {
  return {
    name: "dev-api",
    configureServer(server) {
      Object.assign(process.env, loadEnv(server.config.mode, server.config.envDir || process.cwd(), ""));
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        const route = url.pathname.match(/^\/api\/([\w-]+(?:\/[\w-]+)*)$/)?.[1];
        if (!route || route.split("/").some((part) => part.startsWith("_"))) return next();
        try {
          const mod = await server.ssrLoadModule(`/api/${route}.ts`);
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          const hasBody = req.method !== "GET" && req.method !== "HEAD";
          const request = new Request(url, {
            method: req.method,
            headers: req.headers as Record<string, string>,
            body: hasBody ? Buffer.concat(chunks) : undefined,
          });
          const response: Response = await mod.default.fetch(request);
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (e) {
          server.config.logger.error(String(e));
          res.statusCode = 500;
          res.end("API error");
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), devApi()],
  resolve: {
    alias: {
      // See src/shims/solana-program-system.ts
      "@solana-program/system": fileURLToPath(new URL("./src/shims/solana-program-system.ts", import.meta.url)),
    },
  },
});
