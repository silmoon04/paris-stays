import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { UsageCollector, collectorUrl, scrubUsageData } from "../src/telemetry";

test("collector configuration requires HTTPS except local development", () => {
  assert.equal(collectorUrl("https://example.trycloudflare.com"), "https://example.trycloudflare.com");
  assert.equal(collectorUrl("http://127.0.0.1:8785"), "http://127.0.0.1:8785");
  for (const value of ["http://remote.example", "https://name:password@example.com", "javascript:alert(1)", "https://example.com/private", "https://arbitrary.example", "https://api.trycloudflare.com", null]) assert.equal(collectorUrl(value), undefined);
});
test("usage payloads omit written notes, network secrets and search text", () => {
  const data = scrubUsageData({ filters: { query: "private phrase", rules: { toilets: { min: 3 } } }, text: "note", password: "secret", ssid: "wifi", count: 2 });
  assert.deepEqual(data, { filters: { queryLength: 14, rules: { toilets: { min: 3 } } }, count: 2 });
});
function browserGlobals(t: TestContext) {
  const keys = ["navigator", "document", "window", "localStorage", "location", "screen", "innerWidth", "innerHeight", "devicePixelRatio", "matchMedia"];
  const original = keys.map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)] as const);
  const document = Object.assign(new EventTarget(), { visibilityState: "visible", referrer: "" });
  const navigator = { doNotTrack: "0", globalPrivacyControl: false, onLine: true, userAgent: "Test phone", platform: "iPhone", language: "en-GB", languages: ["en-GB"], maxTouchPoints: 5, hardwareConcurrency: 4, sendBeacon: () => true };
  const values = { navigator, document, window: new EventTarget(), localStorage: { getItem: () => null, setItem: () => {} }, location: { hash: "", href: "https://silmoon04.github.io/paris-stays/" }, screen: { width: 390, height: 844, orientation: { type: "portrait-primary" } }, innerWidth: 390, innerHeight: 844, devicePixelRatio: 2, matchMedia: () => ({ matches: false }) };
  for (const [k, v] of Object.entries(values)) Object.defineProperty(globalThis, k, { configurable: true, value: v });
  t.after(() => { for (const [key, descriptor] of original) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); } });
  return { document, navigator };
}
test("unavailable collector fails quietly and a paused collector makes no requests", async t => {
  browserGlobals(t); let calls = 0;
  const c = new UsageCollector("/runtime.json", async () => { calls++; throw new Error("Laptop offline"); });
  t.after(() => c.stop()); c.start(false); assert.equal(calls, 0);
  c.start(true); await new Promise(setImmediate); assert.equal(c.state, "offline"); assert.equal(calls, 1);
  c.record("open", "123"); assert.equal(c.state, "offline");
  c.stop(); assert.equal(c.state, "paused");
});
test("a connected collector sends IDs and safe event batches, then obeys pause", async t => {
  browserGlobals(t); const requests: { url: string; body?: Record<string, unknown> }[] = [];
  const fetcher: typeof fetch = async (url, options) => {
    const body = options?.body ? JSON.parse(String(options.body)) : undefined;
    requests.push({ url: String(url), body });
    const data = String(url).includes("runtime") ? { collectorUrl: "https://test.trycloudflare.com" } : String(url).endsWith("health") ? { service: "paris-stays", version: 1 } : String(url).endsWith("session") ? { token: "test-token" } : { acceptedIds: body.events.map((e: { id: string }) => e.id) };
    return new Response(JSON.stringify(data), { status: 200 });
  };
  const c = new UsageCollector("/runtime.json", fetcher); t.after(() => c.stop()); c.start(true);
  await new Promise(setImmediate); assert.equal(c.state, "online");
  c.record("filter", undefined, { filters: { query: "secret", rules: { toilets: { min: 3 } } }, count: 2 });
  await new Promise(setImmediate); await c.flush();
  assert.ok(requests.some(r => r.body?.events && JSON.stringify(r.body.events).includes('"filter"')));
  assert.ok(!JSON.stringify(requests).includes('"query":"secret"'));
  c.stop(); const count = requests.length; c.record("open", "123"); await c.flush(); assert.equal(requests.length, count);
});
test("DNT and global privacy controls suppress collection", async t => {
  const { navigator } = browserGlobals(t); let requests = 0;
  const c = new UsageCollector("/runtime.json", async () => { requests++; throw new Error(); }); t.after(() => c.stop());
  navigator.doNotTrack = "1"; c.start(true); assert.equal(c.state, "paused");
  navigator.doNotTrack = "0"; navigator.globalPrivacyControl = true; c.start(true); assert.equal(c.state, "paused");
  assert.equal(requests, 0);
});
test("viewing time excludes hidden tabs and is attributed to the opened listing", async t => {
  const { document } = browserGlobals(t); let clock = 1000;
  t.mock.method(performance, "now", () => clock);
  const sent: { type: string; listingId?: string; data: Record<string, number> }[] = [];
  const fetcher: typeof fetch = async (url, options) => {
    const body = options?.body ? JSON.parse(String(options.body)) : undefined;
    if (body?.events) sent.push(...body.events);
    const data = String(url).includes("runtime") ? { collectorUrl: "https://test.trycloudflare.com" } : String(url).endsWith("health") ? { service: "paris-stays", version: 1 } : String(url).endsWith("session") ? { token: "test-token" } : { acceptedIds: body.events.map((e: { id: string }) => e.id) };
    return new Response(JSON.stringify(data));
  };
  const c = new UsageCollector("/runtime.json", fetcher); t.after(() => c.stop()); c.start(true); await new Promise(setImmediate);
  c.view("123"); clock = 5000; document.visibilityState = "hidden"; document.dispatchEvent(new Event("visibilitychange"));
  clock = 20000; document.visibilityState = "visible"; document.dispatchEvent(new Event("visibilitychange"));
  clock = 23000; c.view(); await c.flush();
  const views = sent.filter(e => e.type === "view_time");
  assert.equal(views.reduce((n, e) => n + e.data.durationMs, 0), 7000);
  assert.ok(views.every(e => e.listingId === "123"));
});
test("pausing during discovery aborts before registering a session", async t => {
  browserGlobals(t); let respond: (value: Response) => void = () => {};
  const urls: string[] = [];
  const fetcher: typeof fetch = async url => { urls.push(String(url)); return new Promise(resolve => { respond = resolve; }); };
  const c = new UsageCollector("/runtime.json", fetcher); c.start(true); c.stop();
  respond(new Response(JSON.stringify({ collectorUrl: "https://test.trycloudflare.com" })));
  await new Promise(setImmediate); assert.equal(c.state, "paused"); assert.equal(urls.length, 1);
});
