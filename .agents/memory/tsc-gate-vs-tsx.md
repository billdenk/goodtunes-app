---
name: Full tsc is not the type gate; tsx dev + test workflow miss server import errors
description: Why a missing @shared/schema import in server/routes.ts compiles in dev and passes tests but is still a real bug
---
The repo's real CI gates are the `test` workflow (tsconfig.test.json, jsx) + `design:lint` + `db-query-smoke` + `schema-drift-smoke`. There is NO full-server type gate: dev runs `tsx server/index.ts` (no type-check) and `tsconfig.json` targets ES5, so `npx tsc --noEmit -p tsconfig.json` reports HUNDREDS of pre-existing errors (req.query `string | string[]`, ES5 downlevel iteration, function-decl-in-block, IStorage drift). Do NOT chase those — they are baseline noise.

**Why it matters:** a brand-new `server/routes.ts` reference to a `@shared/schema` export that you forgot to add to the import list will: compile fine under tsx (dev boots), pass the `test` workflow (those tests don't import that route), and only surface under full `tsc`. So after adding a server route that uses a NEW schema/insert-schema, grep the import line — don't trust "dev works + tests pass".

**How to apply:** verify a new server schema import with `npx tsc --noEmit -p tsconfig.json 2>&1 | rg <YourNewSymbol>` (filter to your symbol), not by reading the whole error dump.
