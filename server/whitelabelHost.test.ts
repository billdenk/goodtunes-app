// Task #3258 — makesvinyl.com / pressesvinyl.com white-label host family.
// Pure unit tests: slug parsing/validation, host→kind resolution, canonical
// redirect exemption, and OAuth callback-origin preservation.
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  parseWhitelabelHost,
  isWhitelabelHost,
  isValidWhitelabelSlug,
  whitelabelOriginForSlug,
  whitelabelHostForSlug,
  WHITELABEL_APEX_DOMAINS,
} from "@shared/whitelabelHost";
import { kindFromRequest, canonicalHostRedirect, callbackOrigin } from "./auth/host";

function fakeReq(host: string, path = "/", extras: Record<string, any> = {}): any {
  return { headers: { host }, path, query: {}, originalUrl: path, ...extras };
}

describe("parseWhitelabelHost", () => {
  test("recognizes press subdomains on both apexes", () => {
    assert.deepEqual(parseWhitelabelHost("mrp.makesvinyl.com"), { apex: "makesvinyl.com", slug: "mrp" });
    assert.deepEqual(parseWhitelabelHost("hellbender.pressesvinyl.com"), { apex: "pressesvinyl.com", slug: "hellbender" });
  });

  test("bare apexes and www are family but slug-less (neutral page)", () => {
    assert.deepEqual(parseWhitelabelHost("makesvinyl.com"), { apex: "makesvinyl.com", slug: null });
    assert.deepEqual(parseWhitelabelHost("pressesvinyl.com"), { apex: "pressesvinyl.com", slug: null });
    assert.equal(parseWhitelabelHost("www.makesvinyl.com")!.slug, null);
  });

  test("reserved and structurally invalid labels are slug-less", () => {
    assert.equal(parseWhitelabelHost("admin.makesvinyl.com")!.slug, null);
    assert.equal(parseWhitelabelHost("api.pressesvinyl.com")!.slug, null);
    assert.equal(parseWhitelabelHost("deep.sub.makesvinyl.com")!.slug, null);
    assert.equal(parseWhitelabelHost("-bad.makesvinyl.com")!.slug, null);
  });

  test("ignores case and ports; rejects non-family hosts", () => {
    assert.deepEqual(parseWhitelabelHost("MRP.MakesVinyl.com:443"), { apex: "makesvinyl.com", slug: "mrp" });
    assert.equal(parseWhitelabelHost("my.goodtunes.music"), null);
    assert.equal(parseWhitelabelHost("evilmakesvinyl.com"), null);
    assert.equal(parseWhitelabelHost("makesvinyl.com.evil.com"), null);
    assert.equal(parseWhitelabelHost(""), null);
    assert.equal(parseWhitelabelHost(undefined), null);
  });
});

describe("isValidWhitelabelSlug", () => {
  test("accepts sane labels, rejects reserved/short/malformed", () => {
    assert.ok(isValidWhitelabelSlug("mrp"));
    assert.ok(isValidWhitelabelSlug("hellbender"));
    assert.ok(isValidWhitelabelSlug("press-45"));
    assert.ok(!isValidWhitelabelSlug("www"));
    assert.ok(!isValidWhitelabelSlug("admin"));
    assert.ok(!isValidWhitelabelSlug("a")); // 1-char reads like a typo
    assert.ok(!isValidWhitelabelSlug("-mrp"));
    assert.ok(!isValidWhitelabelSlug("mrp-"));
    assert.ok(!isValidWhitelabelSlug("has.dot"));
    assert.ok(!isValidWhitelabelSlug("x".repeat(41)));
  });
});

describe("origin builders", () => {
  test("mint on the primary apex only", () => {
    assert.equal(whitelabelOriginForSlug("mrp"), "https://mrp.makesvinyl.com");
    assert.equal(whitelabelHostForSlug("MRP"), "mrp.makesvinyl.com");
    assert.equal(WHITELABEL_APEX_DOMAINS[0], "makesvinyl.com");
  });
});

