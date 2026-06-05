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
