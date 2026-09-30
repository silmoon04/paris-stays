import assert from "node:assert/strict";
import { readFile, readdir, lstat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  out = path.join(root, "dist");
assert.deepEqual((await readdir(out)).sort(), [
  ".nojekyll",
  "assets",
  "data",
  "favicon.svg",
  "index.html",
]);
assert.deepEqual((await readdir(path.join(out, "data"))).sort(), [
  "details",
  "search.json",
]);
const searchBytes = await readFile(path.join(out, "data/search.json")),
  snapshot = JSON.parse(searchBytes);
const ids = new Set(snapshot.stays.map((s) => s.id));
assert.equal(ids.size, snapshot.stays.length);
assert.ok(
  snapshot.meta.chargedUsd <= 5.00001,
  "Apify collection exceeded its cap",
);
assert.deepEqual(
  (await readdir(path.join(out, "data/details"))).sort(),
  [...ids].map((id) => id + ".json").sort(),
);
for (const s of snapshot.stays) {
  const detail = JSON.parse(await readFile(path.join(out, "data/details", s.id + ".json"), "utf8"));
  assert.ok(s.photos.length <= 1, "Only the cover belongs in the search download");
  assert.equal(s.photoCount, detail.photos.length, "Gallery count does not match");
  for (const facts of [s.facts, s.enrichment?.facts, detail.facts, detail.enrichment?.facts]) {
    for (const key of ["toilets", "showers", "bathrooms"]) {
      const item = facts?.[key];
      if (!item) continue;
      assert.equal(item.source, "listing", `${s.id}: ${key} must come from the listing`);
      assert.ok(item.confidence !== "low" && !item.conflicts?.length,
        `${s.id}: uncertain bathroom count cannot be published`);
      assert.ok(Number.isInteger(item.value) && item.value >= 0);
    }
  }
  assert.match(s.id, /^\d{1,25}$/);
  assert.equal(new URL(s.url).hostname, "www.airbnb.com");
  for (const p of [...s.photos, ...detail.photos]) {
    const url = new URL(p.url);
    assert.equal(url.protocol, "https:");
    assert.equal(url.hostname, "a0.muscache.com");
    assert.ok(
      !url.pathname.includes("/user/"),
      "Host profile photo cannot be published",
    );
  }
  assert.ok(s.lat === null || (s.lat >= 48.5 && s.lat <= 49.2));
  assert.ok(s.lon === null || (s.lon >= 1.9 && s.lon <= 2.8));
  if (s.quote.complete) {
    assert.equal(s.quote.currency, "GBP");
    assert.equal(s.quote.checkIn, "2026-10-31");
    assert.equal(s.quote.checkOut, "2026-11-04");
    assert.equal(s.quote.adults, 5);
    assert.ok(s.quote.fees.some((f) => /tax/i.test(f.label)));
  }
}
const html = await readFile(path.join(out, "index.html"), "utf8");
assert.ok(html.includes("/paris-stays/assets/"));
assert.ok(html.includes("showStartupRecovery") && /addEventListener\(['"]error['"]/.test(html), "Startup recovery must survive the static build");
assert.ok(html.includes('rel="preload"') && html.includes('.woff2'), "Font must be served and preloaded from this site");
for (const m of html.matchAll(/(?:href|src)="(\/[^"\s]+)"/g)) {
  assert.ok(m[1].startsWith("/paris-stays/"));
  await lstat(path.join(out, m[1].slice("/paris-stays/".length)));
}
const forbidden =
  /apify_api_[A-Za-z0-9]+|gh[oprsu]_[A-Za-z0-9]{20,}|"(?:host|coHosts|reviewer|reviewee|profilePictureUrl|whyLike|whyNot)"\s*:/;
async function scan(folder) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const f = path.join(folder, entry.name),
      info = await lstat(f);
    assert.ok(!info.isSymbolicLink());
    if (entry.isDirectory()) await scan(f);
    else if (/\.(?:js|json|html|css|svg)$/.test(entry.name)) {
      const text = await readFile(f, "utf8");
      if (entry.name.endsWith(".json"))
        assert.ok(
          !forbidden.test(text),
          "Forbidden private data in " + path.relative(out, f),
        );
      else
        assert.ok(
          !/apify_api_[A-Za-z0-9]+|gh[oprsu]_[A-Za-z0-9]{20,}/.test(text),
          "Credential in release",
        );
    }
  }
}
await scan(out);
assert.ok(
  gzipSync(searchBytes).length < 300_000,
  "Search snapshot exceeds 300 KB compressed target",
);
console.log(
  `Verified release: ${ids.size} listings, ${(gzipSync(searchBytes).length / 1024).toFixed(0)} KB compressed search data, $${snapshot.meta.chargedUsd.toFixed(4)} collection cost.`,
);
