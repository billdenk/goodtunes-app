import { sql, type SQL } from "drizzle-orm";

// Build a parameterised Postgres array literal that can be safely embedded
// inside a drizzle `sql`...`` template. Passing a JS array directly to a
// drizzle `sql` template (e.g. `ANY(${ids}::text[])`) spreads each element
// as its own placeholder — `ANY(($1, $2, $3)::text[])` — which Postgres
// either rejects outright or, for a single element, tries to cast a bare
// UUID to `text[]` and 500s. Use `pgArray(ids)` to produce a real
// `ARRAY[$1, $2, $3]::text[]` chunk that binds correctly for any length.
//
// Callers MUST guard against empty arrays — `ARRAY[]::text[]` is valid SQL
// but the surrounding code paths already early-return on empty scopes to
// avoid pointless roundtrips, and we want to keep that behavior.
export function pgArray(values: readonly string[], cast: string = "text"): SQL {
  const parts = values.map((v) => sql`${v}`);
  return sql`ARRAY[${sql.join(parts, sql`, `)}]::${sql.raw(cast)}[]`;
}
