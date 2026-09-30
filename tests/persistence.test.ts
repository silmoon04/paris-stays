import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY,
  cleanWorkspace,
  loadWorkspace,
  saveWorkspace,
  mergeWorkspace,
  readSharedIds,
  sharedUrl,
  type Workspace,
} from "../src/persistence";
test("notes, hidden reasons and viewing history survive database reload", async () => {
  const w: Workspace = {
    ...structuredClone(EMPTY),
    records: {
      "123": {
        saved: true,
        hidden: true,
        whyLike: "Table for five",
        whyNot: "Steep stairs",
        viewedAt: Date.now(),
        updatedAt: Date.now(),
      },
    },
  };
  await saveWorkspace(w);
  assert.deepEqual((await loadWorkspace()).records, w.records);
});
test("activity older than ninety days is removed", () => {
  const w = structuredClone(EMPTY);
  w.activity = [
    { id: "old", type: "open", at: Date.now() - 91 * 86400000, data: {} },
    {
      id: "new",
      type: "photo",
      at: Date.now(),
      data: { index: 2, password: "forbidden" },
    },
  ];
  const clean = cleanWorkspace(w);
  assert.equal(clean.activity.length, 1);
  assert.deepEqual(clean.activity[0].data, { index: 2 });
});
test("family link contains IDs without personal notes", () => {
  const url = sharedUrl(
    ["123", "456", "bad", "123"],
    "https://silmoon04.github.io/paris-stays/",
  );
  assert.deepEqual(readSharedIds(new URL(url).hash), ["123", "456"]);
  assert.ok(!url.includes("whyLike"));
});
test("imports reject foreign format and preserve newer personal changes", () => {
  assert.throws(() => cleanWorkspace({ version: 2 }));
  const a = structuredClone(EMPTY),
    b = structuredClone(EMPTY);
  a.records["123"] = {
    saved: true,
    hidden: false,
    whyLike: "new",
    whyNot: "",
    viewedAt: null,
    updatedAt: Date.now(),
  };
  b.records["123"] = {
    ...a.records["123"],
    whyLike: "old",
    updatedAt: Date.now() - 100,
  };
  assert.equal(mergeWorkspace(a, b).records["123"].whyLike, "new");
});
