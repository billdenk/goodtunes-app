import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("./AdminAlbum.tsx", import.meta.url),
  "utf8",
);

test("album workspace keeps the canonical primary production tabs visible", () => {
  for (const pair of [
    '{ key: "sell", label: "Package" }',
    '{ key: "tracks", label: "Digital" }',
    '{ key: "press", label: "Physical" }',
  ]) {
    assert.match(source, new RegExp(pair.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("Package and Physical continue mounting the real production bodies", () => {
  assert.match(source, /<OperatorPackageGlass/);
  assert.match(source, /<PressAlbumPackageBuilder/);
  assert.match(source, /<PressPanel/);
  assert.match(
    source,
    /roleResolved=\{!!adminRoleInfo\}/,
    "press-only nested links wait for the authoritative role query",
  );
});

test("album workspace ships an explicit, keyboard-accessible overflow control", () => {
  const tabs = readFileSync(
    new URL("../components/admin/AlbumWorkspaceTabs.tsx", import.meta.url),
    "utf8",
  );
  assert.match(tabs, /aria-label="Show previous album tabs"/);
  assert.match(tabs, /aria-label="Show next album tabs"/);
  assert.match(tabs, /ArrowLeft/);
  assert.match(tabs, /ArrowRight/);
  assert.match(tabs, /overflow-x-auto/);
});