// Task #1530 — per-section completeness derivation for the admin album
// editor. The old five-step "Path to press" strip is gone; instead each
// section tab (Overview · Package · Digital · Physical/Shopify) carries a
// three-state dot derived entirely client-side from already-loaded data.
//
// States:
//   - "empty"        nothing meaningful filled in yet (hollow gray ring)
//   - "in-progress"  some work done, not finished (quiet slate dot)
//   - "complete"     section is done (filled mint dot — mint ONLY here)
//
// `missing` carries short human phrases naming what's still outstanding so
// the tab's hover tooltip can explain the dot. This module is pure (no
// React) so it stays unit-testable.

export type SectionState = "empty" | "in-progress" | "complete";

export interface SectionStatus {
  state: SectionState;
  /** Short phrases naming what's still missing, for the hover tooltip. */
  missing: string[];
}

export type CompletenessSong = {
  audioUrl?: string | null;
  muxStatus?: string | null;
  instrumental?: boolean | null;
};

export type CompletenessAlbum = {
  title?: string | null;
  artist?: string | null;
  artwork?: string | null;
  type?: string | null;
  genre?: string | null;
  goodTunesReleaseDate?: string | null;
  sellMode?: "direct" | "shopify" | "shopify_plus" | null;
  sellQuoteLockedAt?: string | null;
  songs: CompletenessSong[];
};

export type CompletenessSku = {
  active?: boolean | null;
  priceCents?: number | null;
  plannedQuantity?: number | null;
};

export type UploadValidationLite = {
  status: "pass" | "warn" | "fail";
  overrideAt?: string | null;
};

export type PressingOrderLite = { status?: string | null } | null;

export type ShopifyPushLite = { push?: { pushedAt?: string | null } | null } | null;

export type PreflightRollup = "pass" | "warn" | "fail" | "overridden" | null;

// Task #2929 — the Payments (prepaid manufacturing) tab of a shopify_plus
// album. Shaped after the manufacturing-ledger GET so the caller can pass
// the ledger payload straight through.
export type CompletenessLedgerStep = {
  status?: string | null;
};

export type CompletenessLedger = {
  steps?: CompletenessLedgerStep[] | null;
  totals?: {
    quotedCents?: number | null;
    paidCents?: number | null;
    outstandingCents?: number | null;
  } | null;
} | null;

export interface CompletenessInput {
  album: CompletenessAlbum;
  skus: CompletenessSku[];
  validations?: UploadValidationLite[] | null;
  pressingOrder?: PressingOrderLite;
  shopifyPush?: ShopifyPushLite;
  shopifyMappings?: unknown[] | null;
  /** Manufacturing-payments ledger (shopify_plus albums only). */
  ledger?: CompletenessLedger;
}

export interface AlbumCompleteness {
  overview: SectionStatus;
  sell: SectionStatus;
  tracks: SectionStatus;
  press: SectionStatus;
  shopify: SectionStatus;
  /**
   * Task #2929 — prepaid-manufacturing Payments tab (shopify_plus).
   * Empty until a payment request exists; complete once every request is
   * paid with no outstanding balance.
   */
  payments: SectionStatus;
  /**
   * True when Overview + Package + Digital read complete AND the press
   * preflight is clean with masters on file — i.e. the album is ready to
   * be sent to GoodTunes. Gates the relocated "Go to Press" affordance.
   */
  pressReadyToSend: boolean;
  /**
   * True when Overview + Digital read complete with masters on file — the
   * Shopify product is ready to push. Gates the "Push to Shopify" button.
   */
  shopifyReadyToPush: boolean;
}

function nonEmpty(v: unknown): boolean {
  return typeof v === "string" ? v.trim().length > 0 : v != null;
}

/** Roll an album's per-file upload validations into one worst-case state.
 *  Mirrors the rollup the old Path-to-press strip used. */
