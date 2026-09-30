import assert from "node:assert/strict";
import { readFile, readdir, mkdir, copyFile, lstat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
await import("./verify-release.mjs");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destination = path.join(root, ".private/pages-release");
const roots = ["src", "scripts", "tests"];
const allowed = [
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "vite.config.ts",
  "index.html",
  ".gitignore",
  "README.md",
  "DESIGN.md",
  "ASSETS.md",
  ".github/workflows/pages.yml",
  "public/favicon.svg",
  "src/assets/outfit-latin-variable.woff2",
  "src/assets/Outfit-OFL.txt",
  "src/assets/paris-stays-mark.png",
];
async function sourceFiles(folder) {
  for (const entry of await readdir(path.join(root, folder), {
    withFileTypes: true,
  })) {
    const relative = path.posix.join(folder, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "__pycache__") await sourceFiles(relative);
    } else if (/\.(ts|tsx|css|mjs|py)$/.test(entry.name))
      allowed.push(relative);
  }
}
for (const folder of roots) await sourceFiles(folder);
const forbidden = /apify_api_[A-Za-z0-9]+|gh[oprsu]_[A-Za-z0-9]{20,}/;
for (const relative of allowed) {
  const source = path.join(root, relative);
  assert.ok(!(await lstat(source)).isSymbolicLink());
  assert.ok(
    !forbidden.test(await readFile(source, "utf8")),
    "Credential in " + relative,
  );
  const target = path.join(destination, relative);
  assert.ok(target.startsWith(destination + path.sep));
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(source, target);
}
async function copyData(folder) {
  for (const entry of await readdir(path.join(root, "dist", folder), {
    withFileTypes: true,
  })) {
    const relative = path.posix.join(folder, entry.name);
    if (entry.isDirectory()) await copyData(relative);
    else {
      const target = path.join(destination, "public", relative);
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(path.join(root, "dist", relative), target);
      allowed.push("public/" + relative);
    }
  }
}
await copyData("data");
console.log(
  `Staged ${allowed.length} explicitly allowed source/data files in ${destination}. Raw responses, analysis images, credentials and personal records are excluded.`,
);
