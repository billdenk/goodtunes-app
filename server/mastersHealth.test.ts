// Task #3197 — unit tests for the pure press-masters classification in
// server/mastersHealth.ts (no DB, no storage: probes are stubbed).
//
//   npx tsx --test server/mastersHealth.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyPointer,
  masterCandidates,
  preferredMasterUrl,
  classifySongMaster,
} from "./mastersHealth";

test("classifyPointer: empty / external / object", () => {
  assert.equal(classifyPointer(null), "empty");
  assert.equal(classifyPointer(undefined), "empty");
  assert.equal(classifyPointer(""), "empty");
  assert.equal(classifyPointer("   "), "empty");
  assert.equal(classifyPointer("https://dl.dropboxusercontent.com/x.wav"), "external");
  assert.equal(classifyPointer("http://203.0.113.10/master.wav"), "external");
  assert.equal(classifyPointer("/objects/uploads/abc.wav"), "object");
});

test("masterCandidates: original first, served second, empties skipped", () => {
  const c = masterCandidates({ audioUrl: "/objects/a.flac", audioSourceUrl: "/objects/b.wav" });
  assert.deepEqual(c.map((x) => [x.url, x.source, x.cls]), [
    ["/objects/b.wav", "original", "object"],
    ["/objects/a.flac", "served", "object"],
  ]);
  assert.deepEqual(masterCandidates({ audioUrl: "", audioSourceUrl: null }), []);
});

test("preferredMasterUrl mirrors the route's source preference", () => {
  assert.equal(
    preferredMasterUrl({ audioUrl: "/objects/a.flac", audioSourceUrl: "/objects/b.wav" }),
    "/objects/b.wav",
  );
  assert.equal(preferredMasterUrl({ audioUrl: "/objects/a.flac" }), "/objects/a.flac");
  // External original doesn't beat a live served object.
  assert.equal(
    preferredMasterUrl({ audioUrl: "/objects/a.flac", audioSourceUrl: "https://x/y.wav" }),
    "/objects/a.flac",
  );
  assert.equal(preferredMasterUrl({ audioUrl: "https://x/y.wav" }), null);
});

test("classifySongMaster: happy paths", async () => {
  const yes = async () => true;
  assert.deepEqual(
    await classifySongMaster({ audioUrl: "/objects/a.flac", audioSourceUrl: "/objects/b.wav" }, yes),
    { status: "ok_original", url: "/objects/b.wav" },
  );
  assert.deepEqual(
    await classifySongMaster({ audioUrl: "/objects/a.flac" }, yes),
    { status: "ok_served", url: "/objects/a.flac" },
  );
});

test("classifySongMaster: original missing from storage falls back to served", async () => {
  const probe = async (p: string) => p === "/objects/a.flac";
  assert.deepEqual(
    await classifySongMaster({ audioUrl: "/objects/a.flac", audioSourceUrl: "/objects/b.wav" }, probe),
    { status: "ok_served", url: "/objects/a.flac" },
  );
});

test("classifySongMaster: failure classes", async () => {
  const no = async () => false;
  assert.deepEqual(await classifySongMaster({}, no), { status: "no_master", url: null });
  assert.deepEqual(
    await classifySongMaster({ audioUrl: "https://dropbox/x.wav" }, no),
    { status: "external", url: "https://dropbox/x.wav" },
  );
  assert.deepEqual(
    await classifySongMaster({ audioUrl: "/objects/gone.flac" }, no),
    { status: "missing_object", url: "/objects/gone.flac" },
  );
  // Object pointer whose object is gone + an external sibling: still
  // missing_object (the actionable repair is the storage object).
  assert.deepEqual(
    await classifySongMaster({ audioUrl: "/objects/gone.flac", audioSourceUrl: "https://x/y.wav" }, no),
    { status: "missing_object", url: "/objects/gone.flac" },
  );
});
