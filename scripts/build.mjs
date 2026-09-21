import { mkdir, cp, readFile, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {build} from "esbuild";

let dmoneyUrl=process.env.DMONEY_SUPABASE_URL||"",dmoneyKey=process.env.DMONEY_SUPABASE_ANON_KEY||"";
const localDmoneyEnv=resolve("C:/Users/ТИВИЩКА/Downloads/Приложения/dmoney/.env.local");
if((!dmoneyUrl||!dmoneyKey)&&existsSync(localDmoneyEnv)){
  const env=await readFile(localDmoneyEnv,"utf8");
  const value=(name)=>env.match(new RegExp(`^${name}=(.*)$`,"m"))?.[1]?.trim().replace(/^['\"]|['\"]$/g,"")||"";
  dmoneyUrl=value("NEXT_PUBLIC_SUPABASE_URL");
  dmoneyKey=value("NEXT_PUBLIC_SUPABASE_ANON_KEY");
}
if(dmoneyUrl&&dmoneyKey){
  await build({entryPoints:["src/cloud-client.js"],bundle:true,format:"esm",outfile:"dist/cloud.js",minify:true,plugins:[{name:"dmoney-config",setup(builder){builder.onLoad({filter:/dmoney-config\.js$/},()=>({contents:`export const DMONEY_URL=${JSON.stringify(dmoneyUrl)};export const DMONEY_ANON_KEY=${JSON.stringify(dmoneyKey)};`,loader:"js"}));}}]});
}else if(!existsSync("dist/cloud.js")){
  throw new Error("Set DMONEY_SUPABASE_URL and DMONEY_SUPABASE_ANON_KEY for the first cloud build.");
}
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
