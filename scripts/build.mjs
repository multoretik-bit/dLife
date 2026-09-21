import {build} from "esbuild";
await build({entryPoints:["src/cloud-client.js"],bundle:true,format:"esm",outfile:"dist/cloud.js",minify:true});
import { mkdir, cp, readFile, writeFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
const root = resolve("dist");
await mkdir("dist/client", { recursive: true });
await mkdir("dist/server", { recursive: true });
await mkdir("dist/.openai", { recursive: true });
for (const entry of await readdir(root, { withFileTypes: true })) {
  if (["client", "server", ".openai"].includes(entry.name)) continue;
  await cp(resolve(root, entry.name), resolve(root, "client", entry.name), {
    recursive: true,
  });
}
await cp(".openai/hosting.json", "dist/.openai/hosting.json");
await cp("drizzle", "dist/.openai/drizzle", { recursive: true });
await cp("src/worker.js", "dist/server/index.js");
await cp("dist/schedule.js", "dist/server/schedule.js");
await writeFile(
  "dist/server/api.js",
  (await readFile("src/api.js", "utf8")).replace(
    "../dist/schedule.js",
    "./schedule.js",
  ),
);
console.log("Built dLife client, Worker and migrations.");
