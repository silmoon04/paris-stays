import { build } from "vite";
import {
  readFile,
  writeFile,
  mkdir,
  copyFile,
  readdir,
} from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
await build({ root, publicDir: false });
const data = JSON.parse(
  await readFile(path.join(root, "public/data/search.json"), "utf8"),
);
await mkdir(path.join(root, "dist/data/details"), { recursive: true });
await writeFile(path.join(root, "dist/data/search.json"), JSON.stringify(data));
for (const s of data.stays) {
  if (!/^\d{1,25}$/.test(s.id)) throw new Error("Invalid listing ID");
  const file = `${s.id}.json`;
  const detail = JSON.parse(
    await readFile(path.join(root, "public/data/details", file), "utf8"),
  );
  await writeFile(
    path.join(root, "dist/data/details", file),
    JSON.stringify(detail),
  );
}
await copyFile(
  path.join(root, "public/favicon.svg"),
  path.join(root, "dist/favicon.svg"),
);
await writeFile(path.join(root, "dist/.nojekyll"), "");
await import("./verify-release.mjs");
