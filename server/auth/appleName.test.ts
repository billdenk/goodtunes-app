// Unit coverage for the Apple first-auth name capture.
//
// Apple includes the user's real name ONLY in the form_post callback's
// `user` body, and ONLY on the very first authorization. This guards that:
//   - a first-auth Apple body folds firstName + lastName into identity.name
//   - the body may arrive as a JSON string (real form_post) or an object
//   - it's a no-op for Google, and for Apple sign-ins with no `user` body
//   - partial / missing / malformed names don't clobber or throw
//
// Pure function — runs under Node's built-in runner via tsx:
//   npx tsx --test server/auth/appleName.test.ts

import test from "node:test";
import assert from "node:assert/strict";

import { applyAppleFirstAuthName } from "./appleName";

const baseIdentity = () => ({
  sub: "001",
  email: "fan@example.com",
  emailVerified: true,
  name: null as string | null,
});

test("folds Apple firstName + lastName into identity.name (string body)", () => {
  const identity = baseIdentity();
  applyAppleFirstAuthName(identity, "apple", {
    user: JSON.stringify({ name: { firstName: "Bill", lastName: "Denk" } }),
  });
  assert.equal(identity.name, "Bill Denk");
});

test("accepts an already-parsed object body too", () => {
  const identity = baseIdentity();
  applyAppleFirstAuthName(identity, "apple", {
    user: { name: { firstName: "Bill", lastName: "Denk" } },
  });
  assert.equal(identity.name, "Bill Denk");
});

test("first or last name alone still produces a name", () => {
  const firstOnly = baseIdentity();
  applyAppleFirstAuthName(firstOnly, "apple", {
    user: { name: { firstName: "Bill" } },
  });
  assert.equal(firstOnly.name, "Bill");

  const lastOnly = baseIdentity();
  applyAppleFirstAuthName(lastOnly, "apple", {
    user: { name: { lastName: "Denk" } },
  });
  assert.equal(lastOnly.name, "Denk");
});

test("is a no-op for Google even when a user body is present", () => {
  const identity = baseIdentity();
  applyAppleFirstAuthName(identity, "google", {
    user: JSON.stringify({ name: { firstName: "Bill", lastName: "Denk" } }),
  });
  assert.equal(identity.name, null);
});

test("is a no-op for Apple sign-ins with no user body (every sign-in after the first)", () => {
  const identity = baseIdentity();
  applyAppleFirstAuthName(identity, "apple", {});
  assert.equal(identity.name, null);
  applyAppleFirstAuthName(identity, "apple", undefined);
  assert.equal(identity.name, null);
});

test("preserves an existing name when the body carries no usable name", () => {
  const identity = { ...baseIdentity(), name: "Existing Name" };
  applyAppleFirstAuthName(identity, "apple", { user: { name: {} } });
  assert.equal(identity.name, "Existing Name");
});

test("malformed JSON body doesn't throw and leaves name untouched", () => {
  const identity = baseIdentity();
  assert.doesNotThrow(() =>
    applyAppleFirstAuthName(identity, "apple", { user: "{not valid json" }),
  );
  assert.equal(identity.name, null);
});

test("returns the same identity object it was given", () => {
  const identity = baseIdentity();
  const out = applyAppleFirstAuthName(identity, "apple", {
    user: { name: { firstName: "Bill", lastName: "Denk" } },
  });
  assert.equal(out, identity);
});
