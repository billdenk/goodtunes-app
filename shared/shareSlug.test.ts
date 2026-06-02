import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  normalizeShareSlug,
  validateShareSlug,
  RESERVED_SLUGS,
} from "./shareSlug";

const here = dirname(fileURLToPath(import.meta.url));

test("normalizeShareSlug lowercases, strips, and collapses", () => {
  assert.equal(normalizeShareSlug("  Nightbirde  "), "nightbirde");
  assert.equal(normalizeShareSlug("Hello World"), "hello-world");
  assert.equal(normalizeShareSlug("a__b  c"), "a-b-c");
  assert.equal(normalizeShareSlug("--Foo--Bar--"), "foo-bar");
  assert.equal(normalizeShareSlug("Café Olé"), "cafe-ole");
  assert.equal(normalizeShareSlug("Hope!!! (2024)"), "hope-2024");
  assert.equal(normalizeShareSlug(""), "");
});

test("validateShareSlug accepts a clean slug and returns normalized form", () => {
  const r = validateShareSlug("  Hope 2024  ");
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.slug, "hope-2024");
});

test("validateShareSlug rejects empty, too-short, numeric-only, too-long", () => {
  assert.equal(validateShareSlug("").ok, false);
  assert.equal(validateShareSlug("a").ok, false); // < MIN after normalize
  assert.equal(validateShareSlug("12345").ok, false); // no letter
  assert.equal(validateShareSlug("x".repeat(65)).ok, false); // > MAX
});

test("validateShareSlug rejects reserved words (matrix)", () => {
  for (const reserved of [
    "chat",
    "recents",
    "error",
    "store",
    "artist",
    "collection",
    "login",
    "admin",
    "welcome-invitee",
  ]) {
    const r = validateShareSlug(reserved);
    assert.equal(r.ok, false, `expected "${reserved}" to be reserved/rejected`);
  }
});

// Drift guard: every literal single-segment <Route path="/x"> in App.tsx must
// be in RESERVED_SLUGS, or runtime route precedence would let an operator save
// a slug (e.g. "chat") that resolves to the literal route, not the album —
// producing a broken share link. If this fails, add the missing path(s) to
// RESERVED_SLUGS in shared/shareSlug.ts.
test("every single-segment App.tsx route is a reserved slug", () => {
  const appTsx = readFileSync(
    join(here, "..", "client", "src", "App.tsx"),
    "utf8",
  );
  const routePaths = new Set<string>();
  const re = /path="\/([^/":]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(appTsx)) !== null) {
    const seg = m[1];
    // skip param routes like ":slug" (filtered by the char class above anyway)
    if (seg.startsWith(":")) continue;
    routePaths.add(seg.toLowerCase());
  }
  const missing = [...routePaths].filter((p) => !RESERVED_SLUGS.has(p));
  assert.deepEqual(
    missing,
    [],
    `App.tsx single-segment routes missing from RESERVED_SLUGS: ${missing.join(", ")}`,
  );
});
