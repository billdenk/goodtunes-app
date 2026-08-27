// Task #3412 — stale-track-order lifecycle: reorder-before vs reorder-after
// upload, ack/reset behavior, and the actually-changed stamp guard.
//   npx tsx --test shared/staleArtOrder.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  staleOrderCheck,
  vinylAssignmentChanged,
  STALE_ORDER_CHECK_KEY,
} from "./staleArtOrder";
import type { StaleOrderAck } from "./uploadValidation";

const T1 = "2026-08-01T10:00:00.000Z";
const T2 = "2026-08-02T10:00:00.000Z";
const T3 = "2026-08-03T10:00:00.000Z";

const ackAt = (orderChangedAt: string): StaleOrderAck => ({
  byUserId: "u1",
  byDisplayName: "Op",
  at: T3,
  orderChangedAt,
});

describe("staleOrderCheck", () => {
  it("never reordered → no row (albums that never reorder see no new warnings)", () => {
    assert.equal(staleOrderCheck({ orderChangedAt: null, lastUploadedAt: T1, ack: null }), null);
    assert.equal(staleOrderCheck({ orderChangedAt: null, lastUploadedAt: null, ack: null }), null);
  });

  it("reorder BEFORE upload → no row (art was made against the new order)", () => {
    assert.equal(staleOrderCheck({ orderChangedAt: T1, lastUploadedAt: T2, ack: null }), null);
  });

  it("upload at exactly the reorder timestamp counts as fresh", () => {
    assert.equal(staleOrderCheck({ orderChangedAt: T1, lastUploadedAt: T1, ack: null }), null);
  });

  it("reorder AFTER upload → warn row with the stable key", () => {
    const row = staleOrderCheck({ orderChangedAt: T2, lastUploadedAt: T1, ack: null });
    assert.ok(row);
    assert.equal(row!.key, STALE_ORDER_CHECK_KEY);
    assert.equal(row!.status, "warn");
    assert.equal(row!.tier, undefined); // real warn, not advisory
    assert.match(row!.message, /track order changed/i);
  });

  it("re-upload after the reorder clears the warning (no row)", () => {
    // Same album, but a newer uploaded event now exists.
    assert.equal(staleOrderCheck({ orderChangedAt: T2, lastUploadedAt: T3, ack: null }), null);
  });

  it("reorder with NO recorded upload event (legacy pre-trail upload) → warn", () => {
    const row = staleOrderCheck({ orderChangedAt: T2, lastUploadedAt: null, ack: null });
    assert.ok(row);
    assert.equal(row!.status, "warn");
    assert.match(row!.message, /predates order tracking/i);
  });

  it("acknowledged for THIS reorder → pass + advisory (visible, not warning)", () => {
    const row = staleOrderCheck({ orderChangedAt: T2, lastUploadedAt: T1, ack: ackAt(T2) });
    assert.ok(row);
    assert.equal(row!.status, "pass");
    assert.equal(row!.tier, "advisory");
    assert.match(row!.message, /acknowledged/i);
    assert.match(row!.message, /Op/);
  });

  it("a FURTHER reorder invalidates a prior ack → warns again", () => {
    // Acked the T2 reorder, but the order changed again at T3.
    const row = staleOrderCheck({ orderChangedAt: T3, lastUploadedAt: T1, ack: ackAt(T2) });
    assert.ok(row);
    assert.equal(row!.status, "warn");
  });

  it("accepts Date objects as well as ISO strings", () => {
    const row = staleOrderCheck({
      orderChangedAt: new Date(T2),
      lastUploadedAt: new Date(T1),
      ack: null,
    });
    assert.equal(row?.status, "warn");
    assert.equal(
      staleOrderCheck({ orderChangedAt: new Date(T1), lastUploadedAt: new Date(T2), ack: null }),
      null,
    );
  });
});

describe("vinylAssignmentChanged", () => {
  it("same side + order → unchanged (no-op saves never stamp)", () => {
    assert.equal(
      vinylAssignmentChanged({ vinylSide: "A", vinylOrder: 1 }, { vinylSide: "A", vinylOrder: 1 }),
      false,
    );
    assert.equal(
      vinylAssignmentChanged({ vinylSide: null, vinylOrder: null }, { vinylSide: null, vinylOrder: null }),
      false,
    );
  });

  it("order moved within a side → changed", () => {
    assert.equal(
      vinylAssignmentChanged({ vinylSide: "A", vinylOrder: 1 }, { vinylSide: "A", vinylOrder: 2 }),
      true,
    );
  });

  it("side reassigned → changed", () => {
    assert.equal(
      vinylAssignmentChanged({ vinylSide: "A", vinylOrder: 2 }, { vinylSide: "B", vinylOrder: 2 }),
      true,
    );
  });

  it("assigning a previously-unassigned song → changed; and vice versa", () => {
    assert.equal(
      vinylAssignmentChanged({ vinylSide: null, vinylOrder: null }, { vinylSide: "A", vinylOrder: 3 }),
      true,
    );
    assert.equal(
      vinylAssignmentChanged({ vinylSide: "A", vinylOrder: 3 }, { vinylSide: null, vinylOrder: null }),
      true,
    );
  });

  it("undefined existing (unknown song) → not counted as a change", () => {
    assert.equal(vinylAssignmentChanged(undefined, { vinylSide: "A", vinylOrder: 1 }), false);
  });

  it("undefined fields normalize to null before comparing", () => {
    assert.equal(
      vinylAssignmentChanged(
        { vinylSide: undefined as unknown as null, vinylOrder: undefined as unknown as null },
        { vinylSide: null, vinylOrder: null },
      ),
      false,
    );
  });
});
