import http from "node:http";
import { readFile, mkdir, readdir } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { scheduleApi } from "./src/api.js";
import { d1Adapter } from "./src/local-db.js";
await mkdir(".sites-runtime", { recursive: true });
const sqlite = new DatabaseSync(".sites-runtime/local.sqlite");
sqlite.exec(
  "CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY)",
);
for (const file of (await readdir("drizzle"))
  .filter((n) => n.endsWith(".sql"))
  .sort()) {
  if (
    !sqlite
      .prepare("SELECT name FROM local_migrations WHERE name = ?")
      .get(file)
  ) {
    sqlite.exec(await readFile("drizzle/" + file, "utf8"));
    sqlite.prepare("INSERT INTO local_migrations VALUES (?)").run(file);
  }
}
const db = d1Adapter(sqlite);
const root = resolve("dist");
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};
http
  .createServer(async (req, res) => {
    try {
      let path = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      );
      if (path === "/api/schedule") {
        let body = "";
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 1000000) {
            res.writeHead(413);
            res.end();
            return;
          }
        }
        const result = await scheduleApi(
          new Request("http://" + req.headers.host + req.url, {
            method: req.method,
            headers: req.headers,
            ...(req.method === "GET" ? {} : { body }),
          }),
          db,
          "local-denis",
        );
        res.writeHead(result.status, Object.fromEntries(result.headers));
        res.end(await result.text());
        return;
      }
      if (path.endsWith("/")) path += "index.html";
      let target = resolve(root, "." + path);
      if (!target.startsWith(root + sep)) {
        res.writeHead(403);
        res.end();
        return;
      }
      const file = await readFile(target);
      res.writeHead(200, {
        "Content-Type": mime[extname(target)] || "application/octet-stream",
        "Cache-Control": "no-cache",
      });
      res.end(file);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  })
  .listen(4173, "127.0.0.1", () => console.log("Local: http://127.0.0.1:4173"));
