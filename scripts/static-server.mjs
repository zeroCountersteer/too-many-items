import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".db": "application/vnd.sqlite3",
  ".sqlite": "application/vnd.sqlite3",
  ".wasm": "application/wasm",
  ".md": "text/markdown; charset=utf-8"
};

export function createStaticServer(rootDir = process.cwd()) {
  const root = path.resolve(rootDir);

  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === "/" || pathname === "") pathname = "/index.html";

      const filePath = path.resolve(root, `.${pathname}`);
      if (!filePath.startsWith(root)) {
        response.writeHead(403);
        response.end("forbidden");
        return;
      }

      const info = await stat(filePath);
      const resolved = info.isDirectory() ? path.join(filePath, "index.html") : filePath;
      const extension = path.extname(resolved).toLowerCase();
      response.writeHead(200, { "content-type": MIME_TYPES[extension] || "application/octet-stream" });
      createReadStream(resolved).pipe(response);
    } catch {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("not found");
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 8765);
  const host = process.env.HOST || "127.0.0.1";
  const server = createStaticServer();
  server.listen(port, host, () => {
    console.log(`Serving zeroCountersteer inventory at http://${host}:${port}/`);
  });
}
