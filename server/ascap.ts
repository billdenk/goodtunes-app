import fs from "node:fs";
import path from "node:path";

/**
 * ASCAP staging helper.
 *
 * Reads a small filtered slice of the ASCAP catalog at boot — just the rows
 * that touch our current roster (Carter Nickolas, Nebel Beck, Shackle Bryan,
 * Ashba Daren / DJ Ashba) plus full title blocks for the LLT album. The
 * source data is ~2 MB and ships with the repo at server/data/ascap-slice.json.
 *
 * Future artists: extend the slice by re-running the filter against the full
 * ASCAP catalog dump (kept out-of-repo) and committing an updated JSON.
 */

const SLICE_PATH = path.join(process.cwd(), "server", "data", "ascap-slice.json");

type WriterRow = { name: string; shares: string; note: string };
type PublisherRow = { name: string; shares: string; note: string };

type SliceShape = {
  source: string;
  generatedAt: string;
  rosterKeys?: string[];
  titles: Record<
    string,
    { title: string; writers: WriterRow[]; publishers: PublisherRow[] }
  >;
  writerIndex: Record<
    string,
    { displayName: string; titles: { title: string; role: string }[] }
  >;
};

let slice: SliceShape | null = null;

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function loadSlice(): SliceShape | null {
  if (slice) return slice;
  try {
    const raw = fs.readFileSync(SLICE_PATH, "utf-8");
    slice = JSON.parse(raw) as SliceShape;
    return slice;
  } catch (err) {
    console.warn("[ascap] slice not loaded:", (err as Error).message);
    return null;
  }
}

export function ascapStatus(): {
  loaded: boolean;
  titles: number;
  writers: number;
  source?: string;
  generatedAt?: string;
} {
  const s = loadSlice();
  if (!s) return { loaded: false, titles: 0, writers: 0 };
  return {
    loaded: true,
    titles: Object.keys(s.titles).length,
    writers: Object.keys(s.writerIndex).length,
    source: s.source,
    generatedAt: s.generatedAt,
  };
}

export type AscapTitleHit = {
  title: string;
  writers: WriterRow[];
  publishers: PublisherRow[];
  rosterMatches: { name: string }[];
  totalWriters: number;
  totalPublishers: number;
  truncated: boolean;
};

const ROSTER_KEYS = [
  "CARTER NICKOLAS",
  "NEBEL BECK",
  "SHACKLE BRYAN",
  "ASHBA DAREN",
  "DJ ASHBA",
];

function isRosterName(name: string): boolean {
  const up = name.toUpperCase();
  return ROSTER_KEYS.some((k) => up.includes(k));
}

export function lookupTitle(
  title: string,
  opts: { rosterOnly?: boolean; max?: number } = {},
): AscapTitleHit | null {
  const s = loadSlice();
  if (!s) return null;
  const key = norm(title);
  const block = s.titles[key];
  if (!block) return null;

  const rosterMatches = block.writers.filter((w) => isRosterName(w.name));
  const max = opts.max ?? 50;
  let writers = block.writers;
  let publishers = block.publishers;
  let truncated = false;

  if (opts.rosterOnly) {
    // Narrow writers to roster only (possibly empty). Publishers stay full —
    // the slice doesn't carry row-level writer↔publisher association, so we
    // expose the publisher chain as-is and let the admin pick.
    writers = rosterMatches;
  } else if (writers.length > max) {
    writers = writers.slice(0, max);
    truncated = true;
  }
  if (publishers.length > max) {
    publishers = publishers.slice(0, max);
    truncated = true;
  }

  return {
    title: block.title,
    writers,
    publishers,
    rosterMatches: rosterMatches.map((w) => ({ name: w.name })),
    totalWriters: block.writers.length,
    totalPublishers: block.publishers.length,
    truncated,
  };
}

export type AscapWriterHit = {
  query: string;
  matches: {
    displayName: string;
    titles: { title: string; role: string }[];
  }[];
};

export function searchWriter(name: string, limit = 25): AscapWriterHit {
  const s = loadSlice();
  if (!s) return { query: name, matches: [] };
  const q = norm(name);
  if (!q) return { query: name, matches: [] };

  // Two passes: exact norm match first, then loose includes.
  const exact: SliceShape["writerIndex"][string][] = [];
  const loose: SliceShape["writerIndex"][string][] = [];
  for (const [nkey, entry] of Object.entries(s.writerIndex)) {
    if (nkey === q) exact.push(entry);
    else if (
      nkey.includes(q) ||
      q.split(" ").every((part) => nkey.includes(part))
    ) {
      loose.push(entry);
    }
  }
  const matches = [...exact, ...loose].slice(0, limit).map((m) => ({
    displayName: m.displayName,
    titles: m.titles.slice(0, 50),
  }));
  return { query: name, matches };
}
