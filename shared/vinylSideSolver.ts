// Task #593 — Vinyl side-balance solver.
//
// Pure helper extracted from `client/src/components/admin/VinylOrderPanel.tsx`
// so the search logic is testable independently of the drag-and-drop UI.
// Given a current side-assignment + the chosen vinyl format, returns the
// least-disruptive change that leaves every side under its cap:
//
//   move      — shift one track to a side that has room
//   swap      — swap one track on the over-cap side with one on another
//   bump-format — recommend a larger format (e.g. Single LP → Double LP)
//   wont-fit  — even the largest supported format can't hold the runtime
//   null      — nothing is over cap, no suggestion needed
//
// Crucially: a suggestion is only returned when *applying it leaves every
// side legal*. The pre-Task-593 panel would propose moves that pushed the
// destination side over its own cap; nothing in here will do that.

import {
  VINYL_FORMAT_RULES,
  VINYL_FORMATS,
  type VinylFormat,
  type VinylSide,
} from "./vinylFormatRules";

export type VinylSongInput = {
  id: string;
  title: string;
  duration: number; // seconds
  trackNumber: number;
};

export type SideState = Record<VinylSide, string[]>;

export type VinylSuggestion =
  | {
      kind: "move";
      songId: string;
      songTitle: string;
      songDuration: number;
      fromSide: VinylSide;
      toSide: VinylSide;
    }
  | {
      kind: "swap";
      aId: string;
      aTitle: string;
      aDuration: number;
      aSide: VinylSide;
      bId: string;
      bTitle: string;
      bDuration: number;
      bSide: VinylSide;
    }
  | { kind: "bump-format"; toFormat: VinylFormat; toLabel: string }
  | { kind: "wont-fit"; totalSeconds: number; largestLabel: string }
  | null;

// Ordered upgrade path. Each format points at the next-larger format
// the solver should try when nothing fits today. The chain ends at
// the largest format we currently support (2xLP).
const FORMAT_BUMP: Partial<Record<VinylFormat, VinylFormat>> = {
  "7_45": "12_33_single",
  "12_45": "12_33_single",
  "12_33_single": "12_33_double",
};

function emptyState(): SideState {
  return { A: [], B: [], C: [], D: [] };
}

function cloneState(state: SideState): SideState {
  return {
    A: [...state.A],
    B: [...state.B],
    C: [...state.C],
    D: [...state.D],
  };
}

function sideTotal(
  side: VinylSide,
  state: SideState,
  songsById: Map<string, VinylSongInput>,
): number {
  return state[side].reduce(
    (sum, id) => sum + (songsById.get(id)?.duration ?? 0),
    0,
  );
}

function allSidesLegal(
  sides: readonly VinylSide[],
  state: SideState,
  songsById: Map<string, VinylSongInput>,
  maxMinutes: number,
): boolean {
  for (const s of sides) {
    if (sideTotal(s, state, songsById) / 60 > maxMinutes) return false;
  }
  return true;
}

// Greedy longest-first into the currently-shortest side. Stable
// within a side by digital `trackNumber` so the result is
// deterministic regardless of input order.
export function balancedLayout(
  songs: VinylSongInput[],
  sides: readonly VinylSide[],
): SideState {
  const state = emptyState();
  const totals: Record<VinylSide, number> = { A: 0, B: 0, C: 0, D: 0 };
  const order = [...songs].sort((a, b) => b.duration - a.duration);
  for (const song of order) {
    let target = sides[0];
    for (const s of sides) {
      if (totals[s] < totals[target]) target = s;
    }
    state[target].push(song.id);
    totals[target] += song.duration;
  }
  const byId = new Map(songs.map((s) => [s.id, s]));
  for (const s of sides) {
    state[s].sort((a, b) => {
      const sa = byId.get(a)!;
      const sb = byId.get(b)!;
      return sa.trackNumber - sb.trackNumber;
    });
  }
  return state;
}

function largestSupportedFormat(): { format: VinylFormat; capacityMin: number } {
  let largest: VinylFormat = VINYL_FORMATS[0];
  let cap = 0;
  for (const f of VINYL_FORMATS) {
    const r = VINYL_FORMAT_RULES[f];
    const c = r.sides.length * r.maxMinutesPerSide;
    if (c > cap) {
      largest = f;
      cap = c;
    }
  }
  return { format: largest, capacityMin: cap };
}

export function computeVinylSuggestion(
  state: SideState,
  songs: VinylSongInput[],
  format: VinylFormat,
): VinylSuggestion {
  const rule = VINYL_FORMAT_RULES[format];
  const sides = rule.sides;
  const maxMin = rule.maxMinutesPerSide;
  const songsById = new Map(songs.map((s) => [s.id, s]));

  const overSides = sides.filter(
    (s) => sideTotal(s, state, songsById) / 60 > maxMin,
  );
  if (overSides.length === 0) return null;

  // 1. Single moves — pick the smallest legal move (least disruption).
  let bestMove:
    | {
        song: VinylSongInput;
        from: VinylSide;
        to: VinylSide;
        delta: number;
      }
    | null = null;
  for (const from of overSides) {
    for (const id of state[from]) {
      const song = songsById.get(id);
      if (!song) continue;
      for (const to of sides) {
        if (to === from) continue;
        const next = cloneState(state);
        const idx = next[from].indexOf(id);
        if (idx < 0) continue;
        next[from].splice(idx, 1);
        next[to].push(id);
        if (allSidesLegal(sides, next, songsById, maxMin)) {
          if (!bestMove || song.duration < bestMove.delta) {
            bestMove = { song, from, to, delta: song.duration };
          }
        }
      }
    }
  }
  if (bestMove) {
    return {
      kind: "move",
      songId: bestMove.song.id,
      songTitle: bestMove.song.title,
      songDuration: bestMove.song.duration,
      fromSide: bestMove.from,
      toSide: bestMove.to,
    };
  }

  // 2. Swaps — exchange one over-side track with one elsewhere.
  let bestSwap:
    | {
        a: VinylSongInput;
        aSide: VinylSide;
        b: VinylSongInput;
        bSide: VinylSide;
        displacement: number;
      }
    | null = null;
  for (const aSide of overSides) {
    for (const aId of state[aSide]) {
      const a = songsById.get(aId);
      if (!a) continue;
      for (const bSide of sides) {
        if (bSide === aSide) continue;
        for (const bId of state[bSide]) {
          const b = songsById.get(bId);
          if (!b) continue;
          // Only meaningful if swap actually reduces the over-side.
          if (b.duration >= a.duration) continue;
          const next = cloneState(state);
          const ai = next[aSide].indexOf(aId);
          const bi = next[bSide].indexOf(bId);
          if (ai < 0 || bi < 0) continue;
          next[aSide].splice(ai, 1, bId);
          next[bSide].splice(bi, 1, aId);
          if (allSidesLegal(sides, next, songsById, maxMin)) {
            const disp = a.duration + b.duration;
            if (!bestSwap || disp < bestSwap.displacement) {
              bestSwap = { a, aSide, b, bSide, displacement: disp };
            }
          }
        }
      }
    }
  }
  if (bestSwap) {
    return {
      kind: "swap",
      aId: bestSwap.a.id,
      aTitle: bestSwap.a.title,
      aDuration: bestSwap.a.duration,
      aSide: bestSwap.aSide,
      bId: bestSwap.b.id,
      bTitle: bestSwap.b.title,
      bDuration: bestSwap.b.duration,
      bSide: bestSwap.bSide,
    };
  }

  // 3. Format bump — simulate the album on the next-larger format
  // with a fresh greedy layout, and walk up the chain until something
  // fits or we run out of upgrades.
  let cursor: VinylFormat | undefined = FORMAT_BUMP[format];
  while (cursor) {
    const bumpRule = VINYL_FORMAT_RULES[cursor];
    const balanced = balancedLayout(songs, bumpRule.sides);
    if (
      allSidesLegal(
        bumpRule.sides,
        balanced,
        songsById,
        bumpRule.maxMinutesPerSide,
      )
    ) {
      return {
        kind: "bump-format",
        toFormat: cursor,
        toLabel: bumpRule.label,
      };
    }
    cursor = FORMAT_BUMP[cursor];
  }

  // 4. Even the largest format can't hold the runtime.
  const { format: largest } = largestSupportedFormat();
  const totalSeconds = songs.reduce((s, x) => s + x.duration, 0);
  return {
    kind: "wont-fit",
    totalSeconds,
    largestLabel: VINYL_FORMAT_RULES[largest].label,
  };
}