describe("kindFromRequest", () => {
  test("white-label hosts are flexible (path-based kind, hostKnown=false) so admin-kind partner invites work there", () => {
    for (const host of ["mrp.makesvinyl.com", "hellbender.pressesvinyl.com", "makesvinyl.com", "unknown.makesvinyl.com"]) {
      assert.deepEqual(kindFromRequest(fakeReq(host, "/")), { kind: "customer", hostKnown: false }, host);
      assert.deepEqual(kindFromRequest(fakeReq(host, "/e/tok")), { kind: "customer", hostKnown: false }, host);
      // Partner portal + invite-accept surfaces resolve admin like dev previews
      assert.deepEqual(kindFromRequest(fakeReq(host, "/admin")), { kind: "admin", hostKnown: false }, host);
      assert.deepEqual(kindFromRequest(fakeReq(host, "/api/admin/x")), { kind: "admin", hostKnown: false }, host);
    }
  });

  test("OAuth start carrying an invite token resolves admin so the callback grant branch runs", () => {
    const req = fakeReq("mrp.makesvinyl.com", "/api/auth/google/start");
    req.query = { invite: "sometoken" };
    assert.deepEqual(kindFromRequest(req), { kind: "admin", hostKnown: false });
    // Same fix applies to dev/preview hosts
    const dev = fakeReq("x.replit.dev", "/api/auth/apple/start");
    dev.query = { invite: "tok" };
    assert.equal(kindFromRequest(dev).kind, "admin");
    // No invite param → still customer
    assert.equal(kindFromRequest(fakeReq("mrp.makesvinyl.com", "/api/auth/google/start")).kind, "customer");
  });

  test("goodtunes hosts are unchanged", () => {
    assert.deepEqual(kindFromRequest(fakeReq("admin.goodtunes.music")), { kind: "admin", hostKnown: true });
    assert.deepEqual(kindFromRequest(fakeReq("my.goodtunes.music")), { kind: "customer", hostKnown: true });
    // dev preview host still falls back to path
    assert.equal(kindFromRequest(fakeReq("x.replit.dev", "/admin")).hostKnown, false);
  });
});

describe("prod host behavior", () => {
  const prevEnv = process.env.NODE_ENV;
  beforeEach(() => { process.env.NODE_ENV = "production"; });
  afterEach(() => { process.env.NODE_ENV = prevEnv; });

  test("canonicalHostRedirect passes white-label hosts through", () => {
    for (const host of ["mrp.makesvinyl.com", "makesvinyl.com", "pressesvinyl.com", "whoever.pressesvinyl.com"]) {
      let nexted = false;
      let redirected: string | null = null;
      const res: any = { redirect: (_c: number, url: string) => { redirected = url; } };
      canonicalHostRedirect(fakeReq(host, "/e/tok123"), res, () => { nexted = true; });
      assert.ok(nexted, `${host} should pass through`);
      assert.equal(redirected, null, `${host} should not redirect`);
    }
  });

  test("goodtunes apex still canonicalizes (control)", () => {
    let redirected: string | null = null;
    const res: any = { redirect: (_c: number, url: string) => { redirected = url; } };
    canonicalHostRedirect(fakeReq("goodtunes.music", "/home"), res, () => {});
    assert.equal(redirected, "https://my.goodtunes.music/home");
  });

  test("callbackOrigin preserves the exact white-label host for customer OAuth", () => {
    assert.equal(callbackOrigin(fakeReq("mrp.makesvinyl.com"), "customer"), "https://mrp.makesvinyl.com");
    assert.equal(callbackOrigin(fakeReq("hb.pressesvinyl.com"), "customer"), "https://hb.pressesvinyl.com");
    // Existing customer hosts keep their behavior
    assert.equal(callbackOrigin(fakeReq("store.goodtunes.music"), "customer"), "https://store.goodtunes.music");
    // Unknown customer host still canonicalizes
    assert.equal(callbackOrigin(fakeReq("random.example.com"), "customer"), "https://my.goodtunes.music");
    // Admin kind never lands on a white-label host
    assert.equal(callbackOrigin(fakeReq("mrp.makesvinyl.com"), "admin"), "https://admin.goodtunes.music");
  });
});
