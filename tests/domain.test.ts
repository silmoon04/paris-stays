import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checks,
  confirmed,
  contradictions,
  ranking,
  TRIP,
  walkingMinutes,
  LANDMARKS,
  accessSummary,
  fact,
  value,
  type Stay,
  type Fact,
} from "../src/domain";
import { DEFAULT_FILTERS, facet, matches, filterChecks } from "../src/filters";
const f = (value: Fact["value"], extra: Partial<Fact> = {}): Fact => ({
  value,
  source: "listing",
  confidence: "high",
  evidence: "Test evidence",
  reviewedAt: new Date().toISOString(),
  ...extra,
});
function home(extra: Partial<Stay> = {}): Stay {
  return {
    id: "123456",
    title: "Family home",
    url: "https://www.airbnb.com/rooms/123456",
    lat: 48.863,
    lon: 2.34,
    zones: ["west"],
    capacity: 5,
    entireHome: true,
    advertisedBeds: 4,
    bedrooms: 3,
    bathrooms: 2,
    rating: 4.8,
    reviewCount: 30,
    photos: [],
    quote: {
      total: 1900,
      label: "£1,900 total",
      complete: true,
      available: true,
      checkedAt: new Date().toISOString(),
      checkIn: TRIP.checkIn,
      checkOut: TRIP.checkOut,
      adults: 5,
      currency: "GBP",
      fees: [{ label: "Taxes", amount: 80 }],
    },
    facts: {
      properBeds: f(4),
      bedrooms: f(3),
      toilets: f(3),
      showers: f(1),
      accessSuitable: f(true),
      diningSeats: f(6),
      kitchen: f(true),
    },
    summary: "",
    inputHash: "abc",
    ...extra,
  };
}
test("four beds in two bedrooms are distinct from the default bedroom requirement", () => {
  const s = home({ bedrooms: 2 });
  s.facts.bedrooms = f(2);
  assert.equal(confirmed(s), true);
  assert.equal(matches(s, DEFAULT_FILTERS), false);
});
test("three proper beds require deliberately relaxing the new default", () => {
  const s = home();
  s.facts.properBeds = f(3);
  assert.equal(matches(s, DEFAULT_FILTERS), false);
  assert.equal(matches(s, { ...DEFAULT_FILTERS, rules: { ...DEFAULT_FILTERS.rules, properBeds: { min: 3 } } }), true);
  s.facts.properBeds = f(2);
  assert.ok(contradictions(s).includes("Fewer than 3 proper beds"));
  assert.equal(matches(s, DEFAULT_FILTERS), false);
});
test("default search excludes fewer than three WCs or three bedrooms or four proper beds", () => {
  assert.equal(matches(home(), DEFAULT_FILTERS), true);
  for (const [key, count] of [["toilets", 2], ["bedrooms", 2], ["properBeds", 3]] as const) {
    const s = home();
    s.facts[key] = f(count);
    assert.equal(matches(s, DEFAULT_FILTERS), false, key);
  }
});
test("metadata establishes that fewer than four total beds or three bedrooms cannot fit", () => {
  const s = home({ advertisedBeds: 3, bedrooms: 2 });
  delete s.facts.properBeds;
  assert.equal(matches(s, DEFAULT_FILTERS), false);
  s.advertisedBeds = 4;
  delete s.facts.bedrooms;
  assert.equal(matches(s, DEFAULT_FILTERS), false);
});
test("partial photo bed counts remain unknown but photographic WCs are excluded", () => {
  const s = home();
  s.facts.properBeds = f(3, { extent: "at-least", source: "photos" });
  s.facts.toilets = f(2, { extent: "at-least", source: "photos" });
  assert.equal(matches(s, DEFAULT_FILTERS), false);
  assert.ok(filterChecks(s, DEFAULT_FILTERS).includes("Proper beds"));
  assert.ok(filterChecks(s, DEFAULT_FILTERS).includes("Toilet count"));
  assert.equal(matches(s, { ...DEFAULT_FILTERS, includeUnknown: false }), false);
  assert.equal(matches(s, { ...DEFAULT_FILTERS, onlyConfirmed: true }), false);
});
test("advertised total below three establishes an upper limit", () =>
  assert.ok(
    contradictions(home({ advertisedBeds: 2 })).includes(
      "Fewer than 3 beds advertised",
    ),
  ));
