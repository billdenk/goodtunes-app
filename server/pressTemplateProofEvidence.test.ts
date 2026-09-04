import assert from "node:assert/strict";
import test from "node:test";
import {
  proofCheck,
  runHasPassingOrderedPageProof,
  validateOrderedPageProof,
} from "./pressTemplateProofEvidence";

const pair = (page: number, verdict: "pass" | "fail" | "untested" = "pass") => ({
  page,
  template: { widthMm: 190.5, heightMm: 222.3 },
  art: { widthMm: 190.5, heightMm: 222.3 },
  effectivePpi: 300,
  color: { hasCmyk: true, hasRgb: false, hasGray: false, hasSpot: false },
  gtLayerNames: [],
  verdict,
});
const proof = (pairs = [pair(1), pair(2)]) => ({
  templatePageCount: pairs.length,
  artPageCount: pairs.length,
  pairs,
});

test("only contiguous, complete, all-pass evidence matching server artifacts validates", () => {
  assert.equal(validateOrderedPageProof(proof(), 2, 2).ok, true);
  assert.equal(validateOrderedPageProof(proof(), 1, 2).ok, false);
  assert.equal(validateOrderedPageProof(proof([pair(1), pair(3)]), 2, 2).ok, false);
  assert.equal(validateOrderedPageProof(proof([pair(1), pair(2, "fail")]), 2, 2).ok, false);
  assert.equal(
    validateOrderedPageProof(proof(), 2, 2, [{ w: 190.5, h: 222.3 }, { w: 190.5, h: 222.3 }], [{ w: 190.5, h: 222.3 }, { w: 190.5, h: 222.3 }]).ok,
    true,
  );
  assert.equal(
    validateOrderedPageProof(proof(), 2, 2, [{ w: 100, h: 100 }, { w: 100, h: 100 }], []).ok,
    false,
  );
});

test("forged aggregate true cannot replace failed or missing ordered evidence", () => {
  // certifyOnPass is intentionally absent from this validator: no client
  // boolean changes a failing/missing pair into certifiable proof.
  const failed = validateOrderedPageProof(proof([pair(1), pair(2, "fail")]), 2, 2);
  assert.equal(failed.ok, false);
  const missing = validateOrderedPageProof(undefined, 2, 2);
  assert.equal(missing.ok, false);
  assert.equal(runHasPassingOrderedPageProof([proofCheck(proof(), { ok: true })]), true);
  assert.equal(runHasPassingOrderedPageProof([proofCheck(proof(), failed)]), false);
});