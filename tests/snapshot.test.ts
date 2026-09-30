import { test } from "node:test";
import assert from "node:assert/strict";
// Build transforms are also used when rebuilding the published source snapshot.
// @ts-expect-error The build helper is plain JavaScript.
import { compactStay } from "../scripts/snapshot.mjs";

test("search keeps Luna's selected cover without downloading full gallery metadata", () => {
  const photos = [{ url: "first" }, { url: "chosen" }, { url: "last" }];
  const stay = { id: "123", photos, enrichment: { photoReview: { bestPhotoIndex: 1, viewedPhotoIndices: [0, 1] } } };
  const compact = compactStay(stay, photos);
  assert.deepEqual(compact.photos, [{ url: "chosen" }]);
  assert.equal(compact.photoCount, 3);
  assert.deepEqual(stay.photos, photos);
  assert.deepEqual(compactStay(compact, photos), compact);
});
test("an unsupported cover falls back safely and empty galleries remain empty", () => {
  assert.deepEqual(compactStay({ enrichment: { photoReview: { bestPhotoIndex: 5, viewedPhotoIndices: [5] } } }, [{ url: "first" }]).photos, [{ url: "first" }]);
  assert.deepEqual(compactStay({}, []).photos, []);
});
