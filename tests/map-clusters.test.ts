import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeOverlappingGroups } from "../src/map-clusters";
const points = [
  { id: "a", x: 10, y: 10 },
  { id: "b", x: 40, y: 12 },
  { id: "c", x: 300, y: 100 },
];
const center = (items: typeof points) => ({
  x: items.reduce((n, p) => n + p.x, 0) / items.length,
  y: items.reduce((n, p) => n + p.y, 0) / items.length,
});
test("clusters remain stable when ranking changes the input order", () => {
  const groups = (items: typeof points) =>
    mergeOverlappingGroups(
      items.map((p) => [p]),
      center,
      { width: 90, height: 40 },
    ).map((g) => g.map((p) => p.id));
  assert.deepEqual(groups(points), groups([...points].reverse()));
  assert.deepEqual(groups(points), [["a", "b"], ["c"]]);
});
test("separated pins keep their original locations and every home remains reachable", () => {
  const groups = mergeOverlappingGroups(
    points.map((p) => [p]),
    center,
    { width: 20, height: 20 },
  );
  assert.equal(groups.length, 3);
  assert.deepEqual(
    groups
      .flat()
      .map((p) => p.id)
      .sort(),
    ["a", "b", "c"],
  );
  for (const g of groups) assert.deepEqual(center(g), { x: g[0].x, y: g[0].y });
});
