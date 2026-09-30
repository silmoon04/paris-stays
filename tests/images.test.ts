import { test } from "node:test";
import assert from "node:assert/strict";
import { imageCandidates } from "../src/images";
test("gallery uses a supported CDN size and has an unsized fallback", () => {
  const candidates = imageCandidates(
    "https://a0.muscache.com/im/photo.jpeg?im_w=160&im_w=160&foo=1",
    240,
  );
  assert.equal(new URL(candidates[0]).searchParams.get("im_w"), "240");
  assert.deepEqual(new URL(candidates[0]).searchParams.getAll("im_w"), ["240"]);
  assert.equal(new URL(candidates[1]).searchParams.has("im_w"), false);
  assert.equal(new URL(candidates[1]).searchParams.get("foo"), "1");
});
