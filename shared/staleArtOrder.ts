// Task #3412 — "Flag artwork listing an outdated track order".
//
// Artists can reorder tracks (songs.vinylSide/vinylOrder) AFTER uploading
// finished art, leaving center labels / jackets / inner sleeves printed
// with the old order. Tier 1 is a cheap timestamp check: the vinyl-order
// save route stamps albums.vinylOrderChangedAt only when a persisted
// side/order value ACTUALLY changed, and the completed-template payload
// compares that against each component's latest `uploaded` file event.
//
// The check row is computed dynamically at payload time (never persisted
// into the component's stored `checks`), so a re-upload or a further
// reorder is reflected immediately without re-running the file check.
// Warn-only by contract: the rollup treats it as a warning (sendable),
// never a blocker.

import type { CheckResult, StaleOrderAck } from "./uploadValidation";

/** Stable machine key for the stale-track-order check row. The client's
 *  acknowledge affordance keys off `key === STALE_ORDER_CHECK_KEY &&
 *  status === "warn"`. */
export const STALE_ORDER_CHECK_KEY = "art.track_order_stale";

function toMs(v: string | Date | null | undefined): number | null {
  if (v == null) return null;
  const ms = v instanceof Date ? v.getTime() : Date.parse(v);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Compute the stale-track-order check row for one completed-art component.
 *
 * Returns:
 *  - null — no row at all: the album never reordered since tracking began,
 *    or the file was (re-)uploaded after the last reorder.
 *  - a WARN row — the order changed after this file's latest upload and no
 *    current acknowledgment covers it. A component with a file but NO
 *    recorded upload event (legacy pre-trail uploads) also warns once a
 *    reorder happens: the upload time is unknown, so honesty wins.
 *  - a pass+advisory row — an operator acknowledged this exact reorder
 *    (ack.orderChangedAt >= orderChangedAt); a further reorder re-warns.
 */
export function staleOrderCheck(args: {
  /** albums.vinylOrderChangedAt */
  orderChangedAt: string | Date | null;
  /** The component's latest `uploaded` file-event timestamp (null = none
   *  on record, i.e. a legacy upload predating the file-events trail). */
  lastUploadedAt: string | Date | null;
  ack: StaleOrderAck | null | undefined;
}): CheckResult | null {
  const changedMs = toMs(args.orderChangedAt);
  if (changedMs == null) return null; // never reordered → no new warnings
  const uploadedMs = toMs(args.lastUploadedAt);
  if (uploadedMs != null && uploadedMs >= changedMs) return null; // re-upload clears

  const ackMs = toMs(args.ack?.orderChangedAt ?? null);
  if (args.ack && ackMs != null && ackMs >= changedMs) {
    const who = args.ack.byDisplayName ? ` by ${args.ack.byDisplayName}` : "";
    const when = toMs(args.ack.at) != null ? ` on ${new Date(args.ack.at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : "";
    return {
      key: STALE_ORDER_CHECK_KEY,
      label: "Track order since upload",
      status: "pass",
      tier: "advisory",
      message: `The album's track order changed after this file was uploaded — acknowledged as still correct${who}${when}. A further reorder re-flags this.`,
    };
  }

  return {
    key: STALE_ORDER_CHECK_KEY,
    label: "Track order since upload",
    status: "warn",
    message:
      uploadedMs == null
        ? "The album's vinyl track order changed, and this file's upload predates order tracking — the printed tracklist may list the old order. Re-check the artwork against the current side order (re-uploading clears this)."
        : "The album's vinyl track order changed after this file was uploaded — the printed tracklist may list the old order. Re-check the artwork against the current side order (re-uploading clears this).",
  };
}

/**
 * Whether one vinyl-order assignment actually changes the persisted
 * side/order of a song. Drives the vinylOrderChangedAt stamp: saves that
 * persist the same values (drag opened + dropped back, redundant client
 * saves) must never move the timestamp — albums that never reorder see no
 * new warnings, by construction.
 */
export function vinylAssignmentChanged(
  existing: { vinylSide: string | null; vinylOrder: number | null } | undefined,
  next: { vinylSide: string | null; vinylOrder: number | null },
): boolean {
  if (!existing) return false; // unknown song — the route rejects it anyway
  return (
    (existing.vinylSide ?? null) !== (next.vinylSide ?? null) ||
    (existing.vinylOrder ?? null) !== (next.vinylOrder ?? null)
  );
}
