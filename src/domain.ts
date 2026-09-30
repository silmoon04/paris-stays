export type Source = "listing" | "photos" | "reviews";
export type Fact = {
  value: boolean | number | string | string[];
  source: Source;
  confidence: "high" | "medium" | "low";
  evidence: string;
  extent?: "exact" | "at-least";
  photoIndices?: number[];
  reviewIds?: string[];
  conflicts?: string[];
  reviewedAt: string;
};
export type Trip = {
  checkIn: string;
  checkOut: string;
  nights: number;
  adults: number;
  currency: "GBP";
  budget: number;
};
export const TRIP: Trip = {
  checkIn: "2026-10-31",
  checkOut: "2026-11-04",
  nights: 4,
  adults: 5,
  currency: "GBP",
  budget: 2500,
};
export const LOUVRE: [number, number] = [48.8606, 2.3353];
export const ZONES = {
  west: {
    label: "Louvre · Palais Royal · Opéra",
    short: "Louvre & Opéra",
    bounds: [48.857, 2.316, 48.878, 2.345] as const,
  },
  east: {
    label: "Châtelet · Les Halles · Pompidou",
    short: "Les Halles & Pompidou",
    bounds: [48.855, 2.34, 48.872, 2.362] as const,
  },
};
export type Zone = keyof typeof ZONES;
export type Quote = {
  total: number | null;
  label: string;
  complete: boolean;
  available: boolean | null;
  checkedAt: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  currency: string;
  fees: { label: string; amount: number }[];
};
export type Photo = { url: string; caption: string };
export type Enrichment = {
  model: "gpt-6-luna";
  inputHash: string;
  reviewedAt: string;
  facts: Record<string, Fact>;
  summary: string;
  photoReview?: {
    viewedPhotoIndices: number[];
    bestPhotoIndex: number | null;
    bestPhotoReason: string;
    interiorPhotos?: boolean;
    kitchenPhotoIndices: number[];
    bathroomPhotoIndices: number[];
    bedPhotoIndices: number[];
    accessPhotoIndices: number[];
    issues: string[];
  };
  reviewSummary?: {
    sampleCount: number;
    themes: string[];
    concerns: string[];
    conflicts: string[];
  };
  deepReview?: { reviewedAt: string; note: string; photoIndices: number[] };
};
export type Stay = {
  id: string;
  title: string;
  url: string;
  lat: number | null;
  lon: number | null;
  zones: Zone[];
  capacity: number | null;
  entireHome: boolean | null;
  advertisedBeds: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  rating: number | null;
  reviewCount: number | null;
  photos: Photo[];
  quote: Quote;
  facts: Record<string, Fact>;
  summary: string;
  inputHash: string;
  enrichment?: Enrichment;
};
export type Snapshot = {
  meta: {
    collectedAt: string;
    rawRows: number;
    uniqueListings: number;
    inAreas: number;
    chargedUsd: number;
    coverage: string;
    searches: { label: string; count: number }[];
    trip: Trip;
  };
  stays: Stay[];
};
export type Detail = {
  description: string;
  amenities: { title: string; available: boolean; subtitle: string }[];
  cancellation: string[];
  rules: string[];
  facts: Record<string, Fact>;
  enrichment?: Enrichment;
  photoCaptions?: string[];
};
export type Field = {
  key: string;
  label: string;
  group: string;
  kind: "number" | "boolean" | "enum";
  options?: { value: string; label: string }[];
  unit?: string;
  min?: number;
  max?: number;
};
export const FIELDS: Field[] = [
  {
    key: "properBeds",
    label: "Proper beds",
    group: "Beds & space",
    kind: "number",
    unit: "beds",
    min: 1,
    max: 10,
  },
  {
    key: "bedrooms",
    label: "Bedrooms",
    group: "Beds & space",
    kind: "number",
    unit: "rooms",
    min: 1,
    max: 8,
  },
  {
    key: "areaM2",
    label: "Stated floor area",
    group: "Beds & space",
    kind: "number",
    unit: "m²",
    min: 0,
    max: 300,
  },
  {
    key: "toilets",
    label: "Toilets / WCs",
    group: "Toilets & showers",
    kind: "number",
    unit: "WCs",
    min: 1,
    max: 5,
  },
  {
    key: "showers",
    label: "Showers",
    group: "Toilets & showers",
    kind: "number",
    unit: "showers",
    min: 1,
    max: 4,
  },
  {
    key: "showerLayout",
    label: "Shower layout",
    group: "Toilets & showers",
    kind: "enum",
    options: [
      { value: "separate", label: "Separate shower" },
      { value: "over-bath", label: "Over a bathtub" },
      { value: "both", label: "Both kinds" },
    ],
  },
  { key: "lift", label: "Lift advertised", group: "Access", kind: "boolean" },
  {
    key: "floor",
    label: "Floor",
    group: "Access",
    kind: "number",
    unit: "floor",
    min: -1,
    max: 10,
  },
  {
    key: "entranceSteps",
    label: "Entrance steps",
    group: "Access",
    kind: "number",
    unit: "steps",
    min: 0,
    max: 20,
  },
  {
    key: "internalStairs",
    label: "Stairs inside home",
    group: "Access",
    kind: "boolean",
  },
  {
    key: "accessSuitable",
    label: "No required flights of stairs",
    group: "Access",
    kind: "boolean",
  },
  {
    key: "diningSeats",
    label: "Dining seats",
    group: "Kitchen & dining",
    kind: "number",
    unit: "seats",
    min: 1,
    max: 12,
  },
  {
    key: "kitchen",
    label: "Kitchen",
    group: "Kitchen & dining",
    kind: "boolean",
  },
  {
    key: "kitchenQuality",
    label: "Kitchen appearance",
    group: "Kitchen & dining",
    kind: "enum",
    options: [
      { value: "modern", label: "Modern appearance" },
      { value: "functional", label: "Functional appearance" },
      { value: "dated", label: "Dated appearance" },
    ],
  },
  {
    key: "tableImpression",
    label: "Dining space in photos",
    group: "Kitchen & dining",
    kind: "enum",
    options: [
      { value: "spacious", label: "Spacious looking" },
      { value: "compact", label: "Compact looking" },
    ],
  },
  {
    key: "dishwasher",
    label: "Dishwasher",
    group: "Kitchen & dining",
    kind: "boolean",
  },
  { key: "oven", label: "Oven", group: "Kitchen & dining", kind: "boolean" },
  {
    key: "hob",
    label: "Hob / cooker",
    group: "Kitchen & dining",
    kind: "boolean",
  },
  {
    key: "fridge",
    label: "Fridge",
    group: "Kitchen & dining",
    kind: "boolean",
  },
  {
    key: "washingMachine",
    label: "Washing machine",
    group: "Comfort",
    kind: "boolean",
  },
  {
    key: "airConditioning",
    label: "Air conditioning",
    group: "Comfort",
    kind: "boolean",
  },
  { key: "wifi", label: "Wi-Fi", group: "Comfort", kind: "boolean" },
  {
    key: "cancellation",
    label: "Cancellation",
    group: "Booking",
    kind: "enum",
    options: [
      { value: "flexible", label: "Free cancellation stated" },
      { value: "limited", label: "Limited / non-refundable" },
    ],
  },
];
export const FACT_LABELS = Object.fromEntries(
  FIELDS.map((f) => [f.key, f.label]),
);
export function value(stay: Stay, key: string): Fact["value"] | undefined {
  const f = fact(stay, key);
  return f?.conflicts?.length ? undefined : f?.value;
}
export function fact(stay: Stay, key: string): Fact | undefined {
  return stay.enrichment?.facts[key] ?? stay.facts[key];
}
export function factDisplay(stay: Stay, key: string) {
  const f = fact(stay, key),
    v = value(stay, key);
  if (v === undefined) return "Unknown";
  const display =
    typeof v === "boolean"
      ? v
        ? "Yes"
        : "No"
      : Array.isArray(v)
        ? v.join(", ")
        : String(v);
  return (f?.extent === "at-least" ? "At least " : "") + display;
}
export function money(n: number | null) {
  return n === null
    ? "Price to check"
    : new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: "GBP",
        maximumFractionDigits: 0,
      }).format(n);
}
export function quoteMatchesTrip(q: Quote) {
  return (
    q.checkIn === TRIP.checkIn &&
    q.checkOut === TRIP.checkOut &&
    q.adults === TRIP.adults &&
    q.currency === "GBP"
  );
}
export function walkingMinutes(s: Stay) {
  if (s.lat === null || s.lon === null) return null;
  const rad = Math.PI / 180,
    a =
      Math.sin(((s.lat - LOUVRE[0]) * rad) / 2) ** 2 +
      Math.cos(s.lat * rad) *
        Math.cos(LOUVRE[0] * rad) *
        Math.sin(((s.lon - LOUVRE[1]) * rad) / 2) ** 2;
  return Math.max(
    1,
    Math.round(
      (6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 1.3) / 75,
    ),
  );
}
export function coverIndex(s: Stay) {
  const r = s.enrichment?.photoReview;
  return r &&
    r.bestPhotoIndex !== null &&
    r.viewedPhotoIndices.includes(r.bestPhotoIndex) &&
    s.photos[r.bestPhotoIndex]
    ? r.bestPhotoIndex
    : 0;
}
export function contradictions(s: Stay): string[] {
  const reasons: string[] = [];
  if (!s.zones.length) reasons.push("Outside both search areas");
  if (s.entireHome === false) reasons.push("Not an entire home");
  if (s.advertisedBeds !== null && s.advertisedBeds < 4)
    reasons.push("Fewer than 4 beds advertised");
  if (s.capacity !== null && s.capacity < 5) reasons.push("Capacity below 5");
  if (s.quote.available === false) reasons.push("Unavailable for the trip");
  if (s.quote.total !== null && s.quote.total > 2500)
    reasons.push("Above £2,500");
  for (const [key, min, label] of [
    ["properBeds", 4, "Fewer than 4 proper beds"],
    ["toilets", 2, "Fewer than 2 toilets"],
    ["showers", 1, "No shower"],
    ["diningSeats", 5, "Table seats fewer than 5"],
  ] as const) {
    const v = value(s, key);
    if (typeof v === "number" && v < min && fact(s, key)?.extent !== "at-least")
      reasons.push(label);
  }
  if (value(s, "accessSuitable") === false)
    reasons.push("Requires flights of stairs");
  if (value(s, "kitchen") === false) reasons.push("No kitchen");
  return reasons;
}
export function checks(s: Stay): string[] {
  const out: string[] = [];
  if (!s.quote.complete || !quoteMatchesTrip(s.quote) || s.quote.total === null)
    out.push("Full trip price");
  if (s.quote.available !== true) out.push("Availability");
  if (
    !Number.isFinite(Date.parse(s.quote.checkedAt)) ||
    Date.now() - Date.parse(s.quote.checkedAt) > 86400000
  )
    out.push("Fresh quote");
  if (s.entireHome !== true) out.push("Entire home");
  if (s.capacity === null) out.push("Capacity");
  for (const [k, l] of [
    ["properBeds", "Proper beds"],
    ["toilets", "Toilet count"],
    ["showers", "Shower"],
    ["accessSuitable", "Stair access"],
    ["diningSeats", "Table for five"],
    ["kitchen", "Kitchen"],
  ] as const)
    if (
      value(s, k) === undefined ||
      (fact(s, k)?.extent === "at-least" &&
        typeof value(s, k) === "number" &&
        Number(value(s, k)) <
          (
            { properBeds: 4, toilets: 2, showers: 1, diningSeats: 5 } as Record<
              string,
              number
            >
          )[k])
    )
      out.push(l);
  if (s.enrichment?.reviewSummary?.conflicts.length)
    out.push("Review conflicts");
  return out;
}
export function confirmed(s: Stay) {
  return !contradictions(s).length && !checks(s).length;
}
export function ranking(s: Stay) {
  let score = 0;
  const reasons: string[] = [];
  const add = (n: number, text: string) => {
    score += n;
    reasons.push(text);
  };
  const wc = value(s, "toilets");
  if (typeof wc === "number") {
    if (wc >= 3) add(28, "3+ toilets");
    else if (wc === 2) add(12, "2 toilets; below your preference");
  }
  if (value(s, "accessSuitable") === true) add(18, "Stair access supported");
  if (
    value(s, "properBeds") !== undefined &&
    Number(value(s, "properBeds")) >= 4
  )
    add(14, "4+ proper beds");
  if (s.rating !== null && s.rating >= 4.7) {
    add(10, "Strong rating");
    if ((s.reviewCount ?? 0) >= 20) add(5, "20+ reviews");
  }
  if (Number(value(s, "diningSeats")) >= 5) add(12, "Dining for five");
  if (value(s, "kitchen") === true) add(5, "Kitchen advertised");
  if (s.quote.total !== null && quoteMatchesTrip(s.quote)) {
    score += Math.max(0, 12 * (1 - s.quote.total / 2500));
    if (s.quote.complete) add(4, "Full trip quote");
  }
  const walk = walkingMinutes(s);
  if (walk !== null) score += Math.max(0, 8 - walk / 5);
  score -= checks(s).length * 2;
  score -= (s.enrichment?.reviewSummary?.concerns.length ?? 0) * 3;
  score -= (s.enrichment?.reviewSummary?.conflicts.length ?? 0) * 8;
  score -= contradictions(s).length * 50;
  return { score, reasons };
}
