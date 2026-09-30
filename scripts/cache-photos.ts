import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { matches, DEFAULT_FILTERS } from "../src/filters";
import type { Snapshot, Detail } from "../src/domain";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const snapshot: Snapshot = JSON.parse(await readFile(path.join(root, "public/data/search.json"), "utf8"));
const indexPath = path.join(root, "public/photo-index.json");
let index: Record<string, string> = {};
try { index = JSON.parse(await readFile(indexPath, "utf8")); } catch { /* First cache build. */ }
await mkdir(path.join(root, "public/photos"), { recursive: true });
const urls = new Set<string>();
for (const stay of snapshot.stays) {
  if (stay.zones.length && stay.photos[0]) {
    const best = stay.enrichment?.photoReview?.bestPhotoIndex ?? 0;
    urls.add((stay.photos[best] ?? stay.photos[0]).url);
  }
  if (matches(stay, DEFAULT_FILTERS)) {
    const detail: Detail = JSON.parse(await readFile(path.join(root, "public/data/details", stay.id + ".json"), "utf8"));
    for (const photo of detail.photos ?? stay.photos) urls.add(photo.url);
  }
}
let cached = 0, failed = 0;
const queue = [...urls];
async function worker() {
  while (queue.length) {
    const url = queue.shift()!;
    try {
      if (index[url] && (await stat(path.join(root, "public/photos", index[url])).catch(() => null))) { cached++; continue; }
      const source = new URL(url);
      if (source.protocol !== "https:" || source.hostname !== "a0.muscache.com") throw new Error("Unexpected source");
      source.searchParams.set("im_w", "720");
      const response = await fetch(source, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error("Image unavailable");
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > 2_000_000 || bytes.length < 100) throw new Error("Unexpected image size");
      const ext = bytes[0] === 255 && bytes[1] === 216 ? "jpg" : bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP" ? "webp" : bytes[0] === 137 && bytes.subarray(1, 4).toString() === "PNG" ? "png" : null;
      if (!ext) throw new Error("Invalid image bytes");
      const file = createHash("sha256").update(url).digest("hex").slice(0, 24) + "." + ext;
      await writeFile(path.join(root, "public/photos", file), bytes);
      index[url] = file; cached++;
    } catch { failed++; }
  }
}
await Promise.all(Array.from({ length: 6 }, worker));
await writeFile(indexPath, JSON.stringify(index, null, 2) + "\n");
console.log(JSON.stringify({ requested: urls.size, cached, failed, scope: "In-area covers and complete galleries for current default matches" }));
