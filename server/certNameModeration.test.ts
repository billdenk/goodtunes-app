import { test } from "node:test";
import assert from "node:assert/strict";
import { flagCertName, normalizeCertName } from "./certNameModeration";

test("normalizeCertName folds leet + strips separators", () => {
  assert.equal(normalizeCertName("f u c k"), "fuck");
  assert.equal(normalizeCertName("f.u.c.k"), "fuck");
  assert.equal(normalizeCertName("n1gg3r"), "nigger");
  assert.equal(normalizeCertName("F4GG0T"), "faggot");
  assert.equal(normalizeCertName("Jane Doe"), "janedoe");
});

test("flagCertName flags obvious profanity + slurs", () => {
  assert.equal(flagCertName("fuck you").flagged, true);
  assert.equal(flagCertName("f.u.c.k").flagged, true);
  assert.equal(flagCertName("n1gg3r").flagged, true);
  assert.deepEqual(flagCertName("you cunt").matches, ["cunt"]);
});

test("flagCertName never flags clean names", () => {
  assert.equal(flagCertName("Jane Doe").flagged, false);
  assert.equal(flagCertName("Nick Carter").flagged, false);
  assert.equal(flagCertName("María José").flagged, false);
});

test("flagCertName is null/empty safe", () => {
  assert.equal(flagCertName(null).flagged, false);
  assert.equal(flagCertName(undefined).flagged, false);
  assert.equal(flagCertName("   ").flagged, false);
});
