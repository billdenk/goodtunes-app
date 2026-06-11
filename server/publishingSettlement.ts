// Publishing mechanical-royalty settlement engine.
//
// Computes who is owed what for a pressing run, from track_publishing_splits,
// on the basis Bill confirmed for Nick Carter's catalog:
//
//     owed = statutoryRate × unitsPressed × (publisher share)
//
// where statutoryRate defaults to $0.127/unit (the U.S. Section-115
// physical/DPD rate honored in the signed Hipgnosis license #24084) and the
// publisher share is `percentBp / 10000`. This is the MECHANICAL settlement —
// it is driven by units PRESSED, not units sold, and is a separate ledger
// from the order-royalty (sales) payout in server/payouts.ts.
//
// Routing: a publishing split credits a publisher org (organizationId) or a
// self-published designee person (personId). When the publisher org carries a
// `payToOrgId` (e.g. "Songs of Kaotic" → "Hipgnosis Songs Group, LLC"), the
// composition is still CREDITED to the publisher but the money is ROUTED to
// the administrator's payout account.
//
// Guardrail ("never sloppy again"): the engine reports every song whose
// publisher shares don't sum to 100% so the operator can see under/over
// allocation before paying a cent.

import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "./db";
import {
  organizations,
  payoutAccounts,
  payoutSettings,
  people,
  songs,
  trackPublishingSplits,
} from "@shared/schema";

export const DEFAULT_MECHANICAL_RATE_MICROS = 127_000; // $0.127 / unit
const MICROS_PER_DOLLAR = 1_000_000;

export interface SettlementPayee {
  /** Stable key for this payee within a settlement (org:/person:/name:). */
  payeeKey: string;
  ownerKind: "organization" | "person" | null;
  /** The payout-account owner — the pay-to org when administered, else self. */
  ownerId: string | null;
  /** Publisher / designee name shown on the credit. */
  displayName: string;
  /** Administrator the money routes to, when different from displayName. */
  payToName: string | null;
  amountCents: number;
  /**
   * Raw accumulated micro-dollars BEFORE rounding to cents. Exposed so a
   * catalog-wide roll-up can sum a payee's micros across every album and
   * round ONCE (the real payment basis — each payee is cut a single check),
   * instead of summing per-album rounded cents and letting penny drift
   * compound. Within a single album, amountCents = round(amountMicros).
   */
  amountMicros: number;
  /** Number of per-song split lines rolled into this payee. */
  lineCount: number;
  /** Onboarding status of the resolved payout target. */
  hasPayoutAccount: boolean;
  payoutsEnabled: boolean;
}

export interface SettlementAllocationIssue {
  songId: string;
  title: string;
  totalBp: number; // sum of publisher-share basis points (should be 10000)
}

export interface AlbumSettlement {
  albumId: string;
  unitsPressed: number;
  rateMicros: number;
  totalCents: number;
  payees: SettlementPayee[];
  /** Songs whose publisher shares don't sum to 100% (data-quality flag). */
  allocationIssues: SettlementAllocationIssue[];
  /** Songs that have zero non-deleted publishing splits at all. */
  songsMissingSplits: { songId: string; title: string }[];
}

function uniq<T>(xs: (T | null | undefined)[]): T[] {
  return Array.from(new Set(xs.filter((x): x is T => x != null)));
}

export async function getMechanicalRateMicros(): Promise<number> {
  const [row] = await db
    .select({ rate: payoutSettings.mechanicalRateMicros })
    .from(payoutSettings)
    .where(eq(payoutSettings.id, "default"))
    .limit(1);
  return row?.rate ?? DEFAULT_MECHANICAL_RATE_MICROS;
}

/**
 * Compute the mechanical settlement for one album's pressing run.
 *
 * @param albumId       the album being settled
 * @param unitsPressed  number of physical units pressed in this run
 * @param rateMicros    override the statutory rate (defaults to payout_settings)
 */
export async function computeAlbumPublishingSettlement(
  albumId: string,
  opts: { unitsPressed: number; rateMicros?: number },
): Promise<AlbumSettlement> {
  const units = Math.max(0, Math.trunc(opts.unitsPressed));
  const rateMicros = opts.rateMicros ?? (await getMechanicalRateMicros());

  const albumSongs = await db
    .select({ id: songs.id, title: songs.title })
    .from(songs)
    .where(eq(songs.albumId, albumId));

  const empty: AlbumSettlement = {
    albumId,
    unitsPressed: units,
    rateMicros,
    totalCents: 0,
    payees: [],
    allocationIssues: [],
    songsMissingSplits: [],
  };
  if (albumSongs.length === 0) return empty;

  const songIds = albumSongs.map((s) => s.id);
  const titleById = new Map(albumSongs.map((s) => [s.id, s.title]));

  const splits = await db
    .select()
    .from(trackPublishingSplits)
    .where(
      and(
        inArray(trackPublishingSplits.songId, songIds),
        isNull(trackPublishingSplits.deletedAt),
      ),
    );

  // Resolve referenced orgs (and their pay-to administrators).
  const directOrgIds = uniq(splits.map((s) => s.organizationId));
  const directOrgs = directOrgIds.length
    ? await db.select().from(organizations).where(inArray(organizations.id, directOrgIds))
    : [];
  const orgById = new Map(directOrgs.map((o) => [o.id, o]));
  const payToIds = uniq(directOrgs.map((o) => o.payToOrgId));
  const payToOrgs = payToIds.length
    ? await db.select().from(organizations).where(inArray(organizations.id, payToIds))
    : [];
  for (const o of payToOrgs) orgById.set(o.id, o);

  // ── Per-song allocation guardrail ──────────────────────────────────────
  const bpBySong = new Map<string, number>();
  const songsWithSplits = new Set<string>();
  for (const sp of splits) {
    songsWithSplits.add(sp.songId);
    bpBySong.set(sp.songId, (bpBySong.get(sp.songId) ?? 0) + (sp.percentBp ?? 0));
  }
  const allocationIssues: SettlementAllocationIssue[] = [];
  for (const [songId, totalBp] of Array.from(bpBySong)) {
    if (totalBp !== 10000) {
      allocationIssues.push({ songId, title: titleById.get(songId) ?? songId, totalBp });
    }
  }
  const songsMissingSplits = albumSongs
    .filter((s) => !songsWithSplits.has(s.id))
    .map((s) => ({ songId: s.id, title: s.title }));

  // ── Per-payee aggregation ──────────────────────────────────────────────
  // Accumulate the raw micro-dollars per payee and round to cents ONCE, at
  // finalization. Rounding each split line before summing would let penny
  // drift compound when a payee carries several lines (e.g. Songs of Kaotic
  // across the whole catalog) — exactly the "sloppy" error this system
  // exists to eliminate. One round per payee is the correct settlement basis.
  const byPayee = new Map<string, SettlementPayee>();
  const microsByPayee = new Map<string, number>();
  for (const sp of splits) {
    const bp = sp.percentBp ?? 0;
    if (bp <= 0) continue;
    const owedMicros = rateMicros * units * (bp / 10000);

    let ownerKind: "organization" | "person" | null = null;
    let ownerId: string | null = null;
    let displayName = sp.name;
    let payToName: string | null = null;

    if (sp.organizationId) {
      const org = orgById.get(sp.organizationId);
      displayName = org?.name ?? sp.name;
      ownerKind = "organization";
      if (org?.payToOrgId) {
        const payTo = orgById.get(org.payToOrgId);
        payToName = payTo?.name ?? null;
        ownerId = org.payToOrgId;
      } else {
        ownerId = sp.organizationId;
      }
    } else if (sp.personId) {
      ownerKind = "person";
      ownerId = sp.personId;
    }

    const key = ownerId ? `${ownerKind}:${ownerId}` : `name:${displayName.toLowerCase()}`;
    let p = byPayee.get(key);
    if (!p) {
      p = {
        payeeKey: key,
        ownerKind,
        ownerId,
        displayName,
        payToName,
        amountCents: 0,
        amountMicros: 0,
        lineCount: 0,
        hasPayoutAccount: false,
        payoutsEnabled: false,
      };
      byPayee.set(key, p);
    }
    microsByPayee.set(key, (microsByPayee.get(key) ?? 0) + owedMicros);
    p.lineCount += 1;
  }
  // Round each payee's accumulated micros to cents exactly once, and keep the
  // raw micros so a catalog roll-up can re-aggregate across albums.
  for (const [key, micros] of Array.from(microsByPayee)) {
    const p = byPayee.get(key);
    if (p) {
      p.amountMicros = micros;
      p.amountCents = Math.round(micros / (MICROS_PER_DOLLAR / 100));
    }
  }

  // ── Onboarding status for each resolved payout target ───────────────────
  const orgOwnerIds = uniq(
    Array.from(byPayee.values()).filter((p) => p.ownerKind === "organization").map((p) => p.ownerId),
  );
  const personOwnerIds = uniq(
    Array.from(byPayee.values()).filter((p) => p.ownerKind === "person").map((p) => p.ownerId),
  );
  const accounts = [
    ...(orgOwnerIds.length
      ? await db
          .select()
          .from(payoutAccounts)
          .where(
            and(
              eq(payoutAccounts.ownerKind, "organization"),
              inArray(payoutAccounts.ownerId, orgOwnerIds),
            ),
          )
      : []),
    ...(personOwnerIds.length
      ? await db
          .select()
          .from(payoutAccounts)
          .where(
            and(
              eq(payoutAccounts.ownerKind, "person"),
              inArray(payoutAccounts.ownerId, personOwnerIds),
            ),
          )
      : []),
  ];
  const acctByOwner = new Map(accounts.map((a) => [`${a.ownerKind}:${a.ownerId}`, a]));
  for (const p of Array.from(byPayee.values())) {
    if (!p.ownerId || !p.ownerKind) continue;
    const acct = acctByOwner.get(`${p.ownerKind}:${p.ownerId}`);
    if (acct) {
      p.hasPayoutAccount = true;
      p.payoutsEnabled = !!acct.payoutsEnabled;
    }
  }

  const payees = Array.from(byPayee.values()).sort((a, b) => b.amountCents - a.amountCents);
  const totalCents = payees.reduce((s, p) => s + p.amountCents, 0);

  return { albumId, unitsPressed: units, rateMicros, totalCents, payees, allocationIssues, songsMissingSplits };
}

// ── Payee statement — cross-catalog detail for one payee ─────────────────────

export interface PayeeStatementLine {
  /** Unique split-row id — safe to use as a React key even if one song has
   *  multiple splits routing to the same payee. */
  lineId: string;
  songId: string;
  songTitle: string;
  splitBp: number;
  owedMicros: number;
}

export interface PayeeStatementAlbum {
  albumId: string;
  title: string;
  artist: string | null;
  artwork: string | null;
  unitsPressed: number;
  /** Sum of this payee's micros for just this album — for display sub-totals. */
  albumMicros: number;
  lines: PayeeStatementLine[];
}

export interface PayeeStatement {
  payeeKey: string;
  displayName: string;
  payToName: string | null;
  ownerKind: "organization" | "person" | null;
  ownerId: string | null;
  hasPayoutAccount: boolean;
  payoutsEnabled: boolean;
  rateMicros: number;
  /** Raw accumulated micro-dollars across the whole catalog. */
  totalMicros: number;
  /** Catalog total rounded ONCE — the authoritative payment amount. */
  totalCents: number;
  lineCount: number;
  albums: PayeeStatementAlbum[];
}

/**
 * Walk every album in `albumEntries` and return the full per-track
 * statement for the single payee identified by `payeeKey`.
 *
 * Returns null when no split lines match the key (payee not found).
 *
 * The "accumulate micros, round once" rule is preserved at the catalog
 * level: `totalCents` is `Math.round(totalMicros / MICROS_PER_DOLLAR * 100)`
 * rather than the sum of per-album rounded figures.
 */
export async function computePayeeStatement(
  payeeKey: string,
  albumEntries: {
    albumId: string;
    unitsPressed: number;
    title: string;
    artist: string | null;
    artwork: string | null;
  }[],
  rateMicrosOverride?: number,
): Promise<PayeeStatement | null> {
  if (albumEntries.length === 0) return null;

  const rateMicros = rateMicrosOverride ?? (await getMechanicalRateMicros());
  const allAlbumIds = albumEntries.map((e) => e.albumId);

  // Load all songs for these albums in one query.
  const allSongs = await db
    .select({ id: songs.id, title: songs.title, albumId: songs.albumId })
    .from(songs)
    .where(inArray(songs.albumId, allAlbumIds));

  if (allSongs.length === 0) return null;

  const songIds = allSongs.map((s) => s.id);
  const songById = new Map(allSongs.map((s) => [s.id, s]));

  // Load all non-deleted splits for these songs.
  const splits = await db
    .select()
    .from(trackPublishingSplits)
    .where(
      and(
        inArray(trackPublishingSplits.songId, songIds),
        isNull(trackPublishingSplits.deletedAt),
      ),
    );

  if (splits.length === 0) return null;

  // Resolve orgs (direct + pay-to admins) so we can derive the same key
  // the per-album engine uses.
  const directOrgIds = uniq(splits.map((s) => s.organizationId));
  const directOrgs = directOrgIds.length
    ? await db.select().from(organizations).where(inArray(organizations.id, directOrgIds))
    : [];
  const orgById = new Map(directOrgs.map((o) => [o.id, o]));
  const payToIds = uniq(directOrgs.map((o) => o.payToOrgId));
  const payToOrgs = payToIds.length
    ? await db.select().from(organizations).where(inArray(organizations.id, payToIds))
    : [];
  for (const o of payToOrgs) orgById.set(o.id, o);

  // Walk every split and collect lines for the requested payee.
  let displayName = "";
  let payToName: string | null = null;
  let ownerKind: "organization" | "person" | null = null;
  let ownerId: string | null = null;
  let foundPayee = false;

  // album → lines for the payee.
  const linesByAlbum = new Map<string, PayeeStatementLine[]>();

  for (const sp of splits) {
    const bp = sp.percentBp ?? 0;
    if (bp <= 0) continue;

    let spOwnerKind: "organization" | "person" | null = null;
    let spOwnerId: string | null = null;
    let spDisplayName = sp.name;
    let spPayToName: string | null = null;

    if (sp.organizationId) {
      const org = orgById.get(sp.organizationId);
      spDisplayName = org?.name ?? sp.name;
      spOwnerKind = "organization";
      if (org?.payToOrgId) {
        const payTo = orgById.get(org.payToOrgId);
        spPayToName = payTo?.name ?? null;
        spOwnerId = org.payToOrgId;
      } else {
        spOwnerId = sp.organizationId;
      }
    } else if (sp.personId) {
      spOwnerKind = "person";
      spOwnerId = sp.personId;
    }

    const key = spOwnerId
      ? `${spOwnerKind}:${spOwnerId}`
      : `name:${spDisplayName.toLowerCase()}`;

    if (key !== payeeKey) continue;

    // This split belongs to the requested payee.
    foundPayee = true;
    if (!displayName) {
      displayName = spDisplayName;
      payToName = spPayToName;
      ownerKind = spOwnerKind;
      ownerId = spOwnerId;
    }

    const song = songById.get(sp.songId);
    if (!song || !song.albumId) continue;

    const albumEntry = albumEntries.find((e) => e.albumId === song.albumId);
    if (!albumEntry) continue;

    const owedMicros = rateMicros * albumEntry.unitsPressed * (bp / 10000);
    const list = linesByAlbum.get(song.albumId) ?? [];
    list.push({ lineId: sp.id, songId: song.id, songTitle: song.title, splitBp: bp, owedMicros });
    linesByAlbum.set(song.albumId, list);
  }

  if (!foundPayee) return null;

  // Build the album breakdown.
  const albumsOut: PayeeStatementAlbum[] = [];
  for (const entry of albumEntries) {
    const lines = linesByAlbum.get(entry.albumId);
    if (!lines || lines.length === 0) continue;
    const albumMicros = lines.reduce((s, l) => s + l.owedMicros, 0);
    albumsOut.push({
      albumId: entry.albumId,
      title: entry.title,
      artist: entry.artist,
      artwork: entry.artwork,
      unitsPressed: entry.unitsPressed,
      albumMicros,
      lines,
    });
  }
  albumsOut.sort((a, b) => b.albumMicros - a.albumMicros);

  const totalMicros = albumsOut.reduce((s, a) => s + a.albumMicros, 0);
  const totalCents = Math.round(totalMicros / (MICROS_PER_DOLLAR / 100));
  const lineCount = albumsOut.reduce((s, a) => s + a.lines.length, 0);

  // Resolve payout-account status.
  let hasPayoutAccount = false;
  let payoutsEnabled = false;
  if (ownerId && ownerKind) {
    const accts = await db
      .select()
      .from(payoutAccounts)
      .where(
        and(
          eq(payoutAccounts.ownerKind, ownerKind),
          eq(payoutAccounts.ownerId, ownerId),
        ),
      )
      .limit(1);
    if (accts.length > 0) {
      hasPayoutAccount = true;
      payoutsEnabled = !!accts[0].payoutsEnabled;
    }
  }

  return {
    payeeKey,
    displayName,
    payToName,
    ownerKind,
    ownerId,
    hasPayoutAccount,
    payoutsEnabled,
    rateMicros,
    totalMicros,
    totalCents,
    lineCount,
    albums: albumsOut,
  };
}
