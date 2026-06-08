// Task #1796 — unit coverage for the host/kind auth boundary decision.
//
// Background: an invited platform admin whose login is also a fan account
// (e.g. Andrew) was getting 401 when saving in the admin Edit Profile dialog.
// `getAuthFromRequest` checks the session before the Bearer token, and a linked
// admin's session can carry kind:"customer" (they last signed in on the fan
// host). On the admin host the host/kind gate then rejected them even though
// they presented a valid admin Bearer token.
//
// The fix lives in the pure `resolveAuthAcrossBoundary` helper: when the
// session's kind mismatches the host, it honors a Bearer token whose kind
// matches THIS host before bouncing. These tests pin that behavior without the
// fragility of an HTTP/session/cookie round-trip (undici strips the `Host`
// header, and the secure session cookie needs a trusted-proxy handshake), so
// they run identically in isolation and inside the full `test` suite.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveAuthAcrossBoundary } from "./routes";

const ADMIN = { userId: "admin-1", kind: "admin" as const };
const FAN = { userId: "fan-1", kind: "customer" as const };

test("THE FIX: linked admin with a stale customer session + admin token edits on the admin host", () => {
  // Admin host (hostKnown, authKind=admin). Session resolves to the fan hat
  // (stale), but a valid admin Bearer token is in hand.
  const got = resolveAuthAcrossBoundary({
    sessionAuth: FAN,
    bearerAuth: ADMIN,
    hostKnown: true,
    authKind: "admin",
  });
  assert.deepEqual(got, ADMIN, "admin token must win over the stale fan session on the admin host");
});

test("BOUNDARY: a fan-only session with NO admin token is still rejected on the admin host", () => {
  const got = resolveAuthAcrossBoundary({
    sessionAuth: FAN,
    bearerAuth: undefined,
    hostKnown: true,
    authKind: "admin",
  });
  assert.equal(got, undefined, "no matching token → fan session cannot act as admin");
});

test("BOUNDARY: a fan-only session presenting a FAN token is still rejected on the admin host", () => {
  // Holding a fan token proves the fan hat, not the admin hat.
  const got = resolveAuthAcrossBoundary({
    sessionAuth: FAN,
    bearerAuth: FAN,
    hostKnown: true,
    authKind: "admin",
  });
  assert.equal(got, undefined, "a fan token cannot satisfy the admin host");
});

test("BOUNDARY: an admin token is rejected on the fan host", () => {
  // Mirror image: admin session/token on the customer host.
  const got = resolveAuthAcrossBoundary({
    sessionAuth: ADMIN,
    bearerAuth: ADMIN,
    hostKnown: true,
    authKind: "customer",
  });
  assert.equal(got, undefined, "admin token must not act as a fan on the fan host");
});

test("happy path: session kind matches the host → session is used, token irrelevant", () => {
  const got = resolveAuthAcrossBoundary({
    sessionAuth: ADMIN,
    bearerAuth: undefined,
    hostKnown: true,
    authKind: "admin",
  });
  assert.deepEqual(got, ADMIN);
});

test("happy path: fan session on the fan host is used", () => {
  const got = resolveAuthAcrossBoundary({
    sessionAuth: FAN,
    bearerAuth: undefined,
    hostKnown: true,
    authKind: "customer",
  });
  assert.deepEqual(got, FAN);
});

test("token-only (no session): matching admin token authenticates on the admin host", () => {
  const got = resolveAuthAcrossBoundary({
    sessionAuth: undefined,
    bearerAuth: ADMIN,
    hostKnown: true,
    authKind: "admin",
  });
  assert.deepEqual(got, ADMIN);
});

test("token-only (no session): admin token is rejected on the fan host", () => {
  const got = resolveAuthAcrossBoundary({
    sessionAuth: undefined,
    bearerAuth: ADMIN,
    hostKnown: true,
    authKind: "customer",
  });
  assert.equal(got, undefined);
});

test("no credentials at all → undefined", () => {
  const got = resolveAuthAcrossBoundary({
    sessionAuth: undefined,
    bearerAuth: undefined,
    hostKnown: true,
    authKind: "admin",
  });
  assert.equal(got, undefined);
});

test("dev (hostKnown=false): a customer session is trusted on an /admin path (no host split)", () => {
  // No canonical host split in dev → the session kind is trusted and
  // requireAdmin / requireCustomer still gate role-specific routes downstream.
  const got = resolveAuthAcrossBoundary({
    sessionAuth: FAN,
    bearerAuth: undefined,
    hostKnown: false,
    authKind: "admin",
  });
  assert.deepEqual(got, FAN, "dev trusts the session kind when there is no host split");
});

test("dev (hostKnown=false): an admin session is trusted on a customer-path request", () => {
  const got = resolveAuthAcrossBoundary({
    sessionAuth: ADMIN,
    bearerAuth: undefined,
    hostKnown: false,
    authKind: "customer",
  });
  assert.deepEqual(got, ADMIN);
});
