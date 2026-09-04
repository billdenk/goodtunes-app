import { z } from "zod";

const geometry = z.object({
  widthMm: z.number().positive().max(2000),
  heightMm: z.number().positive().max(2000),
});

export const orderedPageProofSchema = z.object({
  templatePageCount: z.number().int().min(1).max(200),
  artPageCount: z.number().int().min(1).max(200),
  pairs: z.array(z.object({
    page: z.number().int().min(1).max(200),
    template: geometry,
    art: geometry,
    effectivePpi: z.number().positive().max(100000).nullable(),
    color: z.object({
      hasCmyk: z.boolean(),
      hasRgb: z.boolean(),
      hasGray: z.boolean(),
      hasSpot: z.boolean(),
    }),
    gtLayerNames: z.array(z.string().min(1).max(512)).max(100),
    verdict: z.enum(["pass", "fail", "untested"]),
  })).min(1).max(200),
});

export type OrderedPageProof = z.infer<typeof orderedPageProofSchema>;

/** A client claim is never enough: validate shape, contiguous ordering, every
 * pair's own result, and the independently scanned artifacts' page counts. */
export function validateOrderedPageProof(
  value: unknown,
  serverTemplatePages: number,
  serverArtPages: number,
  serverTemplateSizesMm: Array<{ w: number; h: number }> = [],
  serverArtSizesMm: Array<{ w: number; h: number }> = [],
): { ok: true; proof: OrderedPageProof } | { ok: false; message: string } {
  const parsed = orderedPageProofSchema.safeParse(value);
  if (!parsed.success) return { ok: false, message: "Ordered page proof is missing or malformed." };
  const proof = parsed.data;
  if (proof.templatePageCount !== proof.artPageCount || proof.pairs.length !== proof.templatePageCount) {
    return { ok: false, message: "Ordered page proof has missing or unpaired pages." };
  }
  if (proof.templatePageCount !== serverTemplatePages || proof.artPageCount !== serverArtPages) {
    return { ok: false, message: "Ordered page proof does not match the current template and artwork artifacts." };
  }
  for (let index = 0; index < proof.pairs.length; index++) {
    const pair = proof.pairs[index];
    if (pair.page !== index + 1) return { ok: false, message: "Ordered page proof pages are not contiguous and in order." };
    if (pair.verdict !== "pass") return { ok: false, message: `Ordered page proof fails on page ${pair.page}.` };
    const sameSize = (claimed: { widthMm: number; heightMm: number }, actual?: { w: number; h: number }) =>
      !actual ||
      (Math.abs(claimed.widthMm - actual.w) <= 1 && Math.abs(claimed.heightMm - actual.h) <= 1) ||
      (Math.abs(claimed.widthMm - actual.h) <= 1 && Math.abs(claimed.heightMm - actual.w) <= 1);
    if (!sameSize(pair.template, serverTemplateSizesMm[index]) || !sameSize(pair.art, serverArtSizesMm[index])) {
      return { ok: false, message: `Ordered page proof geometry does not match page ${pair.page} of the server artifacts.` };
    }
  }
  return { ok: true, proof };
}

export function proofCheck(proof: unknown, validation: { ok: boolean; message?: string }) {
  return {
    key: "ordered-page-proof",
    label: "Ordered page proof",
    status: validation.ok ? "pass" : "fail",
    message: validation.ok
      ? "Every ordered template/art page pair passed."
      : validation.message ?? "Ordered page proof failed.",
    tier: "system",
    evidence: proof,
  };
}

export function runHasPassingOrderedPageProof(checks: unknown): boolean {
  return Array.isArray(checks) && checks.some((check: any) =>
    check?.key === "ordered-page-proof" && check?.status === "pass" &&
    orderedPageProofSchema.safeParse(check.evidence).success,
  );
}