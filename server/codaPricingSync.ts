// Task #3310 — Coda.io (Superhuman Docs) press pricing sync.
//
// MRP keeps their pricing in a Coda doc. This module lets an operator link
// a press's Coda doc/table (via an API token the press supplies), preview
// the pricing it contains mapped against our catalog, and commit it onto
// the press's `press_tier_jacket_ladders` — the same preview→commit model
// as the Hellbender Shopify sync (server/hellbenderPricingSync.ts), and
// the same sync-history table (`press_pricing_syncs`, source "coda").
//
// Because we can't assume the sheet's shape, the operator maps Coda
// columns onto our concepts (tier/color identifier, quantity, price,
// optional format column) — see CodaColumnMapping in shared/schema.ts.
//
// v1 scope: record/jacket quantity ladders written onto the press's
// default-jacket combos only, operator-triggered preview/commit only.
// Operator-locked rungs (`lockedFromSync`) survive re-sync exactly like
// the Hellbender sync. Token problems (revoked, wrong doc, no access,
// rate limit) are classified into honest CodaApiError kinds so the
// connection panel can show a clear message — never a silent empty sync.

import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "./db";
import {
  pressCodaConnections,
  pressColorTiers,
  pressJackets,
  pressTierJacketLadders,
  pressPricingSyncs,
  type AlbumFormat,
  type CodaColumnMapping,
  type PressCodaConnection,
} from "@shared/schema";
import { encryptSecret, decryptSecret } from "./auth/crypto";

export const CODA_PRICING_SOURCE = "coda";
const CODA_API_BASE = "https://coda.io/apis/v1";
// Hard row cap so a mis-picked huge table can't wedge the request.
const MAX_ROWS = 10_000;

// ─── Connection storage ──────────────────────────────────────────────

export async function getCodaConnection(pressId: string): Promise<PressCodaConnection | null> {
  const [row] = await db
    .select()
    .from(pressCodaConnections)
    .where(eq(pressCodaConnections.pressId, pressId));
  return row ?? null;
}

/** Public (browser-safe) projection — NEVER includes the token. */
export function toPublicCodaConnection(row: PressCodaConnection | null) {
  if (!row) return { configured: false as const };
  return {
    configured: true as const,
    docId: row.docId,
    docName: row.docName,
    tableId: row.tableId,
    tableName: row.tableName,
    columnMapping: row.columnMapping ?? null,
    lastTestedAt: row.lastTestedAt,
    lastError: row.lastError,
    updatedAt: row.updatedAt,
  };
}

export async function saveCodaConnection(args: {
  pressId: string;
  apiToken?: string | null; // omitted = keep the stored token
  docId?: string;
  tableId?: string | null;
  tableName?: string | null;
  columnMapping?: CodaColumnMapping | null;
  userId: string | null;
}): Promise<PressCodaConnection> {
  const existing = await getCodaConnection(args.pressId);
  if (!existing) {
    if (!args.apiToken || !args.docId) {
      throw new Error("An API token and doc ID are required to create a Coda connection.");
    }
    const [row] = await db
      .insert(pressCodaConnections)
      .values({
        pressId: args.pressId,
        apiTokenEncrypted: encryptSecret(args.apiToken.trim()),
        docId: args.docId.trim(),
        tableId: args.tableId ?? null,
        tableName: args.tableName ?? null,
        columnMapping: args.columnMapping ?? null,
        createdByUserId: args.userId,
      })
      .returning();
    return row;
  }
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (args.apiToken) patch.apiTokenEncrypted = encryptSecret(args.apiToken.trim());
  if (args.docId !== undefined) patch.docId = args.docId.trim();
  if (args.tableId !== undefined) patch.tableId = args.tableId;
  if (args.tableName !== undefined) patch.tableName = args.tableName;
  if (args.columnMapping !== undefined) patch.columnMapping = args.columnMapping;
  const [row] = await db
    .update(pressCodaConnections)
    .set(patch as any)
    .where(eq(pressCodaConnections.id, existing.id))
    .returning();
  return row;
}

export async function deleteCodaConnection(pressId: string): Promise<void> {
  await db.delete(pressCodaConnections).where(eq(pressCodaConnections.pressId, pressId));
}

// ─── Coda API client (server-side only; token never reaches the browser) ─

export type CodaErrorKind = "auth" | "forbidden" | "not_found" | "rate_limit" | "api";

export class CodaApiError extends Error {
  kind: CodaErrorKind;
  status: number;
  constructor(kind: CodaErrorKind, status: number, message: string) {
    super(message);
    this.kind = kind;
    this.status = status;
  }
}

export function classifyCodaStatus(status: number): CodaErrorKind {
  if (status === 401) return "auth";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limit";
  return "api";
}

export function codaErrorMessage(kind: CodaErrorKind): string {
  switch (kind) {
    case "auth":
      return "Coda rejected the API token — it may have been revoked. Ask the press for a fresh token.";
    case "forbidden":
      return "The token is valid but doesn't have access to this doc. Ask the press to share the doc with the token's account.";
    case "not_found":
      return "Coda couldn't find that doc or table — double-check the doc ID and table selection.";
    case "rate_limit":
      return "Coda is rate-limiting us — wait a minute and try again.";
    default:
      return "Coda's API returned an unexpected error.";
  }
}

async function codaFetch(token: string, path: string): Promise<any> {
  const r = await fetch(`${CODA_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) {
    const kind = classifyCodaStatus(r.status);
    let detail = "";
    try {
      const body = await r.json();
      detail = body?.message ? ` (${body.message})` : "";
    } catch {
      /* non-JSON error body */
    }
    throw new CodaApiError(kind, r.status, `${codaErrorMessage(kind)}${detail}`);
  }
  return r.json();
}

export type CodaTable = { id: string; name: string; rowCount?: number };
export type CodaColumn = { id: string; name: string };

export async function getCodaDoc(token: string, docId: string): Promise<{ id: string; name: string }> {
  const d = await codaFetch(token, `/docs/${encodeURIComponent(docId)}`);
  return { id: d.id, name: d.name };
}

export async function listCodaTables(token: string, docId: string): Promise<CodaTable[]> {
  const out: CodaTable[] = [];
  let pageToken: string | null = null;
  do {
    const qs = pageToken ? `?pageToken=${encodeURIComponent(pageToken)}` : "?limit=100";
    const page = await codaFetch(token, `/docs/${encodeURIComponent(docId)}/tables${qs}`);
    for (const t of page.items ?? []) out.push({ id: t.id, name: t.name, rowCount: t.rowCount });
    pageToken = page.nextPageToken ?? null;
  } while (pageToken);
  return out;
}

export async function listCodaColumns(
  token: string,
  docId: string,
  tableId: string,
): Promise<CodaColumn[]> {
  const out: CodaColumn[] = [];
  let pageToken: string | null = null;
  do {
    const qs = pageToken ? `?pageToken=${encodeURIComponent(pageToken)}` : "?limit=100";
    const page = await codaFetch(
      token,
      `/docs/${encodeURIComponent(docId)}/tables/${encodeURIComponent(tableId)}/columns${qs}`,
    );
    for (const c of page.items ?? []) out.push({ id: c.id, name: c.name });
    pageToken = page.nextPageToken ?? null;
  } while (pageToken);
  return out;
}

export type CodaRow = { id: string; name?: string; values: Record<string, unknown> };

export async function listCodaRows(
  token: string,
  docId: string,
  tableId: string,
): Promise<CodaRow[]> {
  const out: CodaRow[] = [];
  let pageToken: string | null = null;
  do {
    // valueFormat=simple returns scalar-ish values (numbers stay numbers,
    // currency comes back as a number of dollars) keyed by COLUMN ID.
    const qs = pageToken
      ? `?pageToken=${encodeURIComponent(pageToken)}`
      : "?limit=200&valueFormat=simple&useColumnNames=false";
    const page = await codaFetch(
      token,
      `/docs/${encodeURIComponent(docId)}/tables/${encodeURIComponent(tableId)}/rows${qs}`,
    );
    for (const r of page.items ?? []) out.push({ id: r.id, name: r.name, values: r.values ?? {} });
    if (out.length >= MAX_ROWS) break;
    pageToken = page.nextPageToken ?? null;
  } while (pageToken);
  return out;
}

// ─── Pure row → rung transform (unit-tested; no network) ────────────

/** Parse a Coda cell into integer cents. Accepts numbers (dollars) and
 *  strings like "$2.35", "2.35", "2,350.00". Null = unparseable/absent. */
export function parseCodaPriceCents(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return Math.round(v * 100);
  if (typeof v === "string") {
    const cleaned = v.replace(/[$,\s]/g, "");
    if (!cleaned) return null;
    const n = Number(cleaned);
    if (Number.isFinite(n) && n > 0) return Math.round(n * 100);
  }
  return null;
}

/** Parse a Coda cell into a positive integer quantity. */
export function parseCodaQty(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v) && v >= 1) return Math.round(v);
  if (typeof v === "string") {
    const m = v.replace(/[,\s]/g, "").match(/^(\d+)/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n >= 1) return n;
    }
  }
  return null;
}

/** Best-effort format-cell parse. Recognizes 12"/LP, 2LP/double, 10", 7". */
export function parseCodaFormat(v: unknown): AlbumFormat | null {
  if (typeof v !== "string") return null;
  const k = v.toLowerCase().replace(/[”"']/g, '"').trim();
  if (!k) return null;
  if (/2\s*lp|2\s*x\s*lp|double/.test(k)) return "12_double" as AlbumFormat;
  if (/12|(^|\W)lp(\W|$)/.test(k)) return "12_lp" as AlbumFormat;
  if (/cassette|tape/.test(k)) return "cassette" as AlbumFormat;
  if (/(^|\W)cd(\W|$)/.test(k)) return "cd" as AlbumFormat;
  if (/7/.test(k)) return "7_inch" as AlbumFormat;
  return null;
}

export type CodaWrite = {
  format: AlbumFormat;
  tierName: string; // raw tier identifier from the sheet (matched case-insensitively later)
  qty: number;
  unitCents: number;
};
export type CodaUnmatchedRow = { rowId: string; rowName: string | null; reason: string };

export function transformCodaRows(
  rows: CodaRow[],
  mapping: CodaColumnMapping,
): { writes: CodaWrite[]; unmatched: CodaUnmatchedRow[] } {
  const writes: CodaWrite[] = [];
  const unmatched: CodaUnmatchedRow[] = [];
  const push = (r: CodaRow, reason: string) =>
    unmatched.push({ rowId: r.id, rowName: r.name ?? null, reason });
  // Collapse duplicate (format, tier, qty) rows — keep the median so an
  // accidental dup row can't randomly flip the price (mirrors Hellbender).
  const bucket = new Map<string, number[]>();
  const meta = new Map<string, { format: AlbumFormat; tierName: string; qty: number }>();
  for (const r of rows) {
    const tierRaw = r.values[mapping.tierColumnId];
    const tierName = typeof tierRaw === "string" ? tierRaw.trim() : tierRaw != null ? String(tierRaw).trim() : "";
    if (!tierName) {
      push(r, "Empty tier/color cell.");
      continue;
    }
    const qty = parseCodaQty(r.values[mapping.qtyColumnId]);
    if (!qty) {
      push(r, `"${tierName}": quantity cell isn't a positive number.`);
      continue;
    }
    const priceCents = parseCodaPriceCents(r.values[mapping.priceColumnId]);
    if (!priceCents) {
      push(r, `"${tierName}" @ ${qty}: price cell isn't a positive amount.`);
      continue;
    }
    const unitCents =
      mapping.priceKind === "total" ? Math.round(priceCents / qty) : priceCents;
    if (unitCents < 1) {
      push(r, `"${tierName}" @ ${qty}: computed unit price rounds to zero.`);
      continue;
    }
    let format: AlbumFormat | null = null;
    if (mapping.formatColumnId) {
      format = parseCodaFormat(r.values[mapping.formatColumnId]);
      if (!format) {
        push(r, `"${tierName}" @ ${qty}: unrecognized format cell.`);
        continue;
      }
    } else if (mapping.defaultFormat) {
      format = mapping.defaultFormat as AlbumFormat;
    }
    if (!format) {
      push(r, `"${tierName}" @ ${qty}: no format column mapped and no default format set.`);
      continue;
    }
    const key = `${format}|${tierName.toLowerCase()}|${qty}`;
    const arr = bucket.get(key) ?? [];
    arr.push(unitCents);
    bucket.set(key, arr);
    if (!meta.has(key)) meta.set(key, { format, tierName, qty });
  }
  for (const [key, values] of Array.from(bucket.entries())) {
    const m = meta.get(key)!;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    const unitCents =
      sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
    writes.push({ ...m, unitCents });
  }
  writes.sort(
    (a, b) =>
      a.format.localeCompare(b.format) || a.tierName.localeCompare(b.tierName) || a.qty - b.qty,
  );
  return { writes, unmatched };
}

// ─── Ladder merge (pure; lock-preservation lives here) ──────────────

export type LadderRung = {
  qty: number;
  unitCents: number;
  confirmed?: boolean;
  source?: string;
  syncedAt?: string;
  lockedFromSync?: boolean;
  [k: string]: unknown;
};

/** Merge synced rungs into an existing ladder. Operator-locked rungs
 *  (`lockedFromSync`) are NEVER overwritten — identical to the
 *  Hellbender sync's behavior. Returns the merged ladder + counts.
 *  `source` defaults to "coda"; the ERP push sync (Task #3379) reuses
 *  this merge with its own provenance stamp. */
export function mergeCodaLadder(
  existing: LadderRung[] | null | undefined,
  rungs: { qty: number; unitCents: number }[],
  syncedAt: string,
  source: string = CODA_PRICING_SOURCE,
): { merged: LadderRung[]; written: number; skippedLocked: number } {
  const byQty = new Map<number, LadderRung>();
  for (const r of Array.isArray(existing) ? existing : []) byQty.set(Number(r.qty), { ...r });
  let written = 0;
  let skippedLocked = 0;
  for (const r of rungs) {
    if (byQty.get(r.qty)?.lockedFromSync) {
      skippedLocked++;
      continue;
    }
    byQty.set(r.qty, {
      qty: r.qty,
      unitCents: r.unitCents,
      confirmed: true,
      source,
      syncedAt,
    });
    written++;
  }
  const merged = Array.from(byQty.values()).sort((a, b) => Number(a.qty) - Number(b.qty));
  return { merged, written, skippedLocked };
}

// ─── Preview (diff, no writes) + commit ─────────────────────────────

export type CodaProposalWrite = CodaWrite & {
  change: "new" | "updated" | "unchanged" | "locked" | "tier_missing";
  oldUnitCents: number | null;
  matchedTierName: string | null; // the catalog tier's canonical name
};
export type CodaProposal = {
  source: typeof CODA_PRICING_SOURCE;
  fetchedAt: string;
  docId: string;
  tableId: string;
  rowsFetched: number;
  writes: CodaProposalWrite[];
  unmatched: CodaUnmatchedRow[];
  tiersMissing: string[]; // "format/TierName" identifiers with no catalog tier
};

function requireReadyConnection(conn: PressCodaConnection | null): asserts conn is PressCodaConnection & {
  tableId: string;
  columnMapping: CodaColumnMapping;
} {
  const configError = (msg: string) => Object.assign(new Error(msg), { kind: "config" });
  if (!conn) throw configError("No Coda connection is configured for this press.");
  if (!conn.tableId) throw configError("Pick the pricing table before syncing.");
  const m = conn.columnMapping;
  if (!m?.tierColumnId || !m?.qtyColumnId || !m?.priceColumnId) {
    throw configError("Map the tier, quantity, and price columns before syncing.");
  }
  if (!m.formatColumnId && !m.defaultFormat) {
    throw configError("Map a format column or pick a default format before syncing.");
  }
}

/** Load this press's catalog context for the diff: active tiers keyed by
 *  (format, lowercased name) + the default jacket + existing ladders.
 *  Exported for the ERP push sync (Task #3379), which diffs the same
 *  default-jacket ladders. */
export async function loadCatalogContext(pressId: string) {
  const [defaultJacket] = await db
    .select()
    .from(pressJackets)
    .where(and(eq(pressJackets.pressId, pressId), eq(pressJackets.isDefault, true)));
  const tiers = await db
    .select()
    .from(pressColorTiers)
    .where(and(eq(pressColorTiers.pressId, pressId), isNull(pressColorTiers.archivedAt)));
  const tierByKey = new Map<string, (typeof tiers)[number]>();
  for (const t of tiers) tierByKey.set(`${t.format}|${t.name.trim().toLowerCase()}`, t);
  const ladderRows = tiers.length
    ? await db
        .select()
        .from(pressTierJacketLadders)
        .where(inArray(pressTierJacketLadders.tierId, tiers.map((t) => t.id)))
    : [];
  const ladderByCombo = new Map<string, (typeof ladderRows)[number]>();
  for (const r of ladderRows) ladderByCombo.set(`${r.tierId}|${r.jacketId}`, r);
  return { defaultJacket: defaultJacket ?? null, tierByKey, ladderByCombo };
}

