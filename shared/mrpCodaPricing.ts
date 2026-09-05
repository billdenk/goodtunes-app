/**
 * Memphis Record Pressing CODA pricing-code vocabulary (Task #3462).
 *
 * Source: GoodTunes___GoGoods-Tier3-2_1788555344172.xlsx, visible rows only.
 * Codes, rather than labels, are the identity boundary. A missing code or a
 * row held for an MRP decision resolves to null; callers must custom-quote.
 *
 * This module deliberately contains no prices. Existing all-in tier × jacket
 * ladders remain authoritative and operator locks remain untouched.
 */
export const MRP_CODA_SOURCE = "mrp-tier3-expanded-2026-09-04";

export type MrpCostType = "setup" | "job";
export type MrpChargeType = "per_lp" | "per_unit" | "flat_fee" | "per_sticker" | "per_touch";
export type MrpRowClassification =
  | "already_reflected"
  | "newly_mappable"
  | "intentionally_unsupported_hidden"
  | "requires_mrp_decision";
export type MrpTargetKind =
  | "record_tier"
  | "setup_rule"
  | "service"
  | "center_label"
  | "sleeve"
  | "jacket"
  | "insert"
  | "download_card"
  | "finish_surcharge"
  | "sticker"
  | "assembly"
  | "packaging";

export type MrpCodaCrosswalkEntry = {
  code: string;
  workbookRow: number;
  costType: MrpCostType;
  chargeType: MrpChargeType;
  classification: Exclude<MrpRowClassification, "intentionally_unsupported_hidden">;
  targetKind: MrpTargetKind;
  /** Stable platform-side identity. Exact option association may still be an
   * operator-reviewed component-price link; it is never inferred by label. */
  targetKey: string;
};

// code,row,cost type,charge type,row classification. The sole duplicate code
// in the workbook (4040F-0001 at rows 318/344) is represented once because
// both occurrences describe the same sticker-application charge.
const RAW = `
4051-0001,5,setup,per_lp,newly_mappable
4020-0001,6,setup,per_lp,newly_mappable
4050-0001,7,setup,per_lp,already_reflected
4020-0002,8,setup,per_lp,already_reflected
4051-0002,10,setup,per_lp,newly_mappable
4020-0004,11,setup,per_lp,newly_mappable
4021-0001,16,setup,per_lp,newly_mappable
4021-0002,17,setup,per_lp,newly_mappable
4021-0003,18,setup,per_lp,newly_mappable
4021-0004,22,setup,per_lp,already_reflected
4011B-0001,24,setup,per_unit,already_reflected
4140-0002,26,setup,per_unit,newly_mappable
4080-0001,29,setup,per_lp,requires_mrp_decision
4011-0001,31,job,per_lp,already_reflected
4011-0002,32,job,per_lp,newly_mappable
4012-0001,33,job,per_lp,already_reflected
4011A-0003,35,setup,per_lp,requires_mrp_decision
4011A-0004,38,job,per_lp,already_reflected
4011A-0005,39,job,per_lp,newly_mappable
4012A-0001,40,job,per_lp,already_reflected
4011A-0006,43,job,per_lp,already_reflected
4011A-0007,44,job,per_lp,newly_mappable
4012A-0002,45,job,per_lp,already_reflected
4011A-0008,48,job,per_lp,already_reflected
4011A-0009,49,job,per_lp,newly_mappable
4012A-0003,50,job,per_lp,already_reflected
4011A-0010,53,job,per_lp,already_reflected
4011A-0011,54,job,per_lp,newly_mappable
4011A-0012,57,job,per_lp,already_reflected
4011A-0014,58,setup,per_lp,already_reflected
4011A-0001,61,job,per_lp,already_reflected
4011A-0002,62,job,per_lp,newly_mappable
4011A-0015,64,job,per_lp,already_reflected
4011A-0016,65,job,per_lp,newly_mappable
4011A-0017,67,job,per_lp,already_reflected
4011A-0018,68,job,per_lp,newly_mappable
4011A-0019,70,job,per_lp,already_reflected
4011A-0020,71,job,per_lp,newly_mappable
4011A-0025,77,job,per_lp,newly_mappable
4011A-0026,78,job,per_lp,newly_mappable
4012A-0004,86,job,per_lp,already_reflected
4011A-0031,92,job,per_lp,newly_mappable
4011A-0032,93,job,per_lp,newly_mappable
4012A-0008,94,job,per_lp,newly_mappable
4035-0003,114,job,per_lp,already_reflected
4035-0004,115,job,per_lp,already_reflected
4033-0003,118,job,per_lp,newly_mappable
4033-0002,120,job,per_lp,newly_mappable
4033-0004,121,job,per_lp,newly_mappable
4033-0006,123,job,per_lp,newly_mappable
4033-0007,124,job,per_lp,newly_mappable
4033-0001,125,job,per_lp,newly_mappable
4037B-0001,126,job,per_lp,newly_mappable
4033-0008,133,job,per_lp,newly_mappable
4033-0009,134,job,per_lp,newly_mappable
4033-0010,135,job,per_lp,newly_mappable
4033-0011,136,job,per_lp,newly_mappable
4037B-0002,137,job,per_lp,newly_mappable
4037B-0003,138,job,per_lp,newly_mappable
4031-0003,140,job,per_unit,newly_mappable
4031-0004,141,job,per_unit,newly_mappable
4031-0005,142,job,per_unit,newly_mappable
4031-0006,143,job,per_unit,newly_mappable
4037A-0003,144,job,per_unit,newly_mappable
4037A-0004,145,job,per_unit,newly_mappable
4031-0007,147,job,per_unit,newly_mappable
4031-0008,148,job,per_unit,newly_mappable
4037A-0005,149,job,per_unit,newly_mappable
4037A-0006,150,job,per_unit,newly_mappable
4031-0009,152,job,per_unit,newly_mappable
4031-0010,153,job,per_unit,newly_mappable
4032-0001,165,job,per_unit,newly_mappable
4032-0002,166,job,per_unit,newly_mappable
4032-0003,167,job,per_unit,newly_mappable
4032-0005,169,job,per_unit,newly_mappable
4032-0006,170,job,per_unit,newly_mappable
4032-0007,172,job,per_unit,newly_mappable
4032-0009,174,job,per_unit,newly_mappable
4037C-0002,178,job,per_unit,newly_mappable
4037C-0003,179,job,per_unit,newly_mappable
4037C-0005,181,job,per_unit,newly_mappable
4037C-0006,183,job,per_unit,newly_mappable
4037C-0008,184,job,per_unit,newly_mappable
4037C-0010,186,job,per_unit,newly_mappable
4045-0002,222,job,per_unit,newly_mappable
4045-0003,223,job,per_unit,newly_mappable
4045-0006,226,job,per_unit,newly_mappable
4031-0018,238,job,per_unit,newly_mappable
4037A-0009,254,job,per_unit,newly_mappable
4037A-0010,255,job,per_unit,newly_mappable
4055-0002,265,setup,flat_fee,newly_mappable
4036-0002,269,job,per_sticker,already_reflected
4036-0003,271,job,per_sticker,newly_mappable
4036-0004,272,job,per_sticker,newly_mappable
4036-0005,273,job,per_sticker,newly_mappable
4036-0006,275,job,per_sticker,newly_mappable
4036-0007,276,job,per_sticker,newly_mappable
4036-0008,277,job,per_sticker,newly_mappable
4036-0009,279,job,per_sticker,newly_mappable
4036-0010,280,job,per_sticker,newly_mappable
4036-0011,281,job,per_sticker,newly_mappable
4036-0012,282,job,per_sticker,newly_mappable
4036-0013,283,job,per_sticker,newly_mappable
4036-0014,285,job,per_sticker,newly_mappable
4036-0015,286,job,per_sticker,newly_mappable
4036-0016,287,job,per_sticker,newly_mappable
4036-0019,303,setup,flat_fee,newly_mappable
4036-0020,307,job,per_sticker,newly_mappable
4036-0021,308,job,per_sticker,newly_mappable
4036-0022,309,job,per_sticker,newly_mappable
4036-0023,310,job,per_sticker,newly_mappable
4036-0024,312,job,per_sticker,newly_mappable
4036-0025,313,job,per_sticker,newly_mappable
4036-0026,314,job,per_sticker,newly_mappable
4036-0027,315,job,per_sticker,newly_mappable
4036-0028,316,job,per_sticker,newly_mappable
4040F-0001,318,job,per_sticker,newly_mappable
4040A-0004,342,job,per_touch,already_reflected
4040E-0002,346,job,per_unit,already_reflected
4033-0013,348,job,per_unit,newly_mappable
4033-0015,349,job,per_unit,newly_mappable
4033-0016,350,job,per_unit,newly_mappable
4033-0018,352,job,per_unit,newly_mappable
4033-0019,353,job,per_unit,newly_mappable
`.trim();

function targetKindFor(code: string): MrpTargetKind {
  if (/^(4011|4012)/.test(code) && code !== "4011B-0001") return code === "4011A-0012" ? "finish_surcharge" : code === "4011A-0003" || code === "4011A-0014" ? "setup_rule" : "record_tier";
  if (/^(4021|4080)/.test(code)) return "setup_rule";
  if (/^(4050|4051|4020|4011B|4140|4055)/.test(code)) return "service";
  if (code.startsWith("4035")) return "center_label";
  if (/^(4033|4037B)/.test(code)) return "sleeve";
  if (/^(4031|4037A)/.test(code)) return code === "4031-0018" || code === "4037A-0009" || code === "4037A-0010" ? "finish_surcharge" : "jacket";
  if (/^(4032|4037C)/.test(code)) return "insert";
  if (code.startsWith("4045")) return "download_card";
  if (code.startsWith("4036") || code.startsWith("4040F")) return "sticker";
  if (code.startsWith("4040A")) return "assembly";
  return "packaging";
}

const TARGET_KEY_OVERRIDES: Record<string, string> = {
  "4051-0001": "service:dmm-cutting:12-10",
  "4020-0001": "service:dmm-plating:12-10",
  "4050-0001": "service:cutting",
  "4020-0002": "service:plating",
  "4051-0002": "service:dmm-cutting:7",
  "4020-0004": "service:dmm-plating:7",
  "4021-0001": "setup-rule:stamper:140",
  "4021-0002": "setup-rule:stamper:180",
  "4021-0003": "setup-rule:stamper:special-effect",
  "4021-0004": "setup-rule:stamper:7",
  "4011B-0001": "service:test",
  "4140-0002": "service:test-shipping:two-day-us",
  "4080-0001": "setup-rule:press-setup:under-500",
  "4011A-0003": "setup-rule:color",
  "4011A-0012": "type:splatter",
  "4011-0001": "type:black",
  "4011-0002": "type:black",
  "4012-0001": "type:black",
  "4011A-0004": "type:translucent",
  "4011A-0005": "type:translucent",
  "4012A-0001": "type:translucent",
  "4011A-0006": "type:opaque",
  "4011A-0007": "type:opaque",
  "4012A-0002": "type:opaque",
  "4011A-0008": "type:neon",
  "4011A-0009": "type:neon",
  "4012A-0003": "type:neon",
  "4011A-0010": "type:glow-in-the-dark",
  "4011A-0011": "type:glow-in-the-dark",
  "4011A-0001": "type:ecomix",
  "4011A-0002": "type:ecomix",
  "4011A-0015": "type:standard-blends",
  "4011A-0016": "type:standard-blends",
  "4011A-0017": "type:deluxe-blends",
  "4011A-0018": "type:deluxe-blends",
  "4011A-0019": "type:half",
  "4011A-0020": "type:half",
  "4011A-0025": "type:3-color-split",
  "4011A-0026": "type:3-color-split",
  "4011A-0031": "type:picture-disc",
  "4011A-0032": "type:picture-disc",
  "4012A-0008": "type:picture-disc",
  "4011A-0014": "setup-rule:splatter-color",
  "4035-0003": "labels:bw",
  "4035-0004": "labels:color",
  "4033-0003": "sleeves:unprinted",
  "4033-0018": "packaging:open-top-polybag",
  "4031-0004": "jackets:single",
  "4032-0003": "inserts:12x12-color",
  "4055-0002": "service:barcode-generation",
  "4040F-0001": "service:sticker-application",
  "4040A-0004": "service:assembly",
  "4040E-0002": "service:shrink",
};

export const MRP_CODA_CROSSWALK: ReadonlyMap<string, MrpCodaCrosswalkEntry> = new Map(
  RAW.split("\n").map((line) => {
    const [code, row, costType, chargeType, classification] = line.split(",");
    const entry: MrpCodaCrosswalkEntry = {
      code,
      workbookRow: Number(row),
      costType: costType as MrpCostType,
      chargeType: chargeType as MrpChargeType,
      classification: classification as MrpCodaCrosswalkEntry["classification"],
      targetKind: targetKindFor(code),
      targetKey: TARGET_KEY_OVERRIDES[code] ?? `${targetKindFor(code)}:coda:${code}`,
    };
    return [code, entry] as const;
  }),
);

export function resolveMrpCodaCode(code: unknown): MrpCodaCrosswalkEntry | null {
  if (typeof code !== "string") return null;
  const entry = MRP_CODA_CROSSWALK.get(code.trim());
  if (!entry || entry.classification === "requires_mrp_decision") return null;
  return entry;
}

export type MrpMultiplicityContext = {
  finishedUnits: number;
  discsPerFinishedUnit: number;
  stickersPerFinishedUnit?: number;
  touchesPerFinishedUnit?: number;
};

/**
 * Number of times a CODA rate applies.
 *
 * Workbook comment J2:
 * - job costs use finished-good quantity; per-LP adds discs per finished unit
 * - setup costs charge once; per-LP adds discs in one finished unit
 * - sticker/touch counts are explicit, never inferred from a label
 *
 * null is the fail-closed result for unknown/held codes or malformed counts.
 */
export function mrpCodaMultiplicity(
  code: unknown,
  context: MrpMultiplicityContext,
): number | null {
  const entry = resolveMrpCodaCode(code);
  if (!entry) return null;
  const ints = [
    context.finishedUnits,
    context.discsPerFinishedUnit,
    context.stickersPerFinishedUnit ?? 1,
    context.touchesPerFinishedUnit ?? 1,
  ];
  if (ints.some((n) => !Number.isSafeInteger(n) || n < 1)) return null;
  if (entry.costType === "setup") {
    return entry.chargeType === "per_lp" ? context.discsPerFinishedUnit : 1;
  }
  const perFinished =
    entry.chargeType === "per_lp"
      ? context.discsPerFinishedUnit
      : entry.chargeType === "per_sticker"
        ? context.stickersPerFinishedUnit ?? 1
        : entry.chargeType === "per_touch"
          ? context.touchesPerFinishedUnit ?? 1
          : 1;
  return context.finishedUnits * perFinished;
}

export function extendMrpCodaCents(
  code: unknown,
  rateCents: unknown,
  context: MrpMultiplicityContext,
): number | null {
  if (!Number.isSafeInteger(rateCents) || (rateCents as number) < 0) return null;
  const multiplicity = mrpCodaMultiplicity(code, context);
  return multiplicity == null ? null : (rateCents as number) * multiplicity;
}