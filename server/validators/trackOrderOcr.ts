// Task #3412 tier 2 — OCR tracklist matching for center labels.
//
// Reads the words Tesseract recognized on the center-label pages (via the
// Task #3411 OCR plumbing in ocrTextSize.ts), fuzzy-matches them against
// the album's song titles grouped by vinyl side (songs.vinylSide /
// vinylOrder), and reports:
//   - titles that could not be found on the label at all (a track may be
//     missing from the printed tracklist — the real-world incident), and
//   - titles that appear in a different order than the album's current
//     running order (the artwork may list an outdated order).
//
// Contract (same as every OCR finding in this repo): WARN-ONLY heuristics.
// OCR misreads stylized type and psm-11 reading order is approximate, so
// nothing here ever emits a "fail" or blocks a send. No confident words →
// no rows (we never claim to have verified something we couldn't read).

import type { OcrWordBox } from "./ocrTextSize";
import type { CheckResult } from "@shared/uploadValidation";

export type SideTracklist = { side: string; titles: string[] };

/** Group songs into per-side tracklists in vinyl running order. Songs with
 *  no side assignment (or no order) are skipped; an album with NO assigned
 *  sides yields [] → the matcher emits nothing. Pure — exported for tests. */
export function sideTracklistsFromSongs(
  songs: Array<{ title: string | null; vinylSide?: string | null; vinylOrder?: number | null }>,
): SideTracklist[] {
  const bySide = new Map<string, Array<{ order: number; title: string }>>();
  for (const s of songs) {
    const side = s.vinylSide ?? null;
    const order = s.vinylOrder ?? null;
    const title = (s.title ?? "").trim();
    if (!side || order == null || !title) continue;
    let list = bySide.get(side);
    if (!list) {
      list = [];
      bySide.set(side, list);
    }
    list.push({ order, title });
  }
  return [...bySide.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([side, list]) => ({
      side,
      titles: list.sort((a, b) => a.order - b.order).map((t) => t.title),
    }));
}

/** Words below this confidence are ignored for title matching. Lower than
 *  the text-size check's 60: a half-confident read is still useful evidence
 *  that a title is PRESENT, and everything downstream is warn-only. */
const MIN_MATCH_CONF = 40;
/** Similarity floor (1 - levenshtein/maxLen) for a fuzzy title match. */
const MATCH_THRESHOLD = 0.72;

/** Lowercase, strip diacritics, drop everything non-alphanumeric. */
export function normalizeTitleText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const cur = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = [...cur];
  }
  return prev[b.length];
}

function similarity(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  if (max === 0) return 1;
  return 1 - levenshtein(a, b) / max;
}

type SeqWord = { norm: string; page: number; index: number };

/** Find the best fuzzy occurrence of `title` in the OCR word sequence.
 *  Windows never span pages (a title prints on one label face), and never
 *  overlap indices in `consumed` — callers consume each match so a title
 *  expected twice needs two printed occurrences (occurrence-aware
 *  cardinality). Returns the best window's start index + size, or null
 *  when nothing clears the threshold. Pure — exported for tests. */
export function findTitleInWords(
  title: string,
  seq: SeqWord[],
  consumed?: ReadonlySet<number>,
): { index: number; size: number; similarity: number } | null {
  const tokens = normalizeTitleText(title).split(" ").filter(Boolean);
  if (tokens.length === 0) return null;
  const target = tokens.join("");
  // Very short targets ("Go", "Run") fuzzy-match noise — require exact.
  const shortTarget = target.length <= 3;
  // OCR merges/splits words: try windows one smaller through one larger
  // than the title's own token count.
  const sizes = new Set<number>([
    Math.max(1, tokens.length - 1),
    tokens.length,
    tokens.length + 1,
  ]);
  let best: { index: number; size: number; similarity: number } | null = null;
  for (const size of sizes) {
    outer: for (let i = 0; i + size <= seq.length; i++) {
      if (seq[i + size - 1].page !== seq[i].page) continue; // no page spans
      let joined = "";
      for (let k = i; k < i + size; k++) {
        if (consumed?.has(k)) continue outer; // already matched by an earlier title
        joined += seq[k].norm;
      }
      if (Math.abs(joined.length - target.length) > Math.max(3, target.length * 0.5)) continue;
      const sim = shortTarget ? (joined === target ? 1 : 0) : similarity(joined, target);
      if (sim >= (shortTarget ? 1 : MATCH_THRESHOLD) && (!best || sim > best.similarity)) {
        best = { index: i, size, similarity: sim };
      }
    }
  }
  return best;
}

