import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const personSource = readFileSync(
  new URL("./AdminPerson.tsx", import.meta.url),
  "utf8",
);
const cssSource = readFileSync(
  new URL("../index.css", import.meta.url),
  "utf8",
);

test("both Permissions scope notices share the dark-canon surface hook", () => {
  for (const testId of [
    "note-permissions-artist-scope",
    "note-permissions-partner-staff-scope",
  ]) {
    const noticeStart = personSource.lastIndexOf("<div", personSource.indexOf(testId));
    const notice = personSource.slice(noticeStart, personSource.indexOf(">", personSource.indexOf(testId)) + 1);
    assert.match(notice, /gt-permissions-scope-note/);
    assert.match(notice, /bg-slate-50\/70/);
  }
});

test("Permissions scope notices use the admin-only Apple-canon inset in dark mode", () => {
  assert.match(
    cssSource,
    /body\.gt-admin\.gt-admin-dark \.gt-permissions-scope-note\s*\{[^}]*background-color:\s*var\(--apple-track\);[^}]*color:\s*var\(--apple-ink\);[^}]*\}/s,
  );
  assert.doesNotMatch(
    cssSource,
    /(?:^|,)\s*\.gt-permissions-scope-note\s*\{/m,
    "the override must not escape admin dark mode",
  );
});