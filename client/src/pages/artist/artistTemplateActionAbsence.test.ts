import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("artist test exposes no press-template download actions", () => {
  const source = readFileSync(
    new URL("./ArtistTemplateTest.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, />\s*Design template\s*</);
  assert.doesNotMatch(source, />\s*Template with guides\s*</);
  assert.doesNotMatch(source, /file-menu-download-guides|button-download-template/);
});

test("press test keeps both template downloads inside its overflow menu", () => {
  const source = readFileSync(
    new URL("../press-templates/PressTemplateLiveTest.tsx", import.meta.url),
    "utf8",
  );
  const menuStart = source.indexOf('data-testid="menu-template-overflow"');
  const dialogStart = source.indexOf("{showTests &&", menuStart);
  assert.ok(menuStart >= 0 && dialogStart > menuStart);
  const overflowSource = source.slice(menuStart, dialogStart);
  assert.match(overflowSource, /Download design template/);
  assert.match(overflowSource, /Download template with guides/);
  assert.doesNotMatch(source.slice(0, menuStart), /Download design template|Download template with guides/);
  assert.match(source, /\/api\/press\/\$\{pressId\}\/templates\/\$\{currentSpecId\}\/file\$\{clean\}/);
});