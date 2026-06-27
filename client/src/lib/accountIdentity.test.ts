// Unit coverage for the Account profile-header identity derivation.
//
// Guards the "profile leads with the name, never the email" behavior:
//   - real name preferred over display name
//   - two-letter uppercase initials ("Bill Denk" → "BD")
//   - the @handle line shows ONLY when both a name AND a handle exist
//   - the email is never used as the identity line or initials
//
// Pure function, no DOM needed — runs under Node's built-in runner via tsx:
//   npx tsx --test client/src/lib/accountIdentity.test.ts

import test from "node:test";
import assert from "node:assert/strict";

import { deriveAccountIdentity } from "./accountIdentity";

test("real name is preferred over display name", () => {
  const id = deriveAccountIdentity({ realName: "Bill Denk", displayName: "billd" });
  assert.equal(id.fullName, "Bill Denk");
  assert.equal(id.nameLine, "Bill Denk");
});

test("falls back to display name when there's no real name", () => {
  const id = deriveAccountIdentity({ realName: "", displayName: "DJ Cool" });
  assert.equal(id.fullName, "DJ Cool");
  assert.equal(id.nameLine, "DJ Cool");
  assert.equal(id.initials, "DC");
});

test("'Bill Denk' yields two-letter uppercase initials 'BD'", () => {
  const id = deriveAccountIdentity({ realName: "Bill Denk" });
  assert.equal(id.initials, "BD");
});

test("a single-word name gives first-cap, second-lowercase initials", () => {
  const id = deriveAccountIdentity({ realName: "Bill" });
  assert.equal(id.initials, "Bi");
});

test("three-or-more words use the first and last initials", () => {
  const id = deriveAccountIdentity({ realName: "Mary Jane Watson" });
  assert.equal(id.initials, "MW");
});

test("extra whitespace between names doesn't create empty initials", () => {
  const id = deriveAccountIdentity({ realName: "  Bill   Denk  " });
  assert.equal(id.fullName, "Bill   Denk");
  assert.equal(id.initials, "BD");
});

test("the @handle line shows only when BOTH a name and a handle exist", () => {
  const withBoth = deriveAccountIdentity({ realName: "Bill Denk", handle: "billd" });
  assert.equal(withBoth.showHandleLine, true);
  assert.equal(withBoth.nameLine, "Bill Denk");
  assert.equal(withBoth.handle, "billd");

  // Handle but no name → the handle becomes the primary line, no second line.
  const handleOnly = deriveAccountIdentity({ handle: "billd" });
  assert.equal(handleOnly.showHandleLine, false);
  assert.equal(handleOnly.nameLine, "@billd");

  // Name but no handle → no second line.
  const nameOnly = deriveAccountIdentity({ realName: "Bill Denk" });
  assert.equal(nameOnly.showHandleLine, false);
  assert.equal(nameOnly.nameLine, "Bill Denk");
});

test("handle falls back to username", () => {
  const id = deriveAccountIdentity({ username: "legacyname" });
  assert.equal(id.handle, "legacyname");
  assert.equal(id.nameLine, "@legacyname");
  assert.equal(id.initials, "Le");
});

test("email is never used for the identity line or initials", () => {
  const id = deriveAccountIdentity({ email: "bill@example.com" });
  assert.equal(id.fullName, "");
  assert.equal(id.handle, "");
  assert.equal(id.nameLine, "Your account");
  assert.notEqual(id.nameLine, "bill@example.com");
  assert.equal(id.initials, "?");
});

test("a totally empty / missing user falls back cleanly", () => {
  for (const u of [undefined, null, {}]) {
    const id = deriveAccountIdentity(u as any);
    assert.equal(id.nameLine, "Your account");
    assert.equal(id.initials, "?");
    assert.equal(id.showHandleLine, false);
  }
});
