export type UsageEvent = { id: string; type: string; at: number; listingId?: string; data: Record<string, unknown> };
export type ConnectionState = "connecting" | "online" | "offline" | "paused";
type NetworkInfo = { type?: string; effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean };
export function collectorUrl(raw: unknown) {
  if (typeof raw !== "string") return undefined;
  try {
    const u = new URL(raw);
    if (u.username || u.password || u.search || u.hash || u.pathname !== "/") return undefined;
    if ((u.protocol === "https:" && /^[a-z0-9-]+\.trycloudflare\.com$/.test(u.hostname) && u.hostname !== "api.trycloudflare.com") || (u.protocol === "http:" && ["127.0.0.1", "localhost"].includes(u.hostname))) return u.origin;
  } catch { /* The static app remains usable without a collector. */ }
}
export function scrubUsageData(input: Record<string, unknown>) {
  const out = { ...input };
  for (const key of ["query", "text", "note", "whyLike", "whyNot", "description", "url", "referrer", "ssid", "password"]) delete out[key];
  if (input.filters && typeof input.filters === "object") {
    const filters = { ...input.filters as Record<string, unknown> };
    filters.queryLength = typeof filters.query === "string" ? filters.query.length : 0;
    delete filters.query;
    out.filters = filters;
  }
  return out;
}
export function deviceInfo() {
  const n = navigator as Navigator & { connection?: NetworkInfo; deviceMemory?: number };
  let referrerHost = ""; try { referrerHost = new URL(document.referrer).hostname; } catch { /* No referrer. */ }
  return { userAgent: n.userAgent, platform: n.platform, language: n.language, languages: [...n.languages],
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, referrerHost,
    screenWidth: screen.width, screenHeight: screen.height, viewportWidth: innerWidth, viewportHeight: innerHeight,
    pixelRatio: devicePixelRatio, touchPoints: n.maxTouchPoints, cores: n.hardwareConcurrency, memoryGb: n.deviceMemory,
    online: n.onLine, reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    orientation: screen.orientation?.type,
    connectionType: n.connection?.type, effectiveType: n.connection?.effectiveType,
    downlink: n.connection?.downlink, rtt: n.connection?.rtt, saveData: n.connection?.saveData,
    testSession: new URLSearchParams(location.search).get("qa") === "1" };
}
export class UsageCollector {
  state: ConnectionState = "paused";
  private enabled = false;
  private stopped = true;
  private url?: string;
  private token?: string;
  private visitorId = "";
  private sessionId = "";
  private queue: UsageEvent[] = [];
  private connecting = false;
  private flushing = false;
  private connectionAbort?: AbortController;
  private flushAbort?: AbortController;
  private interval?: ReturnType<typeof setInterval>;
  private retryAt = 0;
  private cleanup: (() => void)[] = [];
  private subscribers = new Set<(s: ConnectionState) => void>();
  private listingId?: string;
  private viewStarted = 0;
  private pageStarted = 0;
  private lastActivity = 0;
  private wasVisible = true;
  constructor(private configPath: string, private fetcher: typeof fetch = fetch) {}
  subscribe(fn: (s: ConnectionState) => void) { this.subscribers.add(fn); fn(this.state); return () => { this.subscribers.delete(fn); }; }
  private setState(s: ConnectionState) { this.state = s; for (const fn of this.subscribers) fn(s); }
  start(enabled: boolean) {
    this.stop();
    const n = navigator as Navigator & { globalPrivacyControl?: boolean };
    if (!enabled || n.doNotTrack === "1" || n.globalPrivacyControl) { this.setState("paused"); return; }
    this.enabled = true; this.stopped = false;
    try {
      this.visitorId = localStorage.getItem("paris-stays-visitor") ?? crypto.randomUUID();
      localStorage.setItem("paris-stays-visitor", this.visitorId);
    } catch { this.visitorId = crypto.randomUUID(); }
    this.sessionId = crypto.randomUUID(); this.pageStarted = performance.now(); this.lastActivity = Date.now(); this.wasVisible = document.visibilityState === "visible";
    this.record("visit", undefined, { source: location.hash.includes("shortlist=") ? "shortlist" : "direct" });
    this.capture();
    this.interval = setInterval(() => {
      this.timeCheckpoint();
      if (this.state === "online") void this.flush();
      else if (Date.now() >= this.retryAt && navigator.onLine) void this.connect();
    }, 10000);
    void this.connect();
  }
  stop() {
    this.timeCheckpoint();
    this.beacon();
    this.enabled = false; this.stopped = true;
    this.connectionAbort?.abort(); this.flushAbort?.abort();
    if (this.interval) clearInterval(this.interval);
    for (const clean of this.cleanup) clean(); this.cleanup = [];
    this.queue = []; this.token = undefined; this.url = undefined; this.listingId = undefined;
    this.setState("paused");
  }
  record(type: string, listingId?: string, data: Record<string, unknown> = {}) {
    if (!this.enabled) return;
    if (listingId && !/^\d{1,25}$/.test(listingId)) return;
    this.queue.push({ id: crypto.randomUUID(), type, at: Date.now(), listingId, data: scrubUsageData(data) });
    if (this.queue.length > 600) this.queue.splice(0, this.queue.length - 600);
    if (["source", "filter", "open", "host_message"].includes(type) && this.state === "online") void this.flush();
  }
  view(id?: string) { this.timeCheckpoint(); this.listingId = id; this.viewStarted = performance.now(); this.lastActivity = Date.now(); }
  private timeCheckpoint() {
    if (!this.enabled || !this.pageStarted || typeof document === "undefined") return;
    const now = performance.now();
    const active = this.wasVisible && Date.now() - this.lastActivity < 120000;
    const durationMs = Math.round(now - (this.viewStarted || this.pageStarted));
    if (active && durationMs > 200) this.record(this.listingId ? "view_time" : "page_time", this.listingId, { durationMs: Math.min(durationMs, 10000), source: "visible-active" });
    this.pageStarted = now; this.viewStarted = this.listingId ? now : 0;
    this.wasVisible = document.visibilityState === "visible";
  }
  private async request(route: string, body?: unknown, parent?: AbortSignal) {
    if (parent?.aborted) throw new DOMException("Cancelled", "AbortError");
    const abort = new AbortController();
    const cancel = () => abort.abort(); parent?.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(cancel, route.includes(".trycloudflare.com") ? 12000 : 5000);
    try {
      const fetchRequest = this.fetcher;
      const r = await fetchRequest(route, { method: body ? "POST" : "GET", body: body ? JSON.stringify(body) : undefined,
        headers: body ? { "Content-Type": "application/json" } : undefined, cache: "no-store", credentials: "omit", signal: abort.signal });
      if (!r.ok) throw new Error("Collector unavailable"); return await r.json();
    } finally { clearTimeout(timer); parent?.removeEventListener("abort", cancel); }
  }
  async connect() {
    if (this.stopped || this.connecting) return;
    this.connecting = true; this.setState("connecting");
    const abort = new AbortController(); this.connectionAbort = abort;
    try {
      const config = await this.request(this.configPath + "?t=" + Math.floor(Date.now() / 60000), undefined, abort.signal);
      const url = collectorUrl(config.collectorUrl); if (!url) throw new Error("Offline");
      const health = await this.request(url + "/health", undefined, abort.signal);
      if (health.service !== "paris-stays" || health.version !== 1) throw new Error("Wrong collector");
      const session = await this.request(url + "/v1/session", { visitorId: this.visitorId, sessionId: this.sessionId, device: deviceInfo() }, abort.signal);
      if (this.stopped || abort.signal.aborted) return;
      this.url = url; this.token = session.token; this.setState("online");
      void this.flush();
    } catch { if (!this.stopped) { this.setState("offline"); this.retryAt = Date.now() + 60000; } }
    finally { this.connecting = false; }
  }
  private envelope(events: UsageEvent[]) { return { visitorId: this.visitorId, sessionId: this.sessionId, token: this.token, events }; }
  async flush() {
    if (this.flushing || !this.enabled || this.state !== "online" || !this.url || !this.token || !this.queue.length) return;
    this.flushing = true; const batch = this.queue.slice(0, 40), abort = new AbortController(); this.flushAbort = abort;
    try {
      const reply = await this.request(this.url + "/v1/events", this.envelope(batch), abort.signal);
      const ids = new Set(reply.acceptedIds);
      this.queue = this.queue.filter(e => !ids.has(e.id));
    } catch { if (!this.stopped) { this.setState("offline"); this.retryAt = Date.now() + 60000; } }
    finally { this.flushing = false; }
  }
  private beacon() {
    if (!this.enabled || this.state !== "online" || !this.url || !this.token || !this.queue.length) return;
    try { navigator.sendBeacon(this.url + "/v1/events", new Blob([JSON.stringify(this.envelope(this.queue.slice(0, 40)))], { type: "text/plain" })); } catch { /* Navigation must remain instant. */ }
  }
  async clear() {
    this.queue = [];
    if (this.url && this.token) {
      try { await this.request(this.url + "/v1/clear", { visitorId: this.visitorId, sessionId: this.sessionId, token: this.token }); this.token = undefined; this.setState("offline"); this.retryAt = Date.now() + 1000; }
      catch { /* Local activity can still be cleared while the collector is offline. */ }
    }
  }
  private capture() {
    const on = (target: EventTarget, type: string, fn: EventListener, options?: AddEventListenerOptions) => {
      target.addEventListener(type, fn, options); this.cleanup.push(() => target.removeEventListener(type, fn, options));
    };
    on(document, "pointerdown", () => { this.lastActivity = Date.now(); }, { passive: true });
    on(document, "keydown", () => { this.lastActivity = Date.now(); }, { passive: true });
    on(document, "click", (event) => {
      const target = event.target as Element;
      const control = target.closest?.("button,a,input[type=checkbox],select"); if (!control) return;
      const context = control.closest<HTMLElement>("[data-listing-id]")?.dataset.listingId ?? this.listingId;
      let destination: string | undefined;
      if (control instanceof HTMLAnchorElement) { try { destination = new URL(control.href).hostname; } catch { /* Not an external link. */ } }
      const label = (control.getAttribute("aria-label") ?? control.textContent ?? "").trim().slice(0, 100);
      this.record("click", context, { label, control: control.tagName.toLowerCase(), destination });
      if (destination === "www.airbnb.com") this.record("source", context, { destination: "Airbnb", label });
    }, { capture: true });
    on(document, "change", (event) => {
      const control = event.target;
      if (control instanceof HTMLSelectElement) this.record("control", this.listingId, { control: control.id || control.getAttribute("aria-label"), value: control.value });
      if (control instanceof HTMLInputElement && ["checkbox", "range"].includes(control.type)) this.record("control", this.listingId, { control: control.id || control.getAttribute("aria-label") || control.closest("label")?.querySelector("b")?.textContent || control.type, checked: control.checked, value: control.type === "range" ? control.value : undefined });
    });
    let scrollAt = 0;
    on(document, "scroll", event => {
      this.lastActivity = Date.now(); if (Date.now() - scrollAt < 2000) return; scrollAt = Date.now();
      const target = event.target instanceof Element ? event.target : document.documentElement;
      const section = target.classList.contains("modal") ? "listing" : target.classList.contains("results-scroll") ? "results" : "page";
      this.record("scroll", this.listingId, { section, percent: Math.round(100 * target.scrollTop / Math.max(1, target.scrollHeight - target.clientHeight)) });
    }, { capture: true, passive: true });
    on(document, "visibilitychange", () => { this.timeCheckpoint(); if (document.visibilityState === "visible") this.lastActivity = Date.now(); this.beacon(); });
    on(window, "pagehide", () => { this.timeCheckpoint(); this.beacon(); });
    on(window, "online", () => { this.retryAt = 0; void this.connect(); });
    on(window, "error", event => { if (event instanceof ErrorEvent) this.record("error", this.listingId, { errorType: "script", source: event.filename ? new URL(event.filename, location.href).pathname.split("/").pop() : "unknown" }); });
  }
}
export const usage = typeof window !== "undefined" ? new UsageCollector((import.meta.env?.BASE_URL ?? "/paris-stays/") + "runtime.json") : undefined;
export const logUsage = (type: string, listingId?: string, data: Record<string, unknown> = {}) => usage?.record(type, listingId, data);
