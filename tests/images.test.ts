import { test } from "node:test";
import assert from "node:assert/strict";
import { imageCandidates } from "../src/images";
test("static photo cache precedes CDN fallbacks and rejects arbitrary cache URLs", () => {
  const local = "/paris-stays/photos/1234567890abcdef12345678.jpg";
  assert.equal(imageCandidates("https://a0.muscache.com/a.jpg", 720, local)[0], local);
  assert.ok(imageCandidates("https://a0.muscache.com/a.jpg", 720, local).length === 3);
  assert.ok(!imageCandidates("https://a0.muscache.com/a.jpg", 720, "https://untrusted.example/picture").includes("https://untrusted.example/picture"));
});
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
