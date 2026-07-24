// The permanent Shopify E2E QA test album ("GoodTunes QA Test Album (do not
// sell)"). Orders minted against this album — from ANY channel — are test
// purchases and must carry origin='qa:test' so every admin/report/queue
// exclusion filter picks them up (see docs/shopify-app-review.md).
export const QA_TEST_ALBUM_ID = "a0000000-0000-4000-8000-00000000e2e0";