export async function buildCodaPricingProposal(pressId: string): Promise<CodaProposal> {
  const conn = await getCodaConnection(pressId);
  requireReadyConnection(conn);
  const token = decryptSecret(conn.apiTokenEncrypted);
  const rows = await listCodaRows(token, conn.docId, conn.tableId);
  const { writes, unmatched } = transformCodaRows(rows, conn.columnMapping);

  const { defaultJacket, tierByKey, ladderByCombo } = await loadCatalogContext(pressId);
  const tiersMissingSet = new Set<string>();
  const annotated: CodaProposalWrite[] = writes.map((w) => {
    const tier = tierByKey.get(`${w.format}|${w.tierName.trim().toLowerCase()}`);
    if (!tier) {
      tiersMissingSet.add(`${w.format}/${w.tierName}`);
      return { ...w, change: "tier_missing", oldUnitCents: null, matchedTierName: null };
    }
    const existing = defaultJacket
      ? ((ladderByCombo.get(`${tier.id}|${defaultJacket.id}`)?.priceLadder ?? []) as LadderRung[])
      : [];
    const rung = existing.find((r) => Number(r.qty) === w.qty);
    if (!rung) return { ...w, change: "new", oldUnitCents: null, matchedTierName: tier.name };
    if (rung.lockedFromSync) {
      return { ...w, change: "locked", oldUnitCents: rung.unitCents, matchedTierName: tier.name };
    }
    return {
      ...w,
      change: rung.unitCents === w.unitCents ? "unchanged" : "updated",
      oldUnitCents: rung.unitCents,
      matchedTierName: tier.name,
    };
  });

  return {
    source: CODA_PRICING_SOURCE,
    fetchedAt: new Date().toISOString(),
    docId: conn.docId,
    tableId: conn.tableId,
    rowsFetched: rows.length,
    writes: annotated,
    unmatched,
    tiersMissing: Array.from(tiersMissingSet).sort(),
  };
}

export type CodaApplyResult = {
  syncId: string;
  rungsWritten: number;
  rungsSkipped: number;
  tiersMissing: string[];
};

/** Apply a proposal onto the press's default-jacket combos, recording a
 *  run in `press_pricing_syncs` with source "coda". Mirrors the
 *  Hellbender apply: locked rungs skipped, idempotent re-runs. */
export async function applyCodaPricingProposal(
  pressId: string,
  triggeredByUserId: string | null,
  proposal: CodaProposal,
): Promise<CodaApplyResult> {
  const matchedTierKeys = new Set(
    proposal.writes
      .filter((w) => w.change !== "tier_missing")
      .map((w) => `${w.format}|${w.tierName.toLowerCase()}`),
  );
  const [syncRow] = await db
    .insert(pressPricingSyncs)
    .values({
      pressId,
      source: CODA_PRICING_SOURCE,
      status: "running",
      triggeredByUserId,
      productsFetched: proposal.rowsFetched,
      colorsMapped: matchedTierKeys.size,
      colorsUnmapped: proposal.unmatched.length,
      unmappedHandles: proposal.unmatched.map((u) => u.rowName || u.rowId).slice(0, 200),
      proposal: proposal as any,
    })
    .returning();

  try {
    const { defaultJacket, tierByKey, ladderByCombo } = await loadCatalogContext(pressId);
    if (!defaultJacket) {
      throw new Error("Press has no default jacket — set one before syncing pricing.");
    }
    // Group writes by matched tier so we update each ladder once.
    type Group = { tierId: string; rungs: { qty: number; unitCents: number }[] };
    const groups = new Map<string, Group>();
    const tiersMissing = new Set<string>(proposal.tiersMissing);
    let rungsSkipped = 0;
    for (const w of proposal.writes) {
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
      .set({ status: "ok", finishedAt: new Date(), rungsWritten })
      .where(eq(pressPricingSyncs.id, syncRow.id));

    return {
      syncId: syncRow.id,
      rungsWritten,
      rungsSkipped,
      tiersMissing: Array.from(tiersMissing).sort(),
    };
  } catch (err: any) {
    await db
      .update(pressPricingSyncs)
      .set({ status: "error", finishedAt: new Date(), error: err?.message || String(err) })
      .where(eq(pressPricingSyncs.id, syncRow.id));
    throw err;
  }
}
