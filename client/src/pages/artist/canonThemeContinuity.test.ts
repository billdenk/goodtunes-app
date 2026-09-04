import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("package glass and artist test stay on scoped Canon tokens", () => {
  const artist = readFileSync(
    new URL("./ArtistTemplateTest.tsx", import.meta.url),
    "utf8",
  );
  const glass = readFileSync(
    new URL("../../components/admin/OperatorPackageGlass.tsx", import.meta.url),
    "utf8",
  );

  assert.match(artist, /gt-canon-artist-test/);
  assert.match(artist, /canvas: 'var\(--apple-canvas\)'/);
  assert.match(artist, /card: 'var\(--apple-card\)'/);
  assert.match(glass, /gt-canon-package-surface/);
  assert.match(glass, /bg-\[var\(--apple-card\)\]/);
});