import {
  confirmed,
  contradictions,
  value,
  fact,
  quoteMatchesTrip,
  type Stay,
  type Fact,
} from "./domain";
export type Rule = { min?: number; max?: number; eq?: boolean | string };
export type Filters = {
  zone: "all" | "west" | "east" | "collected";
  query: string;
  includeUnknown: boolean;
  includeExcluded: boolean;
  onlyConfirmed: boolean;
  priceMax: number;
  ratingMin: number | null;
  minReviews: number | null;
  rules: Record<string, Rule>;
  bounds?: [number, number, number, number];
};
export const DEFAULT_FILTERS: Filters = {
  zone: "all",
  query: "",
  includeUnknown: true,
  includeExcluded: false,
  onlyConfirmed: false,
  priceMax: 2500,
  ratingMin: null,
  minReviews: null,
  rules: {},
};
export function passes(
  v: Fact["value"] | null | undefined,
  rule: Rule,
  unknown: boolean,
) {
  if (v === null || v === undefined) return unknown;
  if (rule.eq !== undefined) return v === rule.eq;
  if (rule.min === undefined && rule.max === undefined) return true;
  if (typeof v !== "number") return unknown;
  return (
    (rule.min === undefined || v >= rule.min) &&
    (rule.max === undefined || v <= rule.max)
  );
}
export function ruleValue(s: Stay, key: string, r: Rule) {
  const v = value(s, key);
  if (fact(s, key)?.extent === "at-least" && typeof v === "number") {
    if (
      (r.min !== undefined && r.min > v) ||
      (r.max !== undefined && r.max >= v)
    )
      return undefined;
  }
  return v;
}
export function matches(s: Stay, f: Filters, omit?: string) {
  if (
    (f.zone === "all" && !s.zones.length) ||
    (f.zone === "west" && !s.zones.includes("west")) ||
    (f.zone === "east" && !s.zones.includes("east"))
  )
    return false;
  if (!f.includeExcluded && contradictions(s).length) return false;
  if (f.onlyConfirmed && !confirmed(s)) return false;
  if (
    f.bounds &&
    (s.lat === null ||
      s.lon === null ||
      s.lat < f.bounds[0] ||
      s.lon < f.bounds[1] ||
      s.lat > f.bounds[2] ||
      s.lon > f.bounds[3])
  )
    return false;
  if (
    f.query &&
    !`${s.title} ${s.summary} ${s.enrichment?.summary ?? ""} ${Object.values(
      s.enrichment?.facts ?? {},
    )
      .map((x) => x.evidence)
      .join(" ")}`
      .toLowerCase()
      .includes(f.query.toLowerCase().trim())
  )
    return false;
  if (
    omit !== "price" &&
    !passes(
      quoteMatchesTrip(s.quote) ? s.quote.total : null,
      { max: f.priceMax },
      f.includeUnknown,
    )
  )
    return false;
  if (
    omit !== "rating" &&
    f.ratingMin !== null &&
    !passes(s.rating, { min: f.ratingMin }, f.includeUnknown)
  )
    return false;
  if (
    omit !== "reviewCount" &&
    f.minReviews !== null &&
    !passes(s.reviewCount, { min: f.minReviews }, f.includeUnknown)
  )
    return false;
  return Object.entries(f.rules).every(
    ([key, rule]) =>
      key === omit || passes(ruleValue(s, key, rule), rule, f.includeUnknown),
  );
}
export function facet(stays: Stay[], f: Filters, key: string, rule: Rule) {
  const others = stays.filter((s) => matches(s, f, key));
  let known = 0,
    unknown = 0;
  for (const s of others) {
    const v =
      key === "rating"
        ? s.rating
        : key === "reviewCount"
          ? s.reviewCount
          : key === "price"
            ? s.quote.total
            : ruleValue(s, key, rule);
    if (v === null || v === undefined) unknown++;
    else if (passes(v, rule, false)) known++;
  }
  return { known, unknown, total: known + (f.includeUnknown ? unknown : 0) };
}
export function recovery(stays: Stay[], f: Filters) {
  const suggestions: { label: string; filters: Filters; count: number }[] = [];
  if (!f.includeUnknown) {
    const next = { ...f, includeUnknown: true };
    suggestions.push({
      label: "Include missing details",
      filters: next,
      count: stays.filter((s) => matches(s, next)).length,
    });
  }
  for (const key of Object.keys(f.rules)) {
    const rules = { ...f.rules };
    delete rules[key];
    const next = { ...f, rules };
    suggestions.push({
      label: `Remove ${key} filter`,
      filters: next,
      count: stays.filter((s) => matches(s, next)).length,
    });
  }
  if (f.bounds) {
    const next = { ...f, bounds: undefined };
    suggestions.push({
      label: "Search both areas",
      filters: next,
      count: stays.filter((s) => matches(s, next)).length,
    });
  }
  if (f.onlyConfirmed) {
    const next = { ...f, onlyConfirmed: false };
    suggestions.push({
      label: "Include homes to check",
      filters: next,
      count: stays.filter((s) => matches(s, next)).length,
    });
  }
  return suggestions
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);
}