export function rollupPreflight(
  rows: UploadValidationLite[] | null | undefined,
): PreflightRollup {
  if (!rows || rows.length === 0) return null;
  let worst: "pass" | "warn" | "overridden" = "pass";
  for (const r of rows) {
    const effective = r.overrideAt ? "overridden" : r.status;
    if (effective === "fail") return "fail";
    if (effective === "warn" && worst === "pass") worst = "warn";
    if (effective === "overridden" && worst === "pass") worst = "overridden";
  }
  return worst;
}

export function deriveSectionCompleteness(
  input: CompletenessInput,
): AlbumCompleteness {
  const { album, skus } = input;
  const songs = album.songs ?? [];

  // ── Overview ──────────────────────────────────────────────────────
  // Required: Title, Artist, Artwork, Type, Genre, GoodTunes release date.
  // Title/Artist/Type are auto-created with the album shell, so they don't
  // count as "the operator started" — only the user-provided fields
  // (Artwork / Genre / Release date) flip empty → in-progress.
  const titleOk = nonEmpty(album.title);
  const artistOk = nonEmpty(album.artist);
  const artworkOk = nonEmpty(album.artwork);
  const typeOk = nonEmpty(album.type);
  const genreOk = nonEmpty(album.genre);
  const dateOk = nonEmpty(album.goodTunesReleaseDate);
  const overviewMissing: string[] = [];
  if (!titleOk) overviewMissing.push("Title");
  if (!artistOk) overviewMissing.push("Artist");
  if (!artworkOk) overviewMissing.push("Artwork");
  if (!typeOk) overviewMissing.push("Type");
  if (!genreOk) overviewMissing.push("Genre");
  if (!dateOk) overviewMissing.push("GoodTunes release date");
  const overviewStarted = artworkOk || genreOk || dateOk;
  const overview: SectionStatus = {
    state:
      overviewMissing.length === 0
        ? "complete"
        : overviewStarted
          ? "in-progress"
          : "empty",
    missing: overviewMissing,
  };

  // ── Package (Sell) ────────────────────────────────────────────────
  // Complete once the operator locks the quote. In-progress once any SKU
  // exists; empty before that.
  const locked = nonEmpty(album.sellQuoteLockedAt);
  const hasSku = skus.length > 0 || skus.some((s) => s.active);
  const sell: SectionStatus = {
    state: locked ? "complete" : hasSku ? "in-progress" : "empty",
    missing: locked ? [] : hasSku ? ["Lock in the quote"] : ["Pick a package"],
  };

  // ── Digital (Tracks) ──────────────────────────────────────────────
  // Complete when every track has a finished master (Mux status ready).
  // Lyrics are recommended, not required, and instrumentals are exempt.
  const withMaster = songs.filter((s) => nonEmpty(s.audioUrl));
  const ready = songs.filter((s) => s.muxStatus === "ready");
  const tracksComplete = songs.length > 0 && songs.every((s) => s.muxStatus === "ready");
  const tracksStarted = withMaster.length > 0 || ready.length > 0;
  const notReady = songs.length - ready.length;
  let tracksState: SectionState;
  if (songs.length === 0) tracksState = "empty";
  else if (tracksComplete) tracksState = "complete";
  else if (tracksStarted) tracksState = "in-progress";
  else tracksState = "empty";
  const tracks: SectionStatus = {
    state: tracksState,
    missing: tracksComplete
      ? []
      : songs.length === 0
        ? ["Add tracks"]
        : [`${notReady} track${notReady === 1 ? "" : "s"} need a master`],
  };

  // ── Physical (Press) ──────────────────────────────────────────────
  // Complete once the pressing order is sent (pending/approved). A
  // rejected order drops back to in-progress so the operator can resubmit.
  const preflight = rollupPreflight(input.validations);
  const preflightClean =
    preflight === "pass" || preflight === "warn" || preflight === "overridden";
  const hasMasters = withMaster.length > 0;
  const orderStatus = input.pressingOrder?.status ?? null;
  const sent = orderStatus === "pending" || orderStatus === "approved";
  const rejected = orderStatus === "rejected";

  const pressMissing: string[] = [];
  if (!hasMasters) pressMissing.push("Upload masters");
  if (!preflightClean) pressMissing.push("Run masters + art preflight");
  if (rejected) pressMissing.push("GoodTunes asked for changes — resubmit");
  else if (!sent) pressMissing.push("Send the order to GoodTunes");

  let pressState: SectionState;
  if (sent) pressState = "complete";
  else if (!hasMasters && preflight === null) pressState = "empty";
  else pressState = "in-progress";
  const press: SectionStatus = {
    state: pressState,
    missing: sent ? [] : pressMissing,
  };

  const coreComplete =
    overview.state === "complete" &&
    sell.state === "complete" &&
    tracks.state === "complete";
  const pressReadyToSend =
    coreComplete && preflightClean && hasMasters && !sent;

  // ── Shopify ───────────────────────────────────────────────────────
  // Complete once the album has been pushed (a draft product exists or a
  // mapping is linked). In-progress once masters / packages exist; empty
  // before that.
  const pushed =
    nonEmpty(input.shopifyPush?.push?.pushedAt) ||
    (input.shopifyMappings?.length ?? 0) > 0;
  let shopifyState: SectionState;
  if (pushed) shopifyState = "complete";
  else if (hasMasters || hasSku) shopifyState = "in-progress";
  else shopifyState = "empty";
  const shopify: SectionStatus = {
    state: shopifyState,
    missing: pushed
      ? []
      : !hasMasters
        ? ["Add masters"]
        : ["Push the product to Shopify"],
  };
  const shopifyReadyToPush =
    overview.state === "complete" && tracks.state === "complete";

  // ── Payments (Shopify+ prepaid manufacturing) ─────────────────────
  // Empty before any payment request or quote exists; complete once every
  // request is paid and nothing is outstanding; in-progress in between.
  const ledger = input.ledger ?? null;
  const ledgerSteps = ledger?.steps ?? [];
  const quotedCents = ledger?.totals?.quotedCents ?? 0;
  const paidCents = ledger?.totals?.paidCents ?? 0;
  const outstandingCents = ledger?.totals?.outstandingCents ?? 0;
  const awaiting = ledgerSteps.filter(
    (s) => s.status === "unpaid" || s.status === "failed",
  ).length;
  const clearing = ledgerSteps.filter((s) => s.status === "processing").length;
  const allStepsPaid =
    ledgerSteps.length > 0 && ledgerSteps.every((s) => s.status === "paid");
  const paymentsMissing: string[] = [];
  if (awaiting > 0)
    paymentsMissing.push(
      `${awaiting} payment request${awaiting === 1 ? "" : "s"} awaiting payment`,
    );
  if (clearing > 0)
    paymentsMissing.push(
      `${clearing} payment${clearing === 1 ? "" : "s"} clearing the bank`,
    );
  if (allStepsPaid && outstandingCents > 0)
    paymentsMissing.push(
      `$${(outstandingCents / 100).toLocaleString("en-US")} still outstanding`,
    );
  let paymentsState: SectionState;
  if (ledgerSteps.length === 0 && quotedCents <= 0) paymentsState = "empty";
  else if (allStepsPaid && outstandingCents <= 0) paymentsState = "complete";
  else if (ledgerSteps.length === 0 && paidCents <= 0) paymentsState = "empty";
  else paymentsState = "in-progress";
  if (paymentsState !== "complete" && paymentsMissing.length === 0)
    paymentsMissing.push("Request a payment");
  const payments: SectionStatus = {
    state: paymentsState,
    missing: paymentsState === "complete" ? [] : paymentsMissing,
  };

  return {
    overview,
    sell,
    tracks,
    press,
    shopify,
    payments,
    pressReadyToSend,
    shopifyReadyToPush,
  };
}

/** Build the hover-tooltip text for a section tab dot. */
export function sectionTooltip(label: string, status: SectionStatus): string {
  if (status.state === "complete") return `${label}: complete`;
  if (status.missing.length === 0) return label;
  return `${label} — still needed: ${status.missing.join(", ")}`;
}
