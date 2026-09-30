import http from "node:http";
import { DatabaseSync } from "node:sqlite";
import { randomBytes, createHmac, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const EVENT_TYPES = new Set([
  "visit", "click", "control", "open", "photo", "save", "hide", "restore",
  "filter", "map", "compare", "source", "navigation", "results", "hover",
  "view_time", "page_time", "scroll", "image_load", "image_error", "error", "host_message",
]);
const ID = /^[a-f0-9-]{16,64}$/i;
const LISTING = /^\d{1,25}$/;
const text = (v, max = 150) => typeof v === "string" ? v.slice(0, max) : undefined;
const number = (v, max = 1e9) => typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(v, max)) : undefined;
export function cleanEvent(raw, now = Date.now()) {
  if (!raw || !ID.test(raw.id ?? "") || !EVENT_TYPES.has(raw.type) ||
      !Number.isFinite(raw.at) || raw.at < now - 86400000 || raw.at > now + 60000 ||
      (raw.listingId && !LISTING.test(raw.listingId))) return null;
  const data = {}, input = raw.data ?? {};
  for (const key of ["index", "count", "previousCount", "durationMs", "visibleMs", "percent", "scrollTop", "width", "height", "queryLength", "loadedMs"]) {
    const v = number(input[key]); if (v !== undefined) data[key] = v;
  }
  for (const key of ["source", "tab", "zone", "label", "control", "value", "category", "destination", "status", "section", "errorType"]) {
    const v = text(input[key]); if (v !== undefined) data[key] = v;
  }
  for (const key of ["checked", "unknownIncluded", "confirmedOnly"]) if (typeof input[key] === "boolean") data[key] = input[key];
  if (Array.isArray(input.listingIds)) data.listingIds = input.listingIds.filter(x => LISTING.test(x)).slice(0, 60);
  if (Array.isArray(input.removedIds)) data.removedIds = input.removedIds.filter(x => LISTING.test(x)).slice(0, 60);
  if (Array.isArray(input.bounds) && input.bounds.length === 4 && input.bounds.every(x => typeof x === "number" && Number.isFinite(x) && x >= -180 && x <= 180)) data.bounds = input.bounds;
  if (input.filters && typeof input.filters === "object") {
    const f = input.filters;
    data.filters = { zone: text(f.zone), queryLength: typeof f.query === "string" ? f.query.length : number(f.queryLength),
      includeUnknown: f.includeUnknown === true, includeExcluded: f.includeExcluded === true,
      onlyConfirmed: f.onlyConfirmed === true, priceMax: number(f.priceMax), ratingMin: number(f.ratingMin), minReviews: number(f.minReviews), rules: {} };
    for (const [key, rule] of Object.entries(f.rules ?? {}).slice(0, 40)) {
      if (!/^[a-zA-Z]{1,30}$/.test(key) || !rule || typeof rule !== "object") continue;
      const r = {};
      for (const bound of ["min", "max"]) if (Number.isFinite(rule[bound])) r[bound] = Math.max(-1, Math.min(rule[bound], 10000));
      if (typeof rule.eq === "boolean" || typeof rule.eq === "string") r.eq = typeof rule.eq === "string" ? rule.eq.slice(0, 30) : rule.eq;
      data.filters.rules[key] = r;
    }
  }
  return { id: raw.id, type: raw.type, at: raw.at, listingId: raw.listingId ?? null, data };
}
export function cleanDevice(raw = {}) {
  const result = {};
  for (const key of ["userAgent", "platform", "language", "timezone", "referrerHost", "connectionType", "effectiveType", "orientation"]) {
    const v = text(raw[key], key === "userAgent" ? 500 : 100); if (v !== undefined) result[key] = v;
  }
  for (const key of ["screenWidth", "screenHeight", "viewportWidth", "viewportHeight", "pixelRatio", "touchPoints", "cores", "memoryGb", "downlink", "rtt"]) {
    const v = number(raw[key], 10000); if (v !== undefined) result[key] = v;
  }
  for (const key of ["saveData", "online", "reducedMotion", "testSession"]) if (typeof raw[key] === "boolean") result[key] = raw[key];
  if (Array.isArray(raw.languages)) result.languages = raw.languages.filter(x => typeof x === "string").slice(0, 5).map(x => x.slice(0, 30));
  return result;
}
export function createCollector({ directory, origins, snapshotPath }) {
  mkdirSync(directory, { recursive: true });
  const secretPath = path.join(directory, "secret");
  if (!existsSync(secretPath)) writeFileSync(secretPath, randomBytes(32), { mode: 0o600 });
  const secret = readFileSync(secretPath);
  const sign = value => createHmac("sha256", secret).update(value).digest("hex");
  const db = new DatabaseSync(path.join(directory, "visits.sqlite"));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;
    CREATE TABLE IF NOT EXISTS sessions(session_id TEXT PRIMARY KEY, visitor_id TEXT NOT NULL,
      first_at INTEGER NOT NULL,last_at INTEGER NOT NULL,device TEXT NOT NULL,network TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,session_id TEXT NOT NULL,type TEXT NOT NULL,
      listing_id TEXT,at INTEGER NOT NULL,received_at INTEGER NOT NULL,data TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS event_session ON events(session_id,at);
    CREATE INDEX IF NOT EXISTS event_listing ON events(listing_id,type);`);
  const insertSession = db.prepare(`INSERT INTO sessions VALUES(?,?,?,?,?,?) ON CONFLICT(session_id)
    DO UPDATE SET last_at=excluded.last_at,device=excluded.device,network=excluded.network`);
  const insertEvent = db.prepare("INSERT OR IGNORE INTO events VALUES(?,?,?,?,?,?,?)");
  const limits = new Map();
  const retention = () => {
    const cutoff = Date.now() - 90 * 86400000;
    db.prepare("DELETE FROM events WHERE received_at < ?").run(cutoff);
    db.prepare("DELETE FROM sessions WHERE last_at < ?").run(cutoff);
    for (const [key, limit] of limits) if (limit.until < Date.now()) limits.delete(key);
  };
  retention();
  const pruneTimer = setInterval(retention, 3600000); pruneTimer.unref();
  const reply = (res, status, obj) => { res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }); res.end(JSON.stringify(obj)); };
  const network = req => ({
    addressHash: sign(req.headers["cf-connecting-ip"] ?? req.socket.remoteAddress ?? "unknown").slice(0, 24),
    country: /^[A-Z]{2}$/.test(req.headers["cf-ipcountry"] ?? "") ? req.headers["cf-ipcountry"] : null,
    userAgent: text(req.headers["user-agent"], 500),
  });
  async function readBody(req) {
    let length = 0, chunks = [];
    for await (const chunk of req) {
      length += chunk.length; if (length > 65536) throw new Error("too large"); chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  }
  const api = http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    if (origin && !origins.includes(origin)) return reply(res, 403, { error: "Origin not allowed" });
    if (origin) { res.setHeader("Access-Control-Allow-Origin", origin); res.setHeader("Vary", "Origin"); }
    if (req.method === "OPTIONS") {
      res.writeHead(204, { "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "600" }); return res.end();
    }
    const key = network(req).addressHash, now = Date.now();
    const limit = limits.get(key) ?? { until: now + 60000, count: 0 };
    if (limit.until < now) { limit.until = now + 60000; limit.count = 0; }
    limits.set(key, limit);
    if (++limit.count > 180) return reply(res, 429, { error: "Too many requests" });
    if (req.method === "GET" && req.url === "/health") return reply(res, 200, { service: "paris-stays", version: 1, online: true });
    if (req.method === "GET" && req.url === "/v1/snapshot") {
      try { return reply(res, 200, JSON.parse(readFileSync(snapshotPath, "utf8"))); } catch { return reply(res, 503, { error: "Snapshot unavailable" }); }
    }
    if (req.method !== "POST" || !origin) return reply(res, 404, { error: "Not found" });
    try {
      const body = await readBody(req);
      if (!ID.test(body.sessionId ?? "") || !ID.test(body.visitorId ?? "")) return reply(res, 400, { error: "Invalid IDs" });
      if (req.url === "/v1/session") {
        insertSession.run(body.sessionId, body.visitorId, now, now, JSON.stringify(cleanDevice(body.device)), JSON.stringify(network(req)));
        return reply(res, 200, { token: sign(body.sessionId + ":" + body.visitorId) });
      }
      if (req.url === "/v1/events") {
        const expected = sign(body.sessionId + ":" + body.visitorId), supplied = body.token;
        if (typeof supplied !== "string" || supplied.length !== expected.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected)) ||
            !db.prepare("SELECT 1 FROM sessions WHERE session_id=? AND visitor_id=?").get(body.sessionId, body.visitorId))
          return reply(res, 401, { error: "Invalid session" });
        if (!Array.isArray(body.events) || body.events.length > 50) return reply(res, 400, { error: "Invalid batch" });
        const events = body.events.map(e => cleanEvent(e, now)).filter(Boolean);
        db.exec("BEGIN");
        try {
          for (const e of events) insertEvent.run(e.id, body.sessionId, e.type, e.listingId, e.at, now, JSON.stringify(e.data));
          db.prepare("UPDATE sessions SET last_at=? WHERE session_id=?").run(now, body.sessionId);
          db.exec("COMMIT");
        } catch (error) { db.exec("ROLLBACK"); throw error; }
        return reply(res, 200, { acceptedIds: events.map(e => e.id) });
      }
      if (req.url === "/v1/clear") {
        if (body.token !== sign(body.sessionId + ":" + body.visitorId)) return reply(res, 401, { error: "Invalid session" });
        db.prepare("DELETE FROM events WHERE session_id IN (SELECT session_id FROM sessions WHERE visitor_id=?)").run(body.visitorId);
        db.prepare("DELETE FROM sessions WHERE visitor_id=?").run(body.visitorId);
        return reply(res, 200, { cleared: true });
      }
      return reply(res, 404, { error: "Not found" });
    } catch { return reply(res, 400, { error: "Invalid request" }); }
  });
  api.requestTimeout = 10000; api.headersTimeout = 10000;
  const admin = http.createServer((req, res) => {
    // The tunnel points at the other port. Reject remote origins and non-loopback Hosts.
    if (req.headers.origin && !/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(req.headers.origin)) return reply(res, 403, { error: "Local dashboard only" });
    if (!/^(?:127\.0\.0\.1|localhost):\d+$/.test(req.headers.host ?? "")) return reply(res, 403, { error: "Local dashboard only" });
    if (req.url === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'" });
      return res.end(readFileSync(new URL("./collector-dashboard.html", import.meta.url)));
    }
    const adminUrl = new URL(req.url, "http://localhost");
    const includeTests = adminUrl.searchParams.get("includeTests") === "1";
    const sessionScope = includeTests ? "1=1" : "coalesce(json_extract(device,'$.testSession'),0)=0";
    const eventScope = `session_id IN (SELECT session_id FROM sessions WHERE ${sessionScope})`;
    if (adminUrl.pathname === "/api/summary") {
      return reply(res, 200, {
        totals: db.prepare(`SELECT (SELECT count(*) FROM sessions WHERE ${sessionScope}) sessions,(SELECT count(DISTINCT visitor_id) FROM sessions WHERE ${sessionScope}) visitors,(SELECT count(*) FROM events WHERE ${eventScope}) events`).get(),
        testSessions: db.prepare("SELECT count(*) count FROM sessions WHERE json_extract(device,'$.testSession')=1").get().count,
        includeTests,
        types: db.prepare(`SELECT type,count(*) count FROM events WHERE ${eventScope} GROUP BY type ORDER BY count DESC`).all(),
        listings: db.prepare(`SELECT listing_id,count(*) events,sum(CASE WHEN type='open' THEN 1 ELSE 0 END) opens,sum(CASE WHEN type='source' THEN 1 ELSE 0 END) airbnb_clicks,sum(CASE WHEN type='view_time' THEN json_extract(data,'$.durationMs') ELSE 0 END) viewing_ms FROM events WHERE listing_id IS NOT NULL AND ${eventScope} GROUP BY listing_id ORDER BY opens DESC LIMIT 100`).all(),
        sessions: db.prepare(`SELECT * FROM sessions WHERE ${sessionScope} ORDER BY last_at DESC LIMIT 100`).all().map(s => ({ ...s, device: JSON.parse(s.device), network: JSON.parse(s.network) })),
      });
    }
    if (adminUrl.pathname === "/api/events") {
      const sid = adminUrl.searchParams.get("session");
      const rows = sid && ID.test(sid) ? db.prepare(`SELECT * FROM events WHERE session_id=? AND ${eventScope} ORDER BY at DESC LIMIT 500`).all(sid) : db.prepare(`SELECT * FROM events WHERE ${eventScope} ORDER BY received_at DESC LIMIT 300`).all();
      return reply(res, 200, rows.map(e => ({ ...e, data: JSON.parse(e.data) })));
    }
    return reply(res, 404, { error: "Not found" });
  });
  return { api, admin, db, close: async () => { clearInterval(pruneTimer); await Promise.all([api, admin].map(s => s.listening ? new Promise(resolve => s.close(resolve)) : Promise.resolve())); db.close(); } };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const collector = createCollector({ directory: path.join(root, ".private/server"), origins: ["https://silmoon04.github.io", "http://127.0.0.1:4174", "http://127.0.0.1:5174"], snapshotPath: path.join(root, "dist/data/search.json") });
  collector.api.listen(8785, "127.0.0.1", () => console.log("Collector listening on 127.0.0.1:8785"));
  collector.admin.listen(8786, "127.0.0.1", () => console.log("Private dashboard: http://127.0.0.1:8786/"));
}
