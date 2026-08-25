// Task #3379 — Inbound pricing push API for a press's ERP (MRP's
// Matilda ERP first).
//
// Matilda Tech's bespoke ERP has no public API we can pull from (unlike
// the Coda sync, server/codaPricingSync.ts), so the flow inverts: the
// ERP formats a JSON payload and POSTs it to us with a per-press API
// key. Pushed pricing NEVER writes ladders directly — a real push lands
// as a "pending" run in the shared sync-history table
// (`press_pricing_syncs`, source "erp_push") that an operator previews
// as a diff and commits, the exact preview→commit safety model the Coda
// sync uses. Operator-locked rungs (`lockedFromSync`) survive commits
// untouched (shared mergeCodaLadder).
//
// Credential model: at most one ACTIVE key per press ("gtpush_<keyId>_
// <secret>"). The full key is shown ONCE at mint; the secret half is
// envelope-encrypted at rest (same AES-256-GCM envelope as the Coda
// token) and verified with a constant-time compare. Minting a new key
// revokes the old row (kept for audit). Auth failures and pushes are
// rate-limited per key/IP.
//
// v1 scope: default-jacket record pricing ladders only — the same scope
// as the Coda sync. The /api/erp/v1/... path family deliberately leaves
// room for orders/inventory/status endpoints later.

import { randomBytes, timingSafeEqual } from "crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "./db";
import {
  pressPushCredentials,
  pressPricingSyncs,
  pressTierJacketLadders,
  ALBUM_FORMATS,
  type AlbumFormat,
  type PressPushCredential,
} from "@shared/schema";
import { encryptSecret, decryptSecret } from "./auth/crypto";
import {
  loadCatalogContext,
  mergeCodaLadder,
  parseCodaFormat,
  type LadderRung,
  type CodaProposalWrite,
} from "./codaPricingSync";

export const ERP_PUSH_SOURCE = "erp_push";
export const PUSH_KEY_PREFIX = "gtpush";
export const MAX_PUSH_ROWS = 2000;
// Serialized payload cap (bytes of the JSON body we accept).
export const MAX_PUSH_PAYLOAD_BYTES = 1_000_000;

// ─── Credential management (operator-only mint/revoke) ──────────────

export function generatePushKey(): { keyId: string; secret: string; key: string } {
  const keyId = randomBytes(6).toString("hex"); // 12 chars, public half
  const secret = randomBytes(24).toString("hex"); // 48 chars
  return { keyId, secret, key: `${PUSH_KEY_PREFIX}_${keyId}_${secret}` };
}

export async function getActivePushCredential(
  pressId: string,
): Promise<PressPushCredential | null> {
  const [row] = await db
    .select()
    .from(pressPushCredentials)
    .where(and(eq(pressPushCredentials.pressId, pressId), isNull(pressPushCredentials.revokedAt)))
    .orderBy(desc(pressPushCredentials.createdAt))
    .limit(1);
  return row ?? null;
}

/** Public (browser-safe) projection — NEVER includes the secret. */
export function toPublicPushCredential(row: PressPushCredential | null) {
  if (!row) return { configured: false as const };
  return {
    configured: true as const,
    keyId: row.keyId,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
  };
}

/** Mint a fresh key for the press. Any previously-active key is revoked
 *  in the same transaction. Returns the FULL key exactly once. */
export async function mintPushCredential(
  pressId: string,
  userId: string | null,
): Promise<{ key: string; credential: PressPushCredential }> {
  const { keyId, secret, key } = generatePushKey();
  const credential = await db.transaction(async (tx) => {
    await tx
      .update(pressPushCredentials)
      .set({ revokedAt: new Date(), revokedByUserId: userId })
      .where(
        and(eq(pressPushCredentials.pressId, pressId), isNull(pressPushCredentials.revokedAt)),
      );
    const [row] = await tx
      .insert(pressPushCredentials)
      .values({
        pressId,
        keyId,
        secretEncrypted: encryptSecret(secret),
        createdByUserId: userId,
      })
      .returning();
    return row;
  });
  return { key, credential };
}

export async function revokePushCredential(pressId: string, userId: string | null): Promise<boolean> {
  const rows = await db
    .update(pressPushCredentials)
    .set({ revokedAt: new Date(), revokedByUserId: userId })
    .where(and(eq(pressPushCredentials.pressId, pressId), isNull(pressPushCredentials.revokedAt)))
    .returning();
  return rows.length > 0;
}

// ─── Inbound key verification (constant-time) ────────────────────────

const KEY_RE = new RegExp(`^${PUSH_KEY_PREFIX}_([0-9a-f]{12})_([0-9a-f]{48})$`);

// Dummy secret so "unknown keyId" and "wrong secret" cost the same
// compare — the caller can't probe which keyIds exist by timing.
const DUMMY_SECRET = "0".repeat(48);

export async function verifyPushKey(
  presented: string | undefined | null,
): Promise<{ pressId: string; credentialId: string } | null> {
  const m = typeof presented === "string" ? presented.trim().match(KEY_RE) : null;
  const keyId = m?.[1] ?? "";
  const secret = m?.[2] ?? DUMMY_SECRET;
  let stored: PressPushCredential | null = null;
  if (keyId) {
    const [row] = await db
      .select()
      .from(pressPushCredentials)
      .where(and(eq(pressPushCredentials.keyId, keyId), isNull(pressPushCredentials.revokedAt)));
    stored = row ?? null;
  }
  let expected = DUMMY_SECRET;
  if (stored) {
    try {
      expected = decryptSecret(stored.secretEncrypted);
    } catch {
      expected = DUMMY_SECRET;
      stored = null;
    }
  }
  const a = Buffer.from(secret, "utf8");
  const b = Buffer.from(expected, "utf8");
  const equal = a.length === b.length && timingSafeEqual(a, b);
  if (!stored || !equal) return null;
  // Best-effort usage stamp — never let it fail the request.
  void db
    .update(pressPushCredentials)
    .set({ lastUsedAt: new Date() })
    .where(eq(pressPushCredentials.id, stored.id))
    .then(
      () => {},
      () => {},
    );
  return { pressId: stored.pressId, credentialId: stored.id };
}

// ─── Rate limiting (in-memory, per instance) ─────────────────────────

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

/** Sliding-window-ish limiter. Returns true when the call is ALLOWED. */
export function checkPushRateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  b.count++;
  return b.count <= max;
}

// ─── Payload parsing (pure; unit-tested; no DB, no writes) ───────────

export type PushRowError = {
  index: number | null; // null = payload-level error
  field: string | null;
  code: string;
  message: string;
};
export type PushWarning = { index: number | null; code: string; message: string };
export type ParsedPushRow = {
  index: number;
  format: AlbumFormat;
  tierName: string;
  qty: number;
  unitCents: number;
};
export type ParsedPushPayload = {
  version: number | null;
  rowsReceived: number;
  rows: ParsedPushRow[];
  errors: PushRowError[];
  warnings: PushWarning[];
};

const KNOWN_ROW_FIELDS = new Set(["tier", "quantity", "unit_price", "total_price", "format"]);

/** Parse a price value (dollars) into integer cents. Accepts numbers and
 *  strings like "2.35", "$2.35", "1,234.50". Null = unparseable. */
export function parsePushPrice(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return Math.round(v * 100);
  if (typeof v === "string") {
    const cleaned = v.replace(/[$,\s]/g, "");
    if (!cleaned) return null;
    const n = Number(cleaned);
    if (Number.isFinite(n) && n > 0) return Math.round(n * 100);
  }
  return null;
}

/** Parse a format value: exact catalog ids ("12_lp") win, then the loose
 *  vocabulary the Coda sync accepts ('12"', "2LP", "Cassette"…). */
export function parsePushFormat(v: unknown): AlbumFormat | null {
  if (typeof v !== "string") return null;
  const exact = v.trim().toLowerCase();
  if ((ALBUM_FORMATS as readonly string[]).includes(exact)) return exact as AlbumFormat;
  return parseCodaFormat(v);
}

export function parsePushPayload(body: unknown): ParsedPushPayload {
  const errors: PushRowError[] = [];
  const warnings: PushWarning[] = [];
  const err = (index: number | null, field: string | null, code: string, message: string) =>
    errors.push({ index, field, code, message });

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    err(null, null, "payload_not_object", "The request body must be a JSON object.");
    return { version: null, rowsReceived: 0, rows: [], errors, warnings };
  }
  const p = body as Record<string, unknown>;

  const version = typeof p.version === "number" ? p.version : null;
  if (p.version === undefined) {
    err(null, "version", "version_missing", 'Include "version": 1 in the payload.');
  } else if (version !== 1) {
    err(null, "version", "unsupported_version", `Unsupported payload version ${JSON.stringify(p.version)} — this endpoint accepts version 1.`);
  }

  let defaultFormat: AlbumFormat | null = null;
  if (p.default_format !== undefined && p.default_format !== null) {
    defaultFormat = parsePushFormat(p.default_format);
    if (!defaultFormat) {
      err(null, "default_format", "format_unrecognized", `Unrecognized default_format ${JSON.stringify(p.default_format)}. Use one of: ${ALBUM_FORMATS.join(", ")}.`);
    }
  }

  if (!Array.isArray(p.rows)) {
    err(null, "rows", "rows_missing", '"rows" must be an array of pricing rows.');
    return { version, rowsReceived: 0, rows: [], errors, warnings };
  }
  const rawRows = p.rows as unknown[];
  if (rawRows.length === 0) {
    err(null, "rows", "rows_empty", '"rows" is empty — include at least one pricing row.');
    return { version, rowsReceived: 0, rows: [], errors, warnings };
  }
  if (rawRows.length > MAX_PUSH_ROWS) {
    err(null, "rows", "too_many_rows", `"rows" has ${rawRows.length} entries — the maximum per push is ${MAX_PUSH_ROWS}.`);
    return { version, rowsReceived: rawRows.length, rows: [], errors, warnings };
  }

  const rows: ParsedPushRow[] = [];
  const seen = new Map<string, number>(); // (format|tier|qty) -> first index
  rawRows.forEach((raw, index) => {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      err(index, null, "row_not_object", "Each row must be a JSON object.");
      return;
    }
    const r = raw as Record<string, unknown>;
    for (const k of Object.keys(r)) {
      if (!KNOWN_ROW_FIELDS.has(k)) {
        warnings.push({ index, code: "unknown_field", message: `Field "${k}" is not part of the v1 schema and was ignored.` });
      }
    }
    const tierName = typeof r.tier === "string" ? r.tier.trim() : "";
    if (!tierName) {
      err(index, "tier", "tier_missing", '"tier" must be a non-empty string naming the pricing tier (e.g. "Black", "Opaque").');
      return;
    }
    if (tierName.length > 120) {
      err(index, "tier", "tier_invalid", '"tier" is longer than 120 characters.');
      return;
    }
    const qty =
      typeof r.quantity === "number" && Number.isInteger(r.quantity) && r.quantity >= 1
        ? r.quantity
        : null;
    if (!qty) {
      err(index, "quantity", "quantity_invalid", '"quantity" must be a positive integer (the run quantity, e.g. 300).');
      return;
    }
    const hasUnit = r.unit_price !== undefined && r.unit_price !== null;
    const hasTotal = r.total_price !== undefined && r.total_price !== null;
    if (!hasUnit && !hasTotal) {
      err(index, "unit_price", "price_missing", 'Include exactly one of "unit_price" or "total_price" (USD).');
      return;
    }
    if (hasUnit && hasTotal) {
      err(index, "unit_price", "price_conflict", 'Include only ONE of "unit_price" or "total_price", not both.');
      return;
    }
    const priceCents = parsePushPrice(hasUnit ? r.unit_price : r.total_price);
    if (!priceCents) {
      err(index, hasUnit ? "unit_price" : "total_price", "price_invalid", `${hasUnit ? '"unit_price"' : '"total_price"'} must be a positive USD amount (number or string like "2.35").`);
      return;
    }
    const unitCents = hasTotal ? Math.round(priceCents / qty) : priceCents;
    if (unitCents < 1) {
      err(index, "total_price", "unit_price_zero", "The computed per-unit price rounds to zero cents.");
      return;
    }
    let format: AlbumFormat | null = null;
    if (r.format !== undefined && r.format !== null) {
      format = parsePushFormat(r.format);
      if (!format) {
        err(index, "format", "format_unrecognized", `Unrecognized "format" ${JSON.stringify(r.format)}. Use one of: ${ALBUM_FORMATS.join(", ")}.`);
        return;
      }
    } else if (defaultFormat) {
      format = defaultFormat;
    }
    if (!format) {
      err(index, "format", "format_missing", 'Set "format" on the row or a top-level "default_format".');
      return;
    }
    const key = `${format}|${tierName.toLowerCase()}|${qty}`;
    const firstIdx = seen.get(key);
    if (firstIdx !== undefined) {
      err(index, null, "duplicate_row", `Duplicate of row ${firstIdx}: same format/tier/quantity (${format} / ${tierName} / ${qty}). Send each rung once.`);
      return;
    }
    seen.set(key, index);
    rows.push({ index, format, tierName, qty, unitCents });
  });

  return { version, rowsReceived: rawRows.length, rows, errors, warnings };
}

// ─── Diff annotation against the press catalog (no writes) ──────────

export type PushProposal = {
  source: typeof ERP_PUSH_SOURCE;
  receivedAt: string;
  payloadVersion: number | null;
  keyId: string | null;
  rowsReceived: number;
  rows: ParsedPushRow[];
  writes: CodaProposalWrite[];
  errors: PushRowError[];
  warnings: PushWarning[];
  tiersMissing: string[];
};

export async function annotatePushRows(
  pressId: string,
  rows: ParsedPushRow[],
): Promise<{ writes: CodaProposalWrite[]; tiersMissing: string[] }> {
  const { defaultJacket, tierByKey, ladderByCombo } = await loadCatalogContext(pressId);
  const tiersMissingSet = new Set<string>();
  const writes: CodaProposalWrite[] = rows.map((w) => {
    const base = { format: w.format, tierName: w.tierName, qty: w.qty, unitCents: w.unitCents };
    const tier = tierByKey.get(`${w.format}|${w.tierName.trim().toLowerCase()}`);
    if (!tier) {
      tiersMissingSet.add(`${w.format}/${w.tierName}`);
      return { ...base, change: "tier_missing" as const, oldUnitCents: null, matchedTierName: null };
    }
    const existing = defaultJacket
      ? ((ladderByCombo.get(`${tier.id}|${defaultJacket.id}`)?.priceLadder ?? []) as LadderRung[])
      : [];
    const rung = existing.find((r) => Number(r.qty) === w.qty);
    if (!rung) return { ...base, change: "new" as const, oldUnitCents: null, matchedTierName: tier.name };
    if (rung.lockedFromSync) {
      return { ...base, change: "locked" as const, oldUnitCents: rung.unitCents, matchedTierName: tier.name };
    }
    return {
      ...base,
      change: rung.unitCents === w.unitCents ? ("unchanged" as const) : ("updated" as const),
      oldUnitCents: rung.unitCents,
      matchedTierName: tier.name,
    };
  });
  return { writes, tiersMissing: Array.from(tiersMissingSet).sort() };
}

// ─── Sync-history recording (validate + submit + commit lifecycle) ───

function syncCounts(parsed: ParsedPushPayload) {
  return {
    productsFetched: parsed.rowsReceived,
    colorsMapped: parsed.rows.length,
    colorsUnmapped: parsed.errors.length,
    unmappedHandles: parsed.errors
      .map((e) => (e.index === null ? `payload: ${e.message}` : `row ${e.index}: ${e.message}`))
      .slice(0, 200),
  };
}

/** Record a dry-run validate in the sync history. Never writes pricing. */
export async function recordValidateRun(
  pressId: string,
  keyId: string | null,
  parsed: ParsedPushPayload,
): Promise<string> {
  const [row] = await db
    .insert(pressPricingSyncs)
    .values({
      pressId,
      source: ERP_PUSH_SOURCE,
      status: "validated",
      triggeredByUserId: null,
      finishedAt: new Date(),
      ...syncCounts(parsed),
      proposal: {
        source: ERP_PUSH_SOURCE,
        kind: "validate",
        keyId,
        payloadVersion: parsed.version,
        rows: parsed.rows,
        errors: parsed.errors,
        warnings: parsed.warnings,
      } as any,
    })
    .returning();
  return row.id;
}

/** Stage a real push as a PENDING sync run awaiting operator review. */
export async function stagePush(
  pressId: string,
  keyId: string | null,
  parsed: ParsedPushPayload,
): Promise<string> {
  const [row] = await db
    .insert(pressPricingSyncs)
    .values({
      pressId,
      source: ERP_PUSH_SOURCE,
      status: "pending",
      triggeredByUserId: null,
      ...syncCounts(parsed),
      proposal: {
        source: ERP_PUSH_SOURCE,
        kind: "push",
        keyId,
        payloadVersion: parsed.version,
        rows: parsed.rows,
        errors: parsed.errors,
        warnings: parsed.warnings,
      } as any,
    })
    .returning();
  return row.id;
}

/** Record a rejected submit (validation errors) so it shows in history. */
export async function recordRejectedPush(
  pressId: string,
  keyId: string | null,
  parsed: ParsedPushPayload,
): Promise<string> {
  const first = parsed.errors[0];
  const [row] = await db
    .insert(pressPricingSyncs)
    .values({
      pressId,
      source: ERP_PUSH_SOURCE,
      status: "error",
      triggeredByUserId: null,
      finishedAt: new Date(),
      ...syncCounts(parsed),
      error: first
        ? `Rejected: ${parsed.errors.length} validation error(s). First: ${first.message}`
        : "Rejected: validation failed.",
      proposal: {
        source: ERP_PUSH_SOURCE,
        kind: "push_rejected",
        keyId,
        payloadVersion: parsed.version,
        rows: parsed.rows,
        errors: parsed.errors,
        warnings: parsed.warnings,
      } as any,
    })
    .returning();
  return row.id;
}

// ─── Operator: pending pushes, preview, commit, discard ─────────────

export async function getPush(pressId: string, pushId: string) {
  const [row] = await db
    .select()
    .from(pressPricingSyncs)
    .where(
      and(
        eq(pressPricingSyncs.id, pushId),
        eq(pressPricingSyncs.pressId, pressId),
        eq(pressPricingSyncs.source, ERP_PUSH_SOURCE),
      ),
    );
  return row ?? null;
}

export async function listPendingPushes(pressId: string) {
  return db
    .select()
    .from(pressPricingSyncs)
    .where(
      and(
        eq(pressPricingSyncs.pressId, pressId),
        eq(pressPricingSyncs.source, ERP_PUSH_SOURCE),
        eq(pressPricingSyncs.status, "pending"),
      ),
    )
    .orderBy(desc(pressPricingSyncs.startedAt));
}

function pushRowsFromProposal(proposal: unknown): ParsedPushRow[] {
  const rows = (proposal as any)?.rows;
  return Array.isArray(rows) ? (rows as ParsedPushRow[]) : [];
}

/** Diff a staged push against the current ladders. NO writes. */
export async function buildPushPreview(pressId: string, pushId: string): Promise<PushProposal> {
  const push = await getPush(pressId, pushId);
  if (!push) throw Object.assign(new Error("Push not found."), { kind: "not_found" });
  if (push.status !== "pending") {
    throw Object.assign(new Error(`This push is ${push.status} — only pending pushes can be previewed.`), { kind: "state" });
  }
  const rows = pushRowsFromProposal(push.proposal);
  const { writes, tiersMissing } = await annotatePushRows(pressId, rows);
  const p = push.proposal as any;
  return {
    source: ERP_PUSH_SOURCE,
    receivedAt: push.startedAt?.toISOString?.() ?? new Date().toISOString(),
    payloadVersion: p?.payloadVersion ?? null,
    keyId: p?.keyId ?? null,
    rowsReceived: push.productsFetched,
    rows,
    writes,
    errors: Array.isArray(p?.errors) ? p.errors : [],
    warnings: Array.isArray(p?.warnings) ? p.warnings : [],
    tiersMissing,
  };
}

export type PushCommitResult = {
  syncId: string;
  rungsWritten: number;
  rungsSkipped: number;
  tiersMissing: string[];
};

/** Commit a staged push onto the press's default-jacket ladders. Locked
 *  rungs are skipped (mergeCodaLadder); the pending sync row flips to
 *  "ok" with counts, mirroring the Coda apply. */
export async function commitPush(
  pressId: string,
  userId: string | null,
  pushId: string,
): Promise<PushCommitResult> {
  const push = await getPush(pressId, pushId);
  if (!push) throw Object.assign(new Error("Push not found."), { kind: "not_found" });
  if (push.status !== "pending") {
    throw Object.assign(new Error(`This push is ${push.status} — only pending pushes can be committed.`), { kind: "state" });
  }
  const rows = pushRowsFromProposal(push.proposal);
  try {
    const { defaultJacket, tierByKey, ladderByCombo } = await loadCatalogContext(pressId);
    if (!defaultJacket) {
      throw new Error("Press has no default jacket — set one before committing pushed pricing.");
    }
    type Group = { tierId: string; rungs: { qty: number; unitCents: number }[] };
    const groups = new Map<string, Group>();
    const tiersMissing = new Set<string>();
    let rungsSkipped = 0;
    for (const w of rows) {
      const tier = tierByKey.get(`${w.format}|${w.tierName.trim().toLowerCase()}`);
      if (!tier) {
        tiersMissing.add(`${w.format}/${w.tierName}`);
        rungsSkipped++;
        continue;
      }
      const g = groups.get(tier.id) ?? { tierId: tier.id, rungs: [] };
      g.rungs.push({ qty: w.qty, unitCents: w.unitCents });
      groups.set(tier.id, g);
    }

    let rungsWritten = 0;
    const syncedAt = new Date().toISOString();
    for (const g of Array.from(groups.values())) {
      const existing = ladderByCombo.get(`${g.tierId}|${defaultJacket.id}`);
      const { merged, written, skippedLocked } = mergeCodaLadder(
        (existing?.priceLadder ?? []) as LadderRung[],
        g.rungs,
        syncedAt,
        ERP_PUSH_SOURCE,
      );
      rungsWritten += written;
      rungsSkipped += skippedLocked;
      if (existing) {
        await db
          .update(pressTierJacketLadders)
          .set({ priceLadder: merged as any })
          .where(eq(pressTierJacketLadders.id, existing.id));
      } else {
        await db.insert(pressTierJacketLadders).values({
          tierId: g.tierId,
          jacketId: defaultJacket.id,
          priceLadder: merged as any,
        });
      }
    }

    await db
      .update(pressPricingSyncs)
      .set({ status: "ok", finishedAt: new Date(), rungsWritten, triggeredByUserId: userId })
      .where(eq(pressPricingSyncs.id, push.id));

    return {
      syncId: push.id,
      rungsWritten,
      rungsSkipped,
      tiersMissing: Array.from(tiersMissing).sort(),
    };
  } catch (err: any) {
    await db
      .update(pressPricingSyncs)
      .set({ status: "error", finishedAt: new Date(), error: err?.message || String(err) })
      .where(eq(pressPricingSyncs.id, push.id));
    throw err;
  }
}

export async function discardPush(pressId: string, userId: string | null, pushId: string) {
  const push = await getPush(pressId, pushId);
  if (!push) throw Object.assign(new Error("Push not found."), { kind: "not_found" });
  if (push.status !== "pending") {
    throw Object.assign(new Error(`This push is ${push.status} — only pending pushes can be discarded.`), { kind: "state" });
  }
  await db
    .update(pressPricingSyncs)
    .set({ status: "discarded", finishedAt: new Date(), triggeredByUserId: userId })
    .where(eq(pressPricingSyncs.id, push.id));
}

// ─── Freshness (for the manufacturer page) ───────────────────────────

/** When pricing was last RECEIVED via a real push (pending or later —
 *  validates don't count), plus the pending-review count. */
export async function getPushStatusSummary(pressId: string): Promise<{
  lastReceivedAt: string | null;
  pendingCount: number;
}> {
  const [agg] = await db
    .select({
      lastReceivedAt: sql<string | null>`MAX(${pressPricingSyncs.startedAt}) FILTER (WHERE ${pressPricingSyncs.status} IN ('pending','ok','discarded'))`,
      pendingCount: sql<number>`COUNT(*) FILTER (WHERE ${pressPricingSyncs.status} = 'pending')`,
    })
    .from(pressPricingSyncs)
    .where(
      and(eq(pressPricingSyncs.pressId, pressId), eq(pressPricingSyncs.source, ERP_PUSH_SOURCE)),
    );
  return {
    lastReceivedAt: agg?.lastReceivedAt ? new Date(agg.lastReceivedAt).toISOString() : null,
    pendingCount: Number(agg?.pendingCount ?? 0),
  };
}
