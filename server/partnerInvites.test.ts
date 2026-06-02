// Task #964 — unit coverage for the self-serve partner invite carveout
// rules (artist→artist/label, label→artist/label).
//
// These guard the *decision* helpers the real route handlers in
// server/routes.ts import — not a mirror — so a future change that
// widens who can invite whom, breaks the per-scope outstanding cap, or
// leaks an accept link for a held/revoked invite makes a test go red.
//
// Pure functions, no DB, Node's built-in runner (same pattern as
// shared/albumStage.test.ts):
//
//   npx tsx --test server/partnerInvites.test.ts
//
// The raw read SQL builders (sqlPartnerInviteList /
// sqlPartnerOutstandingInviteToEmail) are column-validated separately by
// scripts/db-query-smoke.ts, which EXPLAINs them against the real schema.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SELF_SERVE_INVITEE_ROLES,
  isAllowedSelfServeInviteeRole,
  ownsPartnerInvite,
  partnerInviteAcceptUrl,
  isOutstandingInvite,
  isOverOutstandingCap,
} from "./partnerInvites";
import { ARTIST_INVITE_OUTSTANDING_LIMIT } from "@shared/schema";

// ---------------------------------------------------------------------------
// Carveout — a self-serve partner may mint ONLY artist + label, nothing else.
// ---------------------------------------------------------------------------

test("carveout: artist is an allowed invitee role", () => {
  assert.equal(isAllowedSelfServeInviteeRole("artist"), true);
});

test("carveout: label is an allowed invitee role", () => {
  assert.equal(isAllowedSelfServeInviteeRole("label"), true);
});

test("carveout: the allowed set is exactly [artist, label]", () => {
  assert.deepEqual([...SELF_SERVE_INVITEE_ROLES].sort(), ["artist", "label"]);
});

test("carveout: privileged + partner roles are rejected as invitee roles", () => {
  for (const role of [
    "super_admin",
    "admin",
    "manufacturer",
    "fulfillment",
    "vendor",
    "non_profit",
    "ambassador",
    "",
    "ARTIST", // case-sensitive on purpose — the body is lower-cased upstream
    "artist ", // trailing space — upstream trims before this check
  ]) {
    assert.equal(isAllowedSelfServeInviteeRole(role), false, `expected ${JSON.stringify(role)} to be rejected`);
  }
});

// ---------------------------------------------------------------------------
// Ownership guard — one partner can't resend/revoke another's invite (→ 403).
// ---------------------------------------------------------------------------

const ARTIST_SCOPE = "artist-scope-1";
const LABEL_SCOPE = "label-scope-1";

test("ownership: an artist owns its own artist-referred invite", () => {
  const invite = { referrerKind: "artist", referrerScopeId: ARTIST_SCOPE };
  assert.equal(ownsPartnerInvite(invite, "artist", ARTIST_SCOPE), true);
});

test("ownership: another artist's scope id does not own this invite", () => {
  const invite = { referrerKind: "artist", referrerScopeId: ARTIST_SCOPE };
  assert.equal(ownsPartnerInvite(invite, "artist", "artist-scope-2"), false);
});

test("ownership: a label can't claim an artist-referred invite even with the same scope id", () => {
  const invite = { referrerKind: "artist", referrerScopeId: ARTIST_SCOPE };
  assert.equal(ownsPartnerInvite(invite, "label", ARTIST_SCOPE), false);
});

test("ownership: a label owns its own label-referred invite", () => {
  const invite = { referrerKind: "label", referrerScopeId: LABEL_SCOPE };
  assert.equal(ownsPartnerInvite(invite, "label", LABEL_SCOPE), true);
});

test("ownership: a press/manufacturer-referred invite is owned by no self-serve partner", () => {
  const invite = { referrerKind: "manufacturer", referrerScopeId: ARTIST_SCOPE };
  assert.equal(ownsPartnerInvite(invite, "artist", ARTIST_SCOPE), false);
  assert.equal(ownsPartnerInvite(invite, "label", ARTIST_SCOPE), false);
});

