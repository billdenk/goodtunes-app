// Task #3339 — press bring-your-own custom domain: pure validation tests.
//
//   npx tsx --test server/whitelabelCustomDomain.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateCustomWhitelabelDomain,
  isCustomWhitelabelCandidateHost,
  CUSTOM_DOMAIN_CNAME_TARGET,
} from "@shared/whitelabelHost";

test("accepts a subdomain of the press's own domain", () => {
  const v = validateCustomWhitelabelDomain("vinyl.memphisrecordpressing.com");
  assert.deepEqual(v, { ok: true, host: "vinyl.memphisrecordpressing.com" });
});

test("normalizes case, whitespace, pasted URLs, and ports", () => {
  const v = validateCustomWhitelabelDomain("  HTTPS://Vinyl.MyPress.COM:443/path?x=1 ");
  assert.deepEqual(v, { ok: true, host: "vinyl.mypress.com" });
});

test("rejects a bare apex — we never take over their main domain", () => {
  assert.equal(validateCustomWhitelabelDomain("memphisrecordpressing.com").ok, false);
});

test("rejects www — that's their main site", () => {
  assert.equal(validateCustomWhitelabelDomain("www.mypress.com").ok, false);
});

test("rejects platform-owned families", () => {
  for (const h of [
    "vinyl.makesvinyl.com",
    "x.pressesvinyl.com",
    "evil.goodtunes.music",
    "a.goodtunes.app",
    "foo.replit.app",
    "foo.bar.replit.dev",
  ]) {
    assert.equal(validateCustomWhitelabelDomain(h).ok, false, `${h} must be refused`);
  }
});

test("rejects garbage, IPs, and numeric TLDs", () => {
  for (const h of ["", "not a host", "1.2.3.4", "a.b.123", "foo", "-x.a.com", "x-.a.com"]) {
    assert.equal(validateCustomWhitelabelDomain(h).ok, false, `${h} must be refused`);
  }
});

test("candidate host detection: custom hosts yes, every known family no", () => {
  assert.equal(isCustomWhitelabelCandidateHost("vinyl.memphisrecordpressing.com"), true);
  assert.equal(isCustomWhitelabelCandidateHost("vinyl.mypress.com:443"), true);
  for (const h of [
    "mrp.makesvinyl.com", "makesvinyl.com", "pressesvinyl.com",
    "my.goodtunes.music", "admin.goodtunes.music", "goodtunes.music",
    "something.replit.app", "abc-123.picard.replit.dev", "x.repl.co",
    "localhost", "app.localhost", "127.0.0.1", "10.0.0.5:5000", "printer.local",
    "", "nohost",
  ]) {
    assert.equal(isCustomWhitelabelCandidateHost(h), false, `${h} must NOT be a candidate`);
  }
});

test("CNAME target is the primary white-label apex", () => {
  assert.equal(CUSTOM_DOMAIN_CNAME_TARGET, "makesvinyl.com");
});
