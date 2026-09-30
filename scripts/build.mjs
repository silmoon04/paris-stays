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
import { compactStay } from "./snapshot.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
await build({ root, publicDir: false });
const data = JSON.parse(
  await readFile(path.join(root, "public/data/search.json"), "utf8"),
);
let photoIndex = {};
try { photoIndex = JSON.parse(await readFile(path.join(root, "public/photo-index.json"), "utf8")); } catch { /* CDN fallback remains available. */ }
await mkdir(path.join(root, "dist/photos"), { recursive: true });
for (const filename of new Set(Object.values(photoIndex))) {
  if (!/^[a-f0-9]{24}\.(?:jpg|png|webp)$/.test(filename)) throw new Error("Invalid cached photo filename");
  await copyFile(path.join(root, "public/photos", filename), path.join(root, "dist/photos", filename));
}
const photoWithCache = p => ({ ...p, ...(photoIndex[p.url] ? { localUrl: "/paris-stays/photos/" + photoIndex[p.url] } : {}) });
await mkdir(path.join(root, "dist/data/details"), { recursive: true });
const compact = [];
for (const s of data.stays) {
  if (!/^\d{1,25}$/.test(s.id)) throw new Error("Invalid listing ID");
  const file = `${s.id}.json`;
  const detail = JSON.parse(
    await readFile(path.join(root, "public/data/details", file), "utf8"),
  );
  const photos = (detail.photos ?? s.photos).map(photoWithCache);
  detail.photos = photos;
  compact.push(compactStay(s, photos));
  await writeFile(
    path.join(root, "dist/data/details", file),
    JSON.stringify(detail),
  );
}
await writeFile(
  path.join(root, "dist/data/search.json"),
  JSON.stringify({ ...data, stays: compact }),
);
await copyFile(
  path.join(root, "public/favicon.svg"),
  path.join(root, "dist/favicon.svg"),
);
await copyFile(
  path.join(root, "src/assets/Outfit-OFL.txt"),
  path.join(root, "dist/assets/Outfit-OFL.txt"),
);
await writeFile(path.join(root, "dist/.nojekyll"), "");
await copyFile(path.join(root, "public/runtime.json"), path.join(root, "dist/runtime.json"));
await import("./verify-release.mjs");
