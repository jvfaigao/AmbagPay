import { test } from "node:test";
import assert from "node:assert/strict";
import { signParams } from "./cloudinary.ts";

// Both expected values are the worked examples in Cloudinary's "authentication signatures" docs.
test("signature matches Cloudinary's documented examples", () => {
  assert.equal(signParams({ timestamp: "1315060510" }, "abcd"), "a21ad0f63beb4de2e5575204b79ab90bffb02c10");
  assert.equal(
    signParams({ timestamp: "1315060510", public_id: "sample_image", eager: "w_400,h_300,c_pad|w_260,h_200,c_crop" }, "abcd"),
    "bfd09f95f331f558cbd1320e67aa8d488770583e",
  );
});
