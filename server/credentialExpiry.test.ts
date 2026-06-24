// Task #2089 — unit coverage for the credential-expiry registry's pure logic.
//
// The decision policy (when do we page on-call vs just log vs stay silent) and
// the probe helpers (operator-recorded dates, the GitHub-result mapping) are
// extracted as pure functions so they can be tested without sending mail or
// hitting the network. Importing ./credentialExpiry is side-effect-free (it only
// arms a scheduler when armCredentialExpiryScheduler() is called, which we don't).
//
//   npx tsx --test server/credentialExpiry.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyProbe,
  parseRecordedExpiry,
  operatorRecordedProbe,
  certNotAfterProbe,
  type CredentialSource,
} from "./credentialExpiry";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-06-24T00:00:00Z");

const source: CredentialSource = {
  id: "test-cred",
  label: "Test credential",
  impact: "things break.",
  rotationRunbook: "rotate it.",
  probe: () => ({ kind: "not-configured" }),
};

function inDays(n: number): Date {
  return new Date(NOW + n * DAY_MS);
}

// ── classifyProbe: the page/log/silent policy ────────────────────────────

test("classifyProbe: not-configured stays silent", () => {
  assert.equal(classifyProbe(source, { kind: "not-configured" }, NOW).action, "silent");
});

test("classifyProbe: unmonitored logs but never alerts", () => {
  const d = classifyProbe(source, { kind: "unmonitored", note: "set FOO_EXPIRES_AT" }, NOW);
  assert.equal(d.action, "log");
  assert.match((d as any).line, /configured but expiry not tracked/);
  assert.match((d as any).line, /FOO_EXPIRES_AT/);
});

test("classifyProbe: transient hiccup logs but never alerts", () => {
  const d = classifyProbe(source, { kind: "transient", reason: "network blip" }, NOW);
  assert.equal(d.action, "log");
  assert.match((d as any).line, /check skipped/);
});

test("classifyProbe: rejected pages immediately", () => {
  const d = classifyProbe(source, { kind: "rejected", reason: "HTTP 401" }, NOW);
  assert.equal(d.action, "alert");
  assert.equal((d as any).signature, "cred-rejected test-cred");
  assert.match((d as any).subject, /REJECTED/);
  assert.match((d as any).detail, /things break/);
  assert.match((d as any).detail, /rotate it/);
});

test("classifyProbe: healthy (far future) only logs, no alert", () => {
  const d = classifyProbe(source, { kind: "expires", expiresAt: inDays(60) }, NOW);
  assert.equal(d.action, "log");
  assert.match((d as any).line, /healthy/);
  assert.match((d as any).line, /60d left/);
});

test("classifyProbe: just outside the 14d window stays silent of alerts", () => {
  const d = classifyProbe(source, { kind: "expires", expiresAt: inDays(15) }, NOW);
  assert.equal(d.action, "log");
});

test("classifyProbe: inside the warn window pages with a date-keyed signature", () => {
  const d = classifyProbe(source, { kind: "expires", expiresAt: inDays(10) }, NOW);
  assert.equal(d.action, "alert");
  assert.match((d as any).subject, /expires in 10 day\(s\)/);
  // Signature folds id + ISO date so daily re-checks collapse to one email.
  assert.match((d as any).signature, /^cred-expiry test-cred \d{4}-\d{2}-\d{2}$/);
});

test("classifyProbe: already-expired pages with EXPIRED wording", () => {
  const d = classifyProbe(source, { kind: "expires", expiresAt: inDays(-3) }, NOW);
  assert.equal(d.action, "alert");
  assert.match((d as any).subject, /EXPIRED on /);
});

test("classifyProbe: per-source warnWindowDays override widens the window", () => {
  const wide: CredentialSource = { ...source, warnWindowDays: 30 };
  // 20d out: silent at the default 14d window, but alerts at the 30d override.
  assert.equal(classifyProbe(source, { kind: "expires", expiresAt: inDays(20) }, NOW).action, "log");
  assert.equal(classifyProbe(wide, { kind: "expires", expiresAt: inDays(20) }, NOW).action, "alert");
});

// ── parseRecordedExpiry ──────────────────────────────────────────────────

test("parseRecordedExpiry: accepts a bare ISO day", () => {
  const d = parseRecordedExpiry("2026-09-22");
  assert.ok(d instanceof Date);
  assert.equal(d!.toISOString().slice(0, 10), "2026-09-22");
});

test("parseRecordedExpiry: accepts the GitHub-style 'UTC' form", () => {
  const d = parseRecordedExpiry("2026-09-22 17:00:00 UTC");
  assert.ok(d instanceof Date);
  assert.equal(d!.toISOString().slice(0, 10), "2026-09-22");
});

test("parseRecordedExpiry: empty / garbage returns null", () => {
  assert.equal(parseRecordedExpiry(""), null);
  assert.equal(parseRecordedExpiry("   "), null);
  assert.equal(parseRecordedExpiry(undefined), null);
  assert.equal(parseRecordedExpiry("not-a-date"), null);
});

// ── operatorRecordedProbe ────────────────────────────────────────────────

test("operatorRecordedProbe: unconfigured credential is a no-op", () => {
  const probe = operatorRecordedProbe({ configured: false, dateEnvVar: "X_EXPIRES_AT" });
  assert.equal(probe().kind, "not-configured");
});

test("operatorRecordedProbe: configured but no date recorded → unmonitored", () => {
  delete process.env.X_EXPIRES_AT;
  const probe = operatorRecordedProbe({ configured: true, dateEnvVar: "X_EXPIRES_AT" });
  const r = probe();
  assert.equal(r.kind, "unmonitored");
  assert.match((r as any).note, /X_EXPIRES_AT/);
});

test("operatorRecordedProbe: configured + recorded date → expires", () => {
  process.env.X_EXPIRES_AT = "2026-09-22";
  try {
    const probe = operatorRecordedProbe({ configured: true, dateEnvVar: "X_EXPIRES_AT" });
    const r = probe();
    assert.equal(r.kind, "expires");
    assert.equal((r as any).expiresAt.toISOString().slice(0, 10), "2026-09-22");
  } finally {
    delete process.env.X_EXPIRES_AT;
  }
});

// ── certNotAfterProbe ────────────────────────────────────────────────────

test("certNotAfterProbe: no cert env → not-configured", () => {
  delete process.env.SOME_CERT_PEM;
  assert.equal(certNotAfterProbe("SOME_CERT_PEM")().kind, "not-configured");
});

test("certNotAfterProbe: garbage PEM → transient (never throws)", () => {
  process.env.SOME_CERT_PEM = "-----BEGIN CERTIFICATE-----\nnope\n-----END CERTIFICATE-----";
  try {
    assert.equal(certNotAfterProbe("SOME_CERT_PEM")().kind, "transient");
  } finally {
    delete process.env.SOME_CERT_PEM;
  }
});
