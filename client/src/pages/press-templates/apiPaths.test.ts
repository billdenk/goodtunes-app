// Task #3098 — client↔server contract test for the press-templates API
// paths. The Test-page (and detail-page) mutations build URLs via
// apiPaths.ts; this test extracts every route literally registered in
// server/pressTemplatesPortal.ts and asserts each helper output matches one
// of them, so a drifted client path fails here instead of 404ing live
// (the original certify bug this guards against).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { templateTestPath, certifyRunPath } from "./apiPaths";

const serverSrc = readFileSync(
  join(process.cwd(), "server", "pressTemplatesPortal.ts"),
  "utf8",
);

// Every Express route string registered in the portal module.
const routePatterns = Array.from(
  serverSrc.matchAll(/app\.(?:get|post|put|delete|patch)\(\s*\n?\s*["'`]([^"'`]+)["'`]/g),
  (m) => m[1],
);

/** Express path → regex ("/a/:id/b" → ^/a/[^/]+/b$). */
function toRegex(pattern: string): RegExp {
  const rx = pattern
    .split("/")
    .map((seg) => (seg.startsWith(":") ? "[^/]+" : seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
    .join("/");
  return new RegExp(`^${rx}$`);
}

function assertMatchesARoute(url: string) {
  const hit = routePatterns.find((p) => toRegex(p).test(url));
  assert.ok(
    hit,
    `client URL ${url} matches no route registered in server/pressTemplatesPortal.ts.\nRegistered: ${routePatterns.join("\n  ")}`,
  );
}

test("portal routes were extracted from the server module", () => {
  assert.ok(routePatterns.length >= 3, `expected several routes, got ${routePatterns.length}`);
});

test("run-a-test URL matches a registered server route", () => {
  assertMatchesARoute(templateTestPath("press-1", "spec-1"));
});

test("certify-run URL matches a registered server route", () => {
  assertMatchesARoute(certifyRunPath("press-1", "spec-1", "run-1"));
});
