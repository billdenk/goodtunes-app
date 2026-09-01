import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const serverSource = readFileSync(
  new URL("./shopifyPlus.ts", import.meta.url),
  "utf8",
);
const clientSource = readFileSync(
  new URL(
    "../client/src/components/admin/ShopifyPlusPanel.tsx",
    import.meta.url,
  ),
  "utf8",
);

test("manufacturing card fee is derived from Stripe metadata on the server", () => {
  const quoteRouteStart = serverSource.indexOf(
    '"/api/admin/albums/:albumId/manufacturing-ledger/steps/:stepId/card-quote"',
  );
  const payRouteStart = serverSource.indexOf(
    '"/api/admin/albums/:albumId/manufacturing-ledger/steps/:stepId/pay"',
  );
  assert.ok(quoteRouteStart >= 0);
  assert.ok(payRouteStart > quoteRouteStart);

  const quoteRoute = serverSource.slice(quoteRouteStart, payRouteStart);
  assert.match(quoteRoute, /paymentMethods\.retrieve\(\s*paymentMethodId/);
  assert.match(quoteRoute, /cardFeeConditionsFromStripe/);
  assert.match(quoteRoute, /quoteCardSurcharge/);
  assert.doesNotMatch(quoteRoute, /req\.body[^;]*(fee|surcharge)/i);

  const payRoute = serverSource.slice(payRouteStart);
  assert.match(payRoute, /paymentMethods\.retrieve\(paymentMethodId\)/);
  assert.match(payRoute, /amount:\s*cardQuote\.totalChargeCents/);
  assert.match(payRoute, /payment_method:\s*paymentMethodId/);
  assert.match(
    payRoute,
    /idempotencyKey:\s*`shopify-plus-card-\$\{step\.id\}-\$\{paymentMethodId\}`/,
  );
  assert.match(payRoute, /STRIPE_OBJECT_MAY_EXIST_PREFIX/);
});

test("manufacturing UI collects a Stripe card but never re-derives its fee", () => {
  assert.match(clientSource, /<CardElement/);
  assert.match(clientSource, /stripe\.createPaymentMethod/);
  assert.match(clientSource, /\/card-quote`/);
  assert.match(clientSource, /stripe\.confirmCardPayment/);
  assert.match(clientSource, /const invoiceCents = stepTotalCents\(step\)/);
  assert.doesNotMatch(clientSource, /\bcardFeeCents\s*\(/);
  assert.doesNotMatch(clientSource, /cardFeeScenario/);
});