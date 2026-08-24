// Estimate "Start this project" auth-aware branching (Adam's signup loop):
// pure decisions shared by both estimate skins + the accepted page.
//
//   TSX_TSCONFIG_PATH=tsconfig.test.json \
//     npx tsx --test client/src/pages/mrp/estimateStartAuth.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  stepAfterConfirm,
  startsDirectly,
  stepAfterStartError,
  prefilledEstimateEmail,
  acceptedNextStepCopy,
} from "./estimateStartAuth";

test("an authenticated customer skips the account form entirely", () => {
  assert.equal(startsDirectly(true), true);
  assert.equal(stepAfterConfirm(true), "done");
});

test("a signed-out recipient still goes through the account step", () => {
  assert.equal(startsDirectly(false), false);
  assert.equal(stepAfterConfirm(false), "account");
});

test("ACCOUNT_EXISTS pivots the modal to the sign-in form — no dead end", () => {
  assert.equal(stepAfterStartError("ACCOUNT_EXISTS", "account"), "signin");
});

test("other errors (wrong password, generic) stay on the current step with inline error", () => {
  assert.equal(stepAfterStartError("INVALID_CREDENTIALS", "signin"), "signin");
  assert.equal(stepAfterStartError(undefined, "account"), "account");
  assert.equal(stepAfterStartError(null, "signin"), "signin");
});

test("email prefill (Task #3361): the address the estimate was sent to seeds the forms", () => {
  assert.equal(prefilledEstimateEmail("andrew+rockstar@goodtunes.music"), "andrew+rockstar@goodtunes.music");
  assert.equal(prefilledEstimateEmail("  padded@example.com  "), "padded@example.com");
  // No deliverable address on the estimate → empty seed, never junk.
  assert.equal(prefilledEstimateEmail(null), "");
  assert.equal(prefilledEstimateEmail(undefined), "");
  assert.equal(prefilledEstimateEmail("not-an-email"), "");
});

test("accepted page: signed-in viewer gets the continue variant, no second login form", () => {
  const c = acceptedNextStepCopy(true, "makesvinyl.com", "$2,500");
  assert.equal(c.title, "You're signed in — continue to your project");
  assert.equal(c.ctaLabel, "Continue to your project");
  assert.ok(c.body.includes("makesvinyl.com"));
  assert.ok(c.body.includes("$2,500"));
});

test("accepted page: signed-out viewer (fresh tab from the email) keeps the sign-in CTA", () => {
  const c = acceptedNextStepCopy(false, "makesvinyl.com", "$2,500");
  assert.equal(c.title, "Up next — sign in and upload audio & artwork");
  assert.equal(c.ctaLabel, "Sign in at makesvinyl.com");
});