/** Map label pages to vinyl sides. Two signals, in priority order:
 *  1. Explicit side markers printed on the page — a "SIDE" token followed
 *     by (or merged with) the side's name, e.g. "SIDE A" / "SideB".
 *  2. Positional fallback: center-label files are one page per side in
 *     side order (labels = 1 multipage file), so when the page count
 *     equals the side count, page N ↔ side N.
 *  Returns an empty map when neither signal applies — the matcher then
 *  falls back to whole-file matching (honest, but side-blind).
 *  Pure — exported for tests. */
export function assignPagesToSides(
  seq: Array<{ norm: string; page: number }>,
  sides: SideTracklist[],
): Map<number, string> {
  const pages = [...new Set(seq.map((w) => w.page))].sort((a, b) => a - b);
  const pageToSide = new Map<number, string>();
  const sideByNorm = new Map(
    sides.map((s) => [normalizeTitleText(s.side).replace(/ /g, ""), s.side]),
  );
  for (const p of pages) {
    const pw = seq.filter((w) => w.page === p);
    for (let i = 0; i < pw.length && !pageToSide.has(p); i++) {
      // "SIDE" "A" as two tokens…
      if (pw[i].norm === "side" && i + 1 < pw.length && sideByNorm.has(pw[i + 1].norm)) {
        pageToSide.set(p, sideByNorm.get(pw[i + 1].norm)!);
      }
      // …or merged into one ("SideA").
      else if (
        pw[i].norm.length > 4 &&
        pw[i].norm.startsWith("side") &&
        sideByNorm.has(pw[i].norm.slice(4))
      ) {
        pageToSide.set(p, sideByNorm.get(pw[i].norm.slice(4))!);
      }
    }
  }
  // Complete the mapping positionally: whatever pages/sides the markers
  // didn't claim pair up in order — a partially OCR'd set of markers must
  // not degrade the still-unambiguous remainder to whole-file matching.
  const claimedSides = new Set(pageToSide.values());
  const unmappedPages = pages.filter((p) => !pageToSide.has(p));
  const unclaimedSides = sides.filter((s) => !claimedSides.has(s.side));
  if (unmappedPages.length > 0 && unmappedPages.length === unclaimedSides.length) {
    unmappedPages.forEach((p, i) => pageToSide.set(p, unclaimedSides[i].side));
  }
  return pageToSide;
}

/**
 * Match OCR-recognized label words against the album's per-side tracklists
 * and produce warn-only advisory check rows. Pure — exported for tests.
 *
 * Each expected side is matched ONLY against the words of its own label
 * face(s) (via assignPagesToSides), so a title printed on the wrong side
 * — e.g. two one-track sides swapped — warns instead of passing. When no
 * page↔side mapping is derivable, matching degrades to the whole file
 * (presence + within-side order only).
 *
 *  - [] when there is nothing to check (no sides assigned, or no confident
 *    words were read — never claim a verification that didn't happen).
 *  - one pass+advisory row when every title was found on its side in
 *    running order.
 *  - warn rows for missing titles, titles on the wrong side, and titles
 *    out of running order.
 */
