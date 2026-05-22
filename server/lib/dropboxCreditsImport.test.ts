// Smoke test for the per-track Dropbox credits-import helpers.
//
// Uses Node's built-in test runner so it can run with:
//   npx tsx --test server/lib/dropboxCreditsImport.test.ts
// without adding a third-party test framework to package.json.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isDropboxHost,
  isDropboxFolderUrl,
  normalizeDropboxDownloadUrl,
  pickBestFilenameMatch,
} from "./dropboxCreditsImport";

test("normalizeDropboxDownloadUrl forces dl=1", () => {
  const u = normalizeDropboxDownloadUrl(
    "https://www.dropbox.com/scl/fi/abc/credits.pdf?rlkey=xyz&dl=0",
  );
  assert.equal(u.searchParams.get("dl"), "1");
  assert.equal(u.searchParams.get("rlkey"), "xyz");
});

test("normalizeDropboxDownloadUrl rejects non-dropbox hosts", () => {
  assert.throws(
    () => normalizeDropboxDownloadUrl("https://evil.example.com/file.pdf?dl=1"),
    /Dropbox/,
  );
});

test("normalizeDropboxDownloadUrl rejects non-https", () => {
  assert.throws(
    () => normalizeDropboxDownloadUrl("http://www.dropbox.com/scl/fi/abc/x.pdf"),
    /https/,
  );
});

test("normalizeDropboxDownloadUrl rejects junk strings", () => {
  assert.throws(() => normalizeDropboxDownloadUrl("not a url"));
});

test("isDropboxHost accepts the bucket subdomain Dropbox 302s to", () => {
  assert.equal(
    isDropboxHost(new URL("https://ucb01a3.dl.dropboxusercontent.com/path")),
    true,
  );
  assert.equal(
    isDropboxHost(new URL("https://dl.dropboxusercontent.com/path")),
    true,
  );
  assert.equal(
    isDropboxHost(new URL("https://dropboxusercontent.evil.com/path")),
    false,
  );
});

test("isDropboxFolderUrl distinguishes folder shares from file shares", () => {
  assert.equal(
    isDropboxFolderUrl("https://www.dropbox.com/scl/fo/abc/AAA?rlkey=x&dl=0"),
    true,
  );
  assert.equal(
    isDropboxFolderUrl("https://www.dropbox.com/sh/abc/AAA"),
    true,
  );
  assert.equal(
    isDropboxFolderUrl("https://www.dropbox.com/scl/fi/abc/credits.pdf?dl=1"),
    false,
  );
  assert.equal(
    isDropboxFolderUrl("https://evil.example.com/scl/fo/abc/AAA"),
    false,
  );
});

test("pickBestFilenameMatch — exact wins over substring siblings", () => {
  // "Love" exact-matches "Love.pdf" but ALSO substring-matches
  // "Love Story.pdf"; the exact tier must short-circuit so the operator
  // gets the right file, not an ambiguity error.
  const r = pickBestFilenameMatch("Love", [
    { filename: "Love.pdf" },
    { filename: "Love Story.pdf" },
  ]);
  assert.equal(r.kind, "exact");
  if (r.kind === "exact") assert.equal(r.hit.filename, "Love.pdf");
});

test("pickBestFilenameMatch — substring match when nothing exact", () => {
  const r = pickBestFilenameMatch("Paper Sky", [
    { filename: "Paper Sky credits.pdf" },
    { filename: "Other Song.pdf" },
  ]);
  assert.equal(r.kind, "substring");
  if (r.kind === "substring") {
    assert.equal(r.hit.filename, "Paper Sky credits.pdf");
  }
});

test("pickBestFilenameMatch — diacritics + punctuation ignored", () => {
  const r = pickBestFilenameMatch("Crème brûlée!", [
    { filename: "creme-brulee.docx" },
  ]);
  assert.equal(r.kind, "exact");
});

test("pickBestFilenameMatch — refuses on multi-substring ambiguity", () => {
  const r = pickBestFilenameMatch("Story", [
    { filename: "Love Story.pdf" },
    { filename: "Story Time.pdf" },
  ]);
  assert.equal(r.kind, "ambiguous");
});

test("pickBestFilenameMatch — none on empty inputs", () => {
  assert.equal(pickBestFilenameMatch("X", []).kind, "none");
  assert.equal(pickBestFilenameMatch("", [{ filename: "x.pdf" }]).kind, "none");
});

test("pickBestFilenameMatch — strips nested path prefixes", () => {
  // streamDropboxEntries returns filenames that may include a folder
  // prefix from the zip; match on the basename only.
  const r = pickBestFilenameMatch("Paper Sky", [
    { filename: "Credits/Paper Sky.pdf" },
  ]);
  assert.equal(r.kind, "exact");
});