test("ownership: an invite with no referrer chain (super-admin issued) is unowned", () => {
  const invite = { referrerKind: null, referrerScopeId: null };
  assert.equal(ownsPartnerInvite(invite, "artist", ARTIST_SCOPE), false);
});

test("ownership: a missing invite is never owned", () => {
  assert.equal(ownsPartnerInvite(null, "artist", ARTIST_SCOPE), false);
  assert.equal(ownsPartnerInvite(undefined, "label", LABEL_SCOPE), false);
});

// ---------------------------------------------------------------------------
// Accept link — exposed only for live, un-held invites (the token is bearer).
// ---------------------------------------------------------------------------

const buildUrl = (t: string) => `https://goodtunes.test/invite/${t}`;

test("acceptUrl: a live, not-required invite exposes its link", () => {
  const url = partnerInviteAcceptUrl(
    { token: "tok123", usedAt: null, revokedAt: null, reviewStatus: "not_required" },
    buildUrl,
  );
  assert.equal(url, "https://goodtunes.test/invite/tok123");
});

test("acceptUrl: a held-for-review invite never exposes its link", () => {
  const url = partnerInviteAcceptUrl(
    { token: "tok123", usedAt: null, revokedAt: null, reviewStatus: "pending_review" },
    buildUrl,
  );
  assert.equal(url, null);
});

test("acceptUrl: a used (accepted) invite never exposes its link", () => {
  const url = partnerInviteAcceptUrl(
    { token: "tok123", usedAt: new Date(), revokedAt: null, reviewStatus: "not_required" },
    buildUrl,
  );
  assert.equal(url, null);
});

test("acceptUrl: a revoked invite never exposes its link", () => {
  const url = partnerInviteAcceptUrl(
    { token: "tok123", usedAt: null, revokedAt: new Date(), reviewStatus: "not_required" },
    buildUrl,
  );
  assert.equal(url, null);
});

test("acceptUrl: a live invite with no token can't build a link", () => {
  const url = partnerInviteAcceptUrl(
    { token: null, usedAt: null, revokedAt: null, reviewStatus: "not_required" },
    buildUrl,
  );
  assert.equal(url, null);
});

// ---------------------------------------------------------------------------
// Outstanding cap — counts only un-accepted, un-revoked, un-expired invites,
// and the cap is reached at-or-above the per-scope limit.
// ---------------------------------------------------------------------------

const FUTURE = new Date("2030-01-01");
const PAST = new Date("2020-01-01");
const NOW = new Date("2026-06-02");

test("outstanding: a pending invite that hasn't expired counts", () => {
  assert.equal(isOutstandingInvite({ usedAt: null, revokedAt: null, expiresAt: FUTURE }, NOW), true);
});

test("outstanding: an expired invite does not count", () => {
  assert.equal(isOutstandingInvite({ usedAt: null, revokedAt: null, expiresAt: PAST }, NOW), false);
});

test("outstanding: an accepted invite does not count", () => {
  assert.equal(isOutstandingInvite({ usedAt: NOW, revokedAt: null, expiresAt: FUTURE }, NOW), false);
});

test("outstanding: a revoked invite does not count", () => {
  assert.equal(isOutstandingInvite({ usedAt: null, revokedAt: NOW, expiresAt: FUTURE }, NOW), false);
});

test("outstanding: ISO-string expiry is parsed the same as a Date", () => {
  assert.equal(isOutstandingInvite({ usedAt: null, revokedAt: null, expiresAt: FUTURE.toISOString() }, NOW), true);
  assert.equal(isOutstandingInvite({ usedAt: null, revokedAt: null, expiresAt: PAST.toISOString() }, NOW), false);
});

test("cap: below the limit is allowed, at/above the limit is blocked", () => {
  const cap = ARTIST_INVITE_OUTSTANDING_LIMIT;
  assert.equal(isOverOutstandingCap(cap - 1, cap), false);
  assert.equal(isOverOutstandingCap(cap, cap), true);
  assert.equal(isOverOutstandingCap(cap + 1, cap), true);
});

test("cap: the shared limit is the agreed 5-per-scope allowance", () => {
  // Locks the documented per-partner allowance — a silent bump shows here.
  assert.equal(ARTIST_INVITE_OUTSTANDING_LIMIT, 5);
});
