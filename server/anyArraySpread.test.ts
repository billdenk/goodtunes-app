// Task #2572 — guard against the Drizzle ANY-array-spread landmine.
//
// Interpolating a raw JS array into a drizzle sql template — e.g.
// `= ANY(${ids})` or `= ANY(${ids}::text[])` — spreads each element into its
// own bind param (`ANY(($1, $2))`), which Postgres rejects at runtime with
// "op ANY/ALL (array) requires array on right side" (or 22P02 for a single
// element). It only fires when the array is non-empty, so it slips through
// empty-DB dev testing and detonates in production (Sentry: the non-profit
// analytics 500 this task fixed).
//
// The safe pattern is `ANY(${pgArray(ids)})` (server/lib/pgArray.ts). This
// test mechanically scans every server/shared TS file and fails on any
// ANY(${...}) interpolation that isn't wrapped in pgArray(...).

import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["server", "shared"];

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...tsFiles(p));
    else if (name.endsWith(".ts") && !name.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

test("no bare ANY(${...}) array interpolations (must use pgArray)", () => {
  const offenders: string[] = [];
  for (const root of ROOTS) {
    for (const file of tsFiles(root)) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        // Skip pure comment lines (pgArray.ts's own doc comment shows the
        // anti-pattern as an example).
        if (line.trimStart().startsWith("//")) return;
        // Match ANY(${...}) where the interpolation does not start with
        // pgArray(. Covers both `ANY(${ids})` and `ANY(${ids}::text[])`.
        const re = /ANY\s*\(\s*\$\{\s*(?!pgArray\s*\()/g;
        if (re.test(line)) offenders.push(`${file}:${i + 1}: ${line.trim()}`);
      });
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `Bare JS-array interpolation inside ANY() — drizzle spreads it into ` +
      `($1,$2,...) and Postgres 500s at runtime. Wrap with pgArray(...) from ` +
      `server/lib/pgArray.ts:\n${offenders.join("\n")}`,
  );
});
