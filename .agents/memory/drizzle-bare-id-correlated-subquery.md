---
name: drizzle bare-id in correlated subqueries
description: Interpolating ${table.id} inside a raw correlated EXISTS/IN subquery renders an UNqualified "id" that silently binds to the inner table — use the literal qualified name.
---

When you build a raw `sql\`...\`` correlated subquery and interpolate a drizzle
Column like `${customerUsers.id}`, drizzle can render it as a **bare** `"id"`
(NOT `"customer_users"."id"`), even though the same Column rendered elsewhere in
the query is fully qualified. Inside a subquery whose `FROM` table also has an
`id` column (e.g. `EXISTS (SELECT 1 FROM orders WHERE orders.customer_id = "id")`),
Postgres binds bare `"id"` to the **inner** table's id → the correlation is wrong
but still valid SQL, so it fails silently (no error), returning wrong rows/counts.

**Symptom seen:** admin Customers page counted every customer as "no sales"
(Buyers 0) because `orders.customer_id = "id"` resolved to `orders.customer_id =
orders.id` (never true). In a query that ALSO joins the inner table in the outer
scope, the bare `"id"` instead becomes ambiguous → a 500.

**Fix:** inside correlated raw subqueries, reference the outer column by its
**literal unaliased table name** (`customer_users.id`), not the interpolated
drizzle Column. Confirm rendering with `query.toSQL()` — it exposes the bug
immediately.

**Why:** drizzle's column qualification is context-dependent and can drop the
table prefix inside nested raw sql; EXPLAIN / db-query-smoke won't catch it
(the SQL is semantically valid), so it ships to prod.

**How to apply:** any time you write `${someTable.col}` inside a raw
`sql\`(SELECT ... FROM otherTable WHERE ...)\`` correlated subquery, check
toSQL(); prefer the literal `table.col` for the outer correlation. Tables here
are unaliased (`.from(customerUsers)` → `customer_users`).