test("a lift does not excuse internal stairs or many entrance steps", () => {
  const s = home();
  s.facts.lift = f(true);
  s.facts.internalStairs = f(true);
  assert.equal(matches(s, DEFAULT_FILTERS), false);
  s.facts.internalStairs = f(false);
  s.facts.entranceSteps = f(3);
  assert.equal(matches(s, DEFAULT_FILTERS), true);
  assert.match(accessSummary(s).label, /Lift.*3 entrance steps/);
  s.facts.entranceSteps = f(9);
  assert.equal(matches(s, DEFAULT_FILTERS), false);
});
test("an upper floor explicitly without a lift is excluded", () => {
  const s = home();
  delete s.facts.accessSuitable;
  s.facts.floor = f(2);
  s.facts.lift = f(false);
  assert.equal(matches(s, DEFAULT_FILTERS), false);
});
test("destination estimates use each landmark rather than reusing Louvre time", () => {
  const s = home({ lat: 48.8606, lon: 2.3353 });
  const walks = LANDMARKS.map((landmark) =>
    walkingMinutes(s, landmark.coordinates),
  );
  assert.equal(walks[0], 1);
  assert.ok(walks[1]! > walks[2]!);
  assert.ok(walks[2]! > 1);
  assert.equal(walkingMinutes(home({ lat: null })), null);
});
test("toilets are independent of bathroom count", () => {
  const s = home({ bathrooms: 1 });
  assert.equal(confirmed(s), true);
  delete s.facts.toilets;
  assert.ok(checks(s).includes("Toilet count"));
});
test("two toilets need a relaxed filter and still rank below three", () => {
  const a = home(),
    b = home();
  b.facts.toilets = f(2);
  assert.equal(matches(b, DEFAULT_FILTERS), false);
  assert.equal(matches(b, { ...DEFAULT_FILTERS, rules: { ...DEFAULT_FILTERS.rules, toilets: { min: 2 } } }), true);
  assert.ok(ranking(a).score > ranking(b).score);
});
test("one pictured WC does not prove fewer than two exist", () => {
  const s = home();
  s.facts.toilets = f(1, {
    source: "photos",
    photoIndices: [0],
    extent: "at-least",
  });
  assert.equal(contradictions(s).length, 0);
  assert.ok(checks(s).includes("Toilet count"));
});
test("photographic WC counts are reported as excluded unknowns in facets", () => {
  const s = home();
  s.facts.toilets = f(2, {
    source: "photos",
    photoIndices: [0, 1],
    extent: "at-least",
  });
  const filters = { ...DEFAULT_FILTERS, rules: { toilets: { min: 3 } } };
  assert.equal(matches(s, filters), false);
  assert.equal(matches(s, { ...filters, includeUnknown: false }), false);
  assert.deepEqual(facet([s], filters, "toilets", { min: 3 }), {
    known: 0,
    unknown: 1,
    total: 0,
  });
});
test("unknown WC counts stay excluded when filters are removed or contradictions are shown", () => {
  const s = home({ bathrooms: 3 });
  delete s.facts.toilets;
  assert.equal(matches(s, DEFAULT_FILTERS), false);
  assert.equal(matches(s, { ...DEFAULT_FILTERS, rules: {}, includeExcluded: true }), false);
});
test("repeated bathroom photos cannot qualify or add a toilet ranking bonus", () => {
  const s = home(), unknown = home();
  delete unknown.facts.toilets;
  s.facts.toilets = f(3, { source: "photos", extent: "at-least", photoIndices: [0, 1, 2] });
  assert.equal(value(s, "toilets"), undefined);
  assert.equal(matches(s, DEFAULT_FILTERS), false);
  assert.equal(ranking(s).score, ranking(unknown).score);
});
test("photo enrichment cannot replace a supported listing WC count", () => {
  const s = home();
  s.enrichment = { model: "gpt-6-luna", inputHash: "abc", reviewedAt: new Date().toISOString(), summary: "",
    facts: { toilets: f(4, { source: "photos", extent: "at-least" }) } };
  assert.equal(value(s, "toilets"), 3);
  assert.equal(fact(s, "toilets")?.source, "listing");
  assert.equal(matches(s, DEFAULT_FILTERS), true);
  s.facts.toilets = f(2);
  assert.equal(matches(s, DEFAULT_FILTERS), false);
});
test("uncertain or review-derived WC counts cannot qualify", () => {
  for (const extra of [{ confidence: "low" }, { conflicts: ["Listing elsewhere says two WCs"] }, { source: "reviews" }] as Partial<Fact>[]) {
    const s = home();
    s.facts.toilets = f(3, extra);
    assert.equal(value(s, "toilets"), undefined);
    assert.equal(matches(s, DEFAULT_FILTERS), false);
  }
});
test("compatible listing lower bounds qualify while conflicting totals are excluded", () => {
  const s = home();
  s.facts.toilets = f(1, { extent: "at-least" });
  s.enrichment = { model: "gpt-6-luna", inputHash: "abc", reviewedAt: new Date().toISOString(), summary: "",
    facts: { toilets: f(3) } };
  assert.equal(matches(s, DEFAULT_FILTERS), true);
  s.facts.toilets = f(2);
  assert.equal(matches(s, DEFAULT_FILTERS), false);
  assert.equal(value(s, "toilets"), undefined);
});
test("photo shower counts are hidden but qualitative layout evidence remains usable", () => {
  const s = home();
  s.facts.showers = f(3, { source: "photos", extent: "at-least" });
  s.facts.showerLayout = f("over-bath", { source: "photos" });
  assert.equal(value(s, "showers"), undefined);
  assert.equal(value(s, "showerLayout"), "over-bath");
  assert.equal(matches(s, { ...DEFAULT_FILTERS, rules: { ...DEFAULT_FILTERS.rules, showers: { min: 1 } } }), false);
});
test("over-bath shower qualifies while stairs remain separate", () => {
  const s = home();
  s.facts.showerLayout = f("over-bath");
  s.facts.lift = f(true);
  s.facts.accessSuitable = f(false);
  assert.ok(contradictions(s).includes("Requires flights of stairs"));
});
test("unknowns included by default with counted alternatives", () => {
  const a = home(),
    b = home();
  delete b.facts.lift;
  a.facts.lift = f(true);
  const filters = { ...DEFAULT_FILTERS, rules: { lift: { eq: true } } };
  assert.equal(matches(b, filters), true);
  assert.deepEqual(facet([a, b], filters, "lift", { eq: true }), {
    known: 1,
    unknown: 1,
    total: 2,
  });
  assert.equal(matches(b, { ...filters, includeUnknown: false }), false);
});
test("full price for wrong dates or missing taxes is not confirmed", () => {
  const s = home();
  s.quote.complete = false;
  assert.equal(confirmed(s), false);
  s.quote.complete = true;
  s.quote.checkOut = "2026-11-05";
  assert.equal(confirmed(s), false);
});
test("stale quote requires rechecking", () => {
  const s = home();
  s.quote.checkedAt = new Date(Date.now() - 48 * 3600000).toISOString();
  assert.ok(checks(s).includes("Fresh quote"));
});
test("price is the stay total, not nightly multiplication", () => {
  const s = home();
  s.quote.total = 2600;
  assert.equal(matches(s, DEFAULT_FILTERS), false);
  s.quote.total = 625;
  assert.equal(matches(s, DEFAULT_FILTERS), true);
});
test("numeric facets exclude only themselves when counting", () => {
  const a = home(),
    b = home();
  b.facts.toilets = f(2);
  const filters = {
    ...DEFAULT_FILTERS,
    rules: { toilets: { min: 3 }, properBeds: { min: 4 } },
  };
  assert.deepEqual(facet([a, b], filters, "toilets", { min: 2 }), {
    known: 2,
    unknown: 0,
    total: 2,
  });
});
test("Any counts both known boolean states and unknowns", () => {
  const a = home(),
    b = home(),
    c = home();
  a.facts.lift = f(true);
  b.facts.lift = f(false);
  assert.deepEqual(facet([a, b, c], DEFAULT_FILTERS, "lift", {}), {
    known: 2,
    unknown: 1,
    total: 3,
  });
});
