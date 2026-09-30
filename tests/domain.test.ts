import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checks,
  confirmed,
  contradictions,
  ranking,
  TRIP,
  type Stay,
  type Fact,
} from "../src/domain";
import { DEFAULT_FILTERS, facet, matches } from "../src/filters";
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
    bedrooms: 2,
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
test("four proper beds can be in two bedrooms", () =>
  assert.equal(confirmed(home()), true));
test("three proper beds and a sofa do not meet four beds", () => {
  const s = home();
  s.facts.properBeds = f(3);
  assert.ok(contradictions(s).includes("Fewer than 4 proper beds"));
  assert.equal(matches(s, DEFAULT_FILTERS), false);
});
test("advertised total below four establishes an upper limit", () =>
  assert.ok(
    contradictions(home({ advertisedBeds: 3 })).includes(
      "Fewer than 4 beds advertised",
    ),
  ));
test("toilets are independent of bathroom count", () => {
  const s = home({ bathrooms: 1 });
  assert.equal(confirmed(s), true);
  delete s.facts.toilets;
  assert.ok(checks(s).includes("Toilet count"));
});
test("two toilets qualify but score below three", () => {
  const a = home(),
    b = home();
  b.facts.toilets = f(2);
  assert.equal(matches(b, DEFAULT_FILTERS), true);
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
test("partial counts preserve unknown filter semantics", () => {
  const s = home();
  s.facts.toilets = f(2, {
    source: "photos",
    photoIndices: [0, 1],
    extent: "at-least",
  });
  const filters = { ...DEFAULT_FILTERS, rules: { toilets: { min: 3 } } };
  assert.equal(matches(s, filters), true);
  assert.equal(matches(s, { ...filters, includeUnknown: false }), false);
  assert.deepEqual(facet([s], filters, "toilets", { min: 3 }), {
    known: 0,
    unknown: 1,
    total: 1,
  });
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