export function matchTracklistChecks(
  words: OcrWordBox[],
  sides: SideTracklist[],
): CheckResult[] {
  const totalTitles = sides.reduce((n, s) => n + s.titles.length, 0);
  if (totalTitles === 0) return [];
  const seq: SeqWord[] = [];
  for (const w of words) {
    if (w.conf < MIN_MATCH_CONF) continue;
    const norm = normalizeTitleText(w.text).replace(/ /g, "");
    if (!norm) continue;
    seq.push({ norm, page: w.page, index: seq.length });
  }
  if (seq.length === 0) return [];

  const pageToSide = assignPagesToSides(seq, sides);
  // Pages no side claimed (marker mismatch / count mismatch): unbound
  // sides search these rather than the whole file, so a title printed on
  // a page that IS bound to another side never satisfies them.
  const unclaimedWords = seq.filter((w) => !pageToSide.has(w.page));
  // One consumed-index set per distinct matching scope: every accepted
  // match burns its word window, so duplicate expected titles require
  // duplicate printed occurrences.
  const consumedSets = new Map<SeqWord[], Set<number>>();
  const consumedOf = (scope: SeqWord[]): Set<number> => {
    let s = consumedSets.get(scope);
    if (!s) {
      s = new Set();
      consumedSets.set(scope, s);
    }
    return s;
  };

  const missing: string[] = [];
  const wrongSide: Array<{ side: string; title: string }> = [];
  const outOfOrder: Array<{ side: string; title: string }> = [];
  for (const side of sides) {
    const own =
      pageToSide.size > 0 ? seq.filter((w) => pageToSide.get(w.page) === side.side) : [];
    const bound = own.length > 0;
    const scope = bound ? own : pageToSide.size > 0 && unclaimedWords.length > 0 ? unclaimedWords : seq;
    const consumed = consumedOf(scope);
    let prevIndex = -1;
    let prevTitle: string | null = null;
    for (const title of side.titles) {
      const found = findTitleInWords(title, scope, consumed);
      if (!found) {
        // Side-scoped miss: check whether the title exists on ANOTHER
        // side's face — printed on the wrong label side vs absent
        // entirely. (Probe excludes this side's own pages so a same-side
        // duplicate shortfall stays a missing-title warn.)
        const elsewhere = bound ? seq.filter((w) => pageToSide.get(w.page) !== side.side) : [];
        if (elsewhere.length > 0 && findTitleInWords(title, elsewhere)) {
          wrongSide.push({ side: side.side, title });
        } else {
          missing.push(title);
        }
        continue;
      }
      for (let k = found.index; k < found.index + found.size; k++) consumed.add(k);
      if (found.index < prevIndex && prevTitle != null) {
        outOfOrder.push({ side: side.side, title });
      }
      prevIndex = Math.max(prevIndex, found.index);
      prevTitle = title;
    }
  }

  const rows: CheckResult[] = [];
  const q = (t: string) => `\u201c${t}\u201d`;
  if (missing.length > 0) {
    rows.push({
      key: "art.tracklist_missing",
      label: "Tracklist titles (OCR)",
      status: "warn",
      message: `Couldn't find ${missing.map(q).join(", ")} in the label text — a track may be missing from the printed tracklist, or the type wasn't OCR-readable. Verify against the current side order.`,
    });
  }
  if (wrongSide.length > 0) {
    rows.push({
      key: "art.tracklist_side",
      label: "Tracklist sides (OCR)",
      status: "warn",
      message: `${wrongSide.map((o) => `${q(o.title)} (expected on Side ${o.side})`).join(", ")} appear${wrongSide.length === 1 ? "s" : ""} on a different label side than the album's current side assignments — the artwork may list an outdated track order.`,
    });
  }
  if (outOfOrder.length > 0) {
    rows.push({
      key: "art.tracklist_order",
      label: "Tracklist order (OCR)",
      status: "warn",
      message: `${outOfOrder.map((o) => `${q(o.title)} (Side ${o.side})`).join(", ")} appear${outOfOrder.length === 1 ? "s" : ""} in a different order than the album's current running order — the artwork may list an outdated track order.`,
    });
  }
  if (rows.length === 0) {
    rows.push({
      key: "art.tracklist_ocr",
      label: "Tracklist (OCR)",
      status: "pass",
      tier: "advisory",
      message: `All ${totalTitles} track title${totalTitles === 1 ? "" : "s"} were found in the label text on the expected side in the expected running order (OCR read — verify stylized type visually).`,
    });
  }
  return rows;
}
