export type RecordItem = {
  saved: boolean;
  hidden: boolean;
  whyLike: string;
  whyNot: string;
  viewedAt: number | null;
  updatedAt: number;
};
export type Activity = {
  id: string;
  type:
    | "open"
    | "photo"
    | "save"
    | "hide"
    | "restore"
    | "filter"
    | "map"
    | "compare"
    | "source"
    | "navigation";
  listingId?: string;
  at: number;
  data: Record<string, unknown>;
};
export type Workspace = {
  version: 1;
  records: Record<string, RecordItem>;
  activity: Activity[];
  activityEnabled: boolean;
};
export const EMPTY: Workspace = {
  version: 1,
  records: {},
  activity: [],
  activityEnabled: true,
};
const idOK = (v: string) => /^\d{1,25}$/.test(v);
export function cleanWorkspace(input: unknown, now = Date.now()): Workspace {
  if (!input || typeof input !== "object")
    throw new Error("Choose a Paris Stays export file.");
  const raw = input as Partial<Workspace>;
  if (raw.version !== 1)
    throw new Error("This export version is not supported.");
  const records: Workspace["records"] = {};
  for (const [id, item] of Object.entries(raw.records ?? {})) {
    if (!idOK(id) || !item || typeof item !== "object") continue;
    records[id] = {
      saved: item.saved === true,
      hidden: item.hidden === true,
      whyLike:
        typeof item.whyLike === "string" ? item.whyLike.slice(0, 2000) : "",
      whyNot: typeof item.whyNot === "string" ? item.whyNot.slice(0, 2000) : "",
      viewedAt:
        typeof item.viewedAt === "number" && item.viewedAt <= now
          ? item.viewedAt
          : null,
      updatedAt:
        typeof item.updatedAt === "number" && item.updatedAt <= now + 60000
          ? item.updatedAt
          : now,
    };
  }
  const types = new Set([
    "open",
    "photo",
    "save",
    "hide",
    "restore",
    "filter",
    "map",
    "compare",
    "source",
    "navigation",
  ]);
  const activity = (Array.isArray(raw.activity) ? raw.activity : [])
    .filter(
      (e) =>
        e &&
        typeof e.id === "string" &&
        types.has(e.type) &&
        Number.isFinite(e.at) &&
        e.at >= now - 90 * 86400000 &&
        e.at <= now + 60000 &&
        (!e.listingId || idOK(e.listingId)),
    )
    .slice(-3000)
    .map((e) => ({
      ...e,
      data: Object.fromEntries(
        Object.entries(e.data ?? {}).filter(
          ([k, v]) =>
            [
              "index",
              "source",
              "zone",
              "count",
              "filters",
              "bounds",
              "tab",
            ].includes(k) && JSON.stringify(v).length < 5000,
        ),
      ),
    }));
  return {
    version: 1,
    records,
    activity,
    activityEnabled: raw.activityEnabled !== false,
  };
}
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("paris-stays-workspace-v1", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("state");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new Error("Browser storage unavailable"));
  });
}
export async function loadWorkspace() {
  const db = await database();
  try {
    return await new Promise<Workspace>((resolve, reject) => {
      const tx = db.transaction("state", "readonly"),
        req = tx.objectStore("state").get("workspace");
      req.onsuccess = () =>
        resolve(
          req.result ? cleanWorkspace(req.result) : structuredClone(EMPTY),
        );
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}
let queue: Promise<void> = Promise.resolve();
export function saveWorkspace(state: Workspace) {
  const copy = cleanWorkspace(state);
  queue = queue
    .catch(() => {})
    .then(async () => {
      const db = await database();
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction("state", "readwrite");
          tx.objectStore("state").put(copy, "workspace");
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      } finally {
        db.close();
      }
    });
  return queue;
}
export function mergeWorkspace(a: Workspace, b: Workspace) {
  const records = { ...a.records };
  for (const [id, r] of Object.entries(b.records))
    if (!records[id] || r.updatedAt >= records[id].updatedAt) records[id] = r;
  const events = new Map([...a.activity, ...b.activity].map((e) => [e.id, e]));
  return cleanWorkspace({
    ...a,
    records,
    activity: [...events.values()].sort((a, b) => a.at - b.at),
  });
}
export function readSharedIds(hash: string) {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  return [
    ...new Set((params.get("shortlist") ?? "").split(",").filter(idOK)),
  ].slice(0, 40);
}
export function sharedUrl(ids: string[], base: string) {
  const url = new URL(base);
  url.hash =
    "shortlist=" + [...new Set(ids.filter(idOK))].slice(0, 40).join(",");
  return url.toString();
}
