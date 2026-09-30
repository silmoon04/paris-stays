import { test } from "node:test";
import assert from "node:assert/strict";
import { descriptionBlocks } from "../src/descriptions";
import { hostMessage } from "../src/host-messages";
import { readFileSync } from "node:fs";
import type { Snapshot } from "../src/domain";
import { matches, DEFAULT_FILTERS } from "../src/filters";
test("listing descriptions recover headings and lists without losing decimals or bed sizes", () => {
  const blocks = descriptionBlocks("A 75.5 m² home.The spaceIncludes:- Four queen-size beds (160 × 200 cm)- A kitchen.Guest accessMetro line 11.Other things to noteSelf check-in.");
  assert.ok(blocks.some(b => b.kind === "heading" && b.text === "The space"));
  assert.ok(blocks.some(b => b.kind === "list" && b.items?.length === 2));
  const text = JSON.stringify(blocks); assert.ok(text.includes("75.5")); assert.ok(text.includes("160 × 200 cm")); assert.ok(text.includes("queen-size")); assert.ok(text.includes("Self check-in"));
});
test("current host drafts ask about toilets and the actual missing access or table details", () => {
  const snapshot: Snapshot = JSON.parse(readFileSync("public/data/search.json", "utf8"));
  const stays = snapshot.stays.filter(s => matches(s, DEFAULT_FILTERS));
  assert.equal(stays.length, 2);
  for (const stay of stays) {
    const message = hostMessage(stay);
    assert.match(message, /three separate toilets/);
    assert.match(message, /working lift/);
    assert.match(message, /31 October–4 November 2026/);
    assert.ok(message.split(/\s+/).length < 120);
    if (stay.id === "1368691864450952013") assert.match(message, /dining table/);
  }
});
