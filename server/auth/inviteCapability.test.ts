import { test } from "node:test";
import assert from "node:assert/strict";
import { computeInviteCapability } from "./partnerPermissions";

// Task #1791 — these lock the surfaced invite capability to the carveouts
// in the POST /api/admin/invites gate. If the gate changes, both must move
// together (the UI reads this via /api/me/role and never re-derives it).

test("super_admin gets the unrestricted power form", () => {
  const cap = computeInviteCapability("super_admin", null, false);
  assert.equal(cap.canInvite, true);
  assert.equal(cap.allowAdvanced, true);
  // every role is targetable
  assert.ok(cap.allowedRoles.includes("super_admin"));
  assert.ok(cap.allowedRoles.includes("artist"));
  assert.ok(cap.allowedRoles.includes("non_profit"));
});

test("an artist with invite_subusers may invite artists + non-profits only", () => {
  const cap = computeInviteCapability("artist", "person-1", true);
  assert.deepEqual(cap, {
    canInvite: true,
    allowedRoles: ["artist", "non_profit"],
    allowAdvanced: false,
  });
});

test("a label with invite_subusers may invite artists + labels only", () => {
  const cap = computeInviteCapability("label", "label-1", true);
  assert.deepEqual(cap.allowedRoles, ["artist", "label"]);
  assert.equal(cap.allowAdvanced, false);
});

test("a manufacturer with invite_subusers may invite artists + labels", () => {
  const cap = computeInviteCapability("manufacturer", "press-1", true);
  assert.deepEqual(cap.allowedRoles, ["artist", "label"]);
});

test("fulfillment / vendor / manager may only grow their own team", () => {
  for (const role of ["fulfillment", "vendor", "manager"] as const) {
    const cap = computeInviteCapability(role, `${role}-1`, true);
    assert.deepEqual(cap.allowedRoles, [role], `${role} self-team`);
    assert.equal(cap.allowAdvanced, false);
  }
});

test("a partner without invite_subusers cannot invite", () => {
  const cap = computeInviteCapability("artist", "person-1", false);
  assert.deepEqual(cap, { canInvite: false, allowedRoles: [], allowAdvanced: false });
});

test("a partner with the verb but no scope cannot invite", () => {
  const cap = computeInviteCapability("label", null, true);
  assert.equal(cap.canInvite, false);
});

test("a non_profit caller can never invite (not a partner scope kind)", () => {
  // Andrew on the Nightbirde NPO: even handed the verb, non_profit is
  // absent from PARTNER_SCOPE_KINDS so the gate always 403s him.
  const cap = computeInviteCapability("non_profit", "org-1", true);
  assert.deepEqual(cap, { canInvite: false, allowedRoles: [], allowAdvanced: false });
});

test("an unscoped admin cannot invite", () => {
  const cap = computeInviteCapability("admin", null, true);
  assert.equal(cap.canInvite, false);
});
