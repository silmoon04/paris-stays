import { test } from "node:test";
import assert from "node:assert/strict";
import { loadStaticJson } from "../src/loading";

test("static JSON retries a transient failure and caches a successful gallery", async (t) => {
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => {
    requests++;
    return requests === 1 ? new Response("Busy", { status: 503 }) : Response.json({ photos: ["a", "b"] });
  });
  assert.deepEqual(await loadStaticJson("/retry-gallery.json"), { photos: ["a", "b"] });
  assert.deepEqual(await loadStaticJson("/retry-gallery.json"), { photos: ["a", "b"] });
  assert.equal(requests, 2);
});
test("a missing static file fails once rather than retrying a permanent 404", async (t) => {
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => {
    requests++;
    return new Response("Missing", { status: 404 });
  });
  await assert.rejects(loadStaticJson("/missing-gallery.json"), /404/);
  assert.equal(requests, 1);
});
test("cancelled gallery requests do not retry or poison the cache", async (t) => {
  let requests = 0;
  t.mock.method(globalThis, "fetch", (_url: unknown, options: RequestInit) => {
    requests++;
    return new Promise((_resolve, reject) => options.signal?.addEventListener("abort", () => reject(new DOMException("Cancelled", "AbortError"))));
  });
  const controller = new AbortController();
  const pending = loadStaticJson("/cancelled-gallery.json", controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(requests, 1);
});
test("HTML returned instead of JSON produces a recoverable loading error", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("<!doctype html>Not found"));
  await assert.rejects(loadStaticJson("/html-gallery.json"), SyntaxError);
});
test("a timeout becomes a visible error rather than a permanent loading state", { timeout: 2000 }, async (t) => {
  let requests = 0;
  t.mock.timers.enable({ apis: ["setTimeout"] });
  t.mock.method(globalThis, "fetch", (_url: unknown, options: RequestInit) => {
    requests++;
    return new Promise((_resolve, reject) => options.signal?.addEventListener("abort", () => reject(new DOMException("Timeout", "AbortError"))));
  });
  const pending = loadStaticJson("/timed-out-gallery.json");
  t.mock.timers.tick(15_000);
  await Promise.resolve();
  await Promise.resolve();
  t.mock.timers.tick(15_000);
  await assert.rejects(pending, /timed out/);
  assert.equal(requests, 2);
});
