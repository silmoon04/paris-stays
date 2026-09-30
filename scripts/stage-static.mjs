import { copyFile, mkdir, readdir, readFile, lstat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
await import("./verify-release.mjs");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destination = path.join(root, ".private/pages-static");
async function copy(relative) {
  const source = path.join(root, "dist", relative);
  const target = path.join(destination, relative);
  const info = await lstat(source);
  if (info.isSymbolicLink()) throw new Error("Symlink in static release");
  if (info.isDirectory()) {
    await mkdir(target, { recursive: true });
    for (const name of await readdir(source)) await copy(path.join(relative, name));
  } else await copyFile(source, target);
}
await mkdir(destination, { recursive: true });
for (const name of ["assets", "data", "photos", "index.html", "favicon.svg", ".nojekyll"]) await copy(name);
const configs = [];
for (const file of ["dist/runtime.json", "public/runtime.json", ".private/pages-static/runtime.json"]) {
  try {
    const config = JSON.parse(await readFile(path.join(root, file), "utf8"));
    if (config.version === 1 && Number.isFinite(Date.parse(config.updatedAt)) &&
        (config.collectorUrl === null || /^https:\/\/(?!api\.)[a-z0-9-]+\.trycloudflare\.com$/.test(config.collectorUrl))) configs.push(config);
  } catch { /* An initial release may not have a previous runtime file. */ }
}
configs.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
if (!configs.length) throw new Error("No valid collector configuration");
await writeFile(path.join(destination, "runtime.json"), JSON.stringify(configs[0]) + "\n");
console.log("Staged the public static allowlist with the newest collector address. Pull gh-pages before staging; review and commit the staged checkout to publish.");
