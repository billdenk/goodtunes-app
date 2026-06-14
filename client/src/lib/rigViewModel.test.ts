// Unit coverage for accessory→catalog gear resolution on the fan rig surface.
//
// A rig accessory that links to a catalog instrument (e.g. a signature pick)
// must become clickable on BOTH fan surfaces (mobile <SongCreditsSheet> +
// desktop <AlbumCreditsPage>) so it opens its own gear sheet → source. The
// server embeds the vendor-enriched instrument on each accessory; the client
// indexes it in buildInstrumentsById() and the shared resolver fills
// accessory.instrument by id. A free-text accessory (no instrumentId) must
// stay non-clickable.
//
// Pure functions — no DOM needed. Run via Node's built-in test runner:
//   npx tsx --test client/src/lib/rigViewModel.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import { buildInstrumentsById, makeResolveRigView } from "./rigViewModel";
import type { SongRig } from "@/components/ui/AlbumCreditsSheet";

const pickInstrument = {
  id: "pick-351",
  name: "351 — Celluloid — White Pearloid",
  category: "Accessory",
  shortCategory: "Accessory",
  photoUrl: "https://example.test/pick.jpg",
  vendors: [
    {
      id: "v1",
      instrumentId: "pick-351",
      vendorId: "ven-pickworld",
      name: "PickWorld",
      affiliateUrl: "https://pickworld.com/products/351",
      position: 0,
    },
  ],
};

const guitarInstrument = {
  id: "gtr-1",
  name: "Some Electric Guitar",
  category: "Electric Guitar",
  vendors: [],
};

// Mirrors the GET /api/albums/:id/credits payload shape: the server embeds the
// vendor-enriched `instrument` on each accessory. `a1` is catalog-linked (a
// signature pick); `a2` is a free-text accessory (no instrumentId).
const payload = {
  bySongId: {
    s1: {
      performers: [{ instrument: guitarInstrument }],
      rigs: [
        {
          id: "tr1",
          rigName: "Rig A",
          rig: {
            id: "r1",
            name: "Rig A",
            accessories: [
              {
                id: "a1",
                type: "Pick",
                value: "351 — Celluloid — White Pearloid",
                instrumentId: "pick-351",
                instrument: pickInstrument,
              },
              { id: "a2", type: "Pick", value: "Dunlop Tortex .60mm" },
            ],
          },
        },
      ],
    },
  },
};

test("buildInstrumentsById: indexes an accessory's embedded (vendor-enriched) instrument", () => {
  const idx = buildInstrumentsById(payload as any);
  const pick = idx.get("pick-351");
  assert.ok(pick, "accessory-linked instrument is indexed");
  assert.equal(pick!.name, "351 — Celluloid — White Pearloid");
  assert.equal(pick!.vendors.length, 1, "vendor enrichment is preserved");
});

test("buildInstrumentsById: performer instrument wins over an accessory of the same id (set-if-absent)", () => {
  const collide = {
    bySongId: {
      s1: {
        performers: [
          { instrument: { id: "dup", name: "Performer Copy", category: "Guitar", vendors: [] } },
        ],
        rigs: [
          {
            id: "tr1",
            rigName: "R",
            rig: {
              id: "r1",
              name: "R",
              accessories: [
                {
                  id: "a1",
                  type: "Pick",
                  value: "x",
                  instrumentId: "dup",
                  instrument: { id: "dup", name: "Accessory Copy", category: "Accessory", vendors: [] },
                },
              ],
            },
          },
        ],
      },
    },
  };
  const idx = buildInstrumentsById(collide as any);
  assert.equal(idx.get("dup")!.name, "Performer Copy");
});

test("buildInstrumentsById: a payload with no rigs key does not throw (back-compat)", () => {
  const idx = buildInstrumentsById({ bySongId: { s1: { performers: [] } } } as any);
  assert.ok(idx instanceof Map);
});

test("resolver: a catalog-linked accessory resolves to a clickable instrument; free-text stays null", () => {
  const idx = buildInstrumentsById(payload as any);
  const resolve = makeResolveRigView({
    instrumentsById: idx,
    credits: payload as any,
    songs: [{ id: "s1", title: "Track One" }],
    album: { title: "Album", artist: "Fernando", artwork: null },
    songId: "s1",
    songTitle: "Track One",
  });
  const view = resolve(payload.bySongId.s1.rigs[0] as unknown as SongRig, {});

  const linked = view.accessories.find((a) => a.id === "a1")!;
  assert.ok(linked.instrument, "linked accessory carries a resolved instrument (clickable)");
  assert.equal(linked.instrument!.id, "pick-351");
  assert.equal(linked.instrument!.vendors.length, 1, "resolved accessory is vendor-enriched");

  const freeText = view.accessories.find((a) => a.id === "a2")!;
  assert.equal(freeText.instrument, null, "free-text accessory stays non-clickable");
});

test("resolver: a linked accessory falls back to null when its instrument was never indexed (graceful)", () => {
  // Old server (no embedded accessory instrument) → buildInstrumentsById never
  // indexed it → resolver must degrade to a non-clickable row, not throw.
  const idx = buildInstrumentsById({ bySongId: { s1: { performers: [] } } } as any);
  const resolve = makeResolveRigView({
    instrumentsById: idx,
    credits: payload as any,
    songs: [{ id: "s1", title: "Track One" }],
    album: { title: "Album", artist: "Fernando", artwork: null },
    songId: "s1",
    songTitle: "Track One",
  });
  const view = resolve(payload.bySongId.s1.rigs[0] as unknown as SongRig, {});
  assert.equal(view.accessories.find((a) => a.id === "a1")!.instrument, null);
});
