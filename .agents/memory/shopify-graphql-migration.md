---
name: Shopify GraphQL migration + app-store self-review
description: Version-pin gotchas for inventorySetQuantities and how to run the shopify-app-store-review skill in this repo (Node 20 vs CLI).
---

- **inventorySetQuantities version trap:** the pinned `SHOPIFY_GRAPHQL_API_VERSION` (2026-01) still supports `ignoreCompareQuantity: true` (absolute-set, matching REST `inventory_levels/set.json`). 2026-04 removes it in favor of per-item `changeFromQuantity` + `@idempotent`. Never bump the version pin without rewriting the mutation input, or inventory pushes fail with userErrors.
  **How to apply:** any change to `SHOPIFY_GRAPHQL_API_VERSION` in `server/shopify.ts` must re-check every GraphQL mutation's input shape against that version's docs.
- **Running the app-store-review skill:** repo Node is 20, but `shopify doc fetch` only exists in recent @shopify/cli versions which require Node 22+. Fix: prefix with a nix-store Node 22 (`PATH=/nix/store/*nodejs-22*/bin:$PATH npx -y @shopify/cli@latest doc fetch --url ... --output /tmp/reqs.md`). Older CLIs (3.78–3.83) lack the command — don't waste time downgrading.
- **No live dev-store in task envs:** `listConnections('shopify-store')` is empty and dev `shopify_stores` rows are fake fixtures — GraphQL changes can only be verified via hermetic stubbed-fetch tests (pattern: `server/shopifyGraphqlPhase*.test.ts`) + the skill's code-templates reference; live verification needs a real connected store.
