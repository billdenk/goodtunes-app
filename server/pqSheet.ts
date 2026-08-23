// Task — PQ / cutting-master sheet (Ruby handoff handoff/pq-sheet).
//
// The press's audio-mastering bench needs the Viryl "vinyl mastering cue
// sheet" + MRP's VRMA cutting-master page merged into ONE living surface,
// plus a print twin. This module is the SERVER half:
//
//   • A stateless HMAC token that keys a signed-out public read of ONE
//     album's cutting-master data (same "link IS the credential" model as
//     the estimate /e/:token links, but derived — no DB column added).
//   • buildPqPayload(albumId) — pulls the real album + tracks + file names
//     + catalogue numbers + artist confirmations + side verdicts from the
//     live schema and shapes them exactly as the two mocks expect.
//
// Handoff law: the client mocks (PressPQSheetMRP.tsx / PressPQSheetPdfMRP)
// are copied verbatim; only the MOCK_ consts are swapped for the shape
// this builder returns. Verdict copy + reference ladder mirror the README.
//
// NEVER pre-tick a confirmation the artist hasn't actually made: only
// `mastersApprovedByArtistAt` is stored, so "approved masters" carries
// from that timestamp; "lossless" is DERIVED honestly from the real audio
// format/bit-depth; "consistent levels" has no storage and is shown as
// "Not confirmed" rather than faked.

import { createHmac, timingSafeEqual } from "crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "./db";
import { albums, songs, uploadValidations } from "@shared/schema";
import {
  VINYL_FORMAT_RULES,
  type VinylFormat,
  type VinylSide,
} from "@shared/vinylFormatRules";

const SECRET =
  process.env.SESSION_SECRET ?? "goodtunes-pq-sheet-fallback-dev-key";

// ─── Token ────────────────────────────────────────────────────────────
// tok = base64url(albumId + "." + first 32 hex chars of
//       HMAC_SHA256(SECRET, "pq:" + albumId)). Stateless, deterministic,
//       verified with timingSafeEqual. No DB row — the album id is the
//       subject, the HMAC is the credential.
function b64url(s: string): string {
  return Buffer.from(s, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
function b64urlDecode(s: string): string {
  let t = s.replace(/-/g, "+").replace(/_/g, "/");
  while (t.length % 4) t += "=";
  return Buffer.from(t, "base64").toString("utf8");
}
function sigFor(albumId: string): string {
  return createHmac("sha256", SECRET)
    .update("pq:" + albumId)
    .digest("hex")
    .slice(0, 32);
}

export function signPqToken(albumId: string): string {
  return b64url(`${albumId}.${sigFor(albumId)}`);
}

// Returns the albumId if the token verifies, else null. Constant-time on
// the signature so a tampered HMAC never leaks timing.
export function verifyPqToken(tokenRaw: unknown): string | null {
  const token = String(tokenRaw ?? "").trim();
  if (!token || token.length > 512) return null;
  let decoded: string;
  try {
    decoded = b64urlDecode(token);
  } catch {
    return null;
  }
  const dot = decoded.lastIndexOf(".");
  if (dot <= 0) return null;
  const albumId = decoded.slice(0, dot);
  if (!albumId || albumId.length > 128) return null;
  const provided = decoded.slice(dot + 1);
  const expected = sigFor(albumId);
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;
  return albumId;
}

// ─── Reference ladder + verdict (README: album LP 17/20/25) ────────────
// A full-album LP uses the loud/average/lower ladder verbatim from the
// handoff README. Other formats fall back to their per-side max minutes
// as a single "lower" gate so the verdict copy still reads honestly.
const ALBUM_LP_REF = { loud: 17, average: 20, lower: 25 };

export type SideVerdict = {
  status: "ready" | "warn";
  icon: "check" | "triangle";
  text: string;
};

export function sideVerdict(sec: number, ref = ALBUM_LP_REF): SideVerdict {
  const min = sec / 60;
  if (min <= ref.loud)
    return {
      status: "ready",
      icon: "check",
      text: `Within the loud-level guide (${ref.loud} min) — full-level cut`,
    };
  if (min <= ref.average)
    return {
      status: "ready",
      icon: "check",
      text: `Within the average-level guide (${ref.average} min)`,
    };
  if (min <= ref.lower)
    return {
      status: "warn",
      icon: "triangle",
      text: `Past the average-level guide (${ref.average} min) — expect a slightly quieter cut`,
    };
  return {
    status: "warn",
    icon: "triangle",
    text: `Past the lower-level guide (${ref.lower} min) — talk to the artist before cutting`,
  };
}

// ─── Payload types ─────────────────────────────────────────────────────
export type PqTrack = {
  songId: string;
  no: string; // "A1", "B2", …
  title: string;
  file: string;
  start: string; // "0:00"
  end: string; // "2:32"
  len: string; // "2:32"
  lenSec: number;
  playable: boolean; // true when a Mux playback id exists
};

export type PqSide = {
  side: string; // "A", "B", …
  tracks: PqTrack[];
  totalSec: number;
  total: string;
  verdict: SideVerdict;
};

export type PqConfirmation = {
  key: "lossless" | "levels" | "approved";
  label: string;
  confirmed: boolean;
};

export type PqPayload = {
  album: string;
  artist: string;
  press: string | null;
  project: string;
  date: string;
  format: string;
  formatKind: "album_lp" | "other";
  catalog: string;
  matrix: string;
  gap: string;
  cutSpeed: string;
  confirmations: PqConfirmation[];
  sides: PqSide[];
  reference: typeof ALBUM_LP_REF;
  notes: string | null;
  tokenLink: string; // "<host>/pq/<token>"
};

// ─── Helpers ───────────────────────────────────────────────────────────
const fmtMin = (sec: number) =>
  `${Math.floor(sec / 60)}:${String(Math.round(sec) % 60).padStart(2, "0")}`;

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// Catalogue stem — mirrors client/src/components/admin/VinylOrderPanel.tsx
// so the sheet matches the live Side Breaks page exactly.
function catalogStem(title: string | undefined): string {
  if (!title || !title.trim()) return "ALBUM";
  const words = title.trim().split(/\s+/);
  if (words.length === 1) return words[0];
  return words.map((w) => w[0].toUpperCase()).join("");
}
function suggestCatalogNumber(title: string | undefined, side: string): string {
  return `${catalogStem(title)}-001-${side}`;
}

// Tail of a URL → filename, decoded.
function fileFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const clean = url.split("?")[0].split("#")[0];
  const tail = clean.substring(clean.lastIndexOf("/") + 1);
  if (!tail) return null;
  try {
    return decodeURIComponent(tail);
  } catch {
    return tail;
  }
}

// Lossless if the served OR original master is a lossless container.
const LOSSLESS = new Set(["flac", "wav", "wave", "aif", "aiff", "alac"]);
function isLossless(s: any): boolean {
  const fmts = [s.audio_format, s.audio_source_format]
    .filter(Boolean)
    .map((f: string) => f.toLowerCase());
  const bitDepth = Number(s.audio_source_bit_depth ?? s.audio_bit_depth ?? 0);
  return bitDepth > 0 && fmts.some((f) => LOSSLESS.has(f));
}

function albumLpRefFor(vinylFormat: VinylFormat | null): {
  ref: typeof ALBUM_LP_REF;
  kind: "album_lp" | "other";
} {
  // The README ladder is the full-album 12" 33⅓ LP. Single/double LP use
  // it verbatim; other cuts derive a single "lower" gate off the per-side
  // max so the verdict language still applies.
  if (!vinylFormat || vinylFormat === "12_33_single" || vinylFormat === "12_33_double")
    return { ref: ALBUM_LP_REF, kind: "album_lp" };
  const rule = VINYL_FORMAT_RULES[vinylFormat];
  const max = rule?.maxMinutesPerSide ?? ALBUM_LP_REF.lower;
  return {
    ref: {
      loud: Math.max(1, Math.round(max * 0.68)),
      average: Math.max(1, Math.round(max * 0.8)),
      lower: max,
    },
    kind: "other",
  };
}

function formatLabel(physical: string | null, vinylFormat: VinylFormat | null): string {
  if (vinylFormat && VINYL_FORMAT_RULES[vinylFormat])
    return VINYL_FORMAT_RULES[vinylFormat].label;
  switch (physical) {
    case "double_lp":
      return '12" · 33⅓ rpm · 2 LP';
    case "seven_inch":
      return '7" · 45 rpm';
    case "cassette":
      return "Cassette";
    case "cd":
      return "CD";
    case "single_lp":
    default:
      return '12" · 33⅓ rpm · 1 LP';
  }
}

// ─── Builder ───────────────────────────────────────────────────────────
// Loads the album by id and shapes the sanitized PQ payload. Returns null
// when the album doesn't exist. `origin` = "https://host" for the footer /
// online link. `gapSeconds` defaults to 2 (README: fixed 2s gap unless the
// album stores one — no such column today, so always 2).
export async function buildPqPayload(
  albumId: string,
  origin: string,
  token: string,
  gapSeconds = 2,
): Promise<PqPayload | null> {
  const [album] = await db
    .select()
    .from(albums)
    .where(eq(albums.id, albumId))
    .limit(1);
  if (!album) return null;

  const rows = await db.execute<any>(sql`
    SELECT id, title, track_number, duration, vinyl_side, vinyl_order,
           audio_url, audio_source_url, audio_format, audio_source_format,
           audio_bit_depth, audio_source_bit_depth,
           audio_sample_rate, audio_source_sample_rate,
           mux_playback_id, mux_status
    FROM songs
    WHERE album_id = ${albumId}
    ORDER BY track_number ASC
  `);
  const songRows: any[] = (rows as any).rows ?? [];

  // File names from upload_validations (per uploaded master), fall back to
  // the tail of the source/served URL.
  const uv = await db
    .select({
      id: uploadValidations.id,
      assetUrl: uploadValidations.assetUrl,
      fileName: uploadValidations.fileName,
    })
    .from(uploadValidations)
    .where(
      and(eq(uploadValidations.albumId, albumId), eq(uploadValidations.kind, "audio")),
    );
  // upload_validations has no song_id FK; match its file name by URL tail
  // when possible, else leave the per-song URL-derived name.
  const uvNames = uv.map((r) => r.fileName).filter(Boolean) as string[];
  const uvNameByAsset = new Map(
    uv
      .filter((r) => r.fileName)
      .map((r) => [String(r.assetUrl), String(r.fileName)]),
  );

  const vinylFormat = (album.vinylFormat ?? null) as VinylFormat | null;
  const sideCatalog =
    (album.vinylSideCatalogNumbers as Record<string, string> | null) ?? {};

  // Group songs by side. Fall back to a single "A" side when the album has
  // no vinyl side data (keeps the sheet honest for any album).
  const rule = vinylFormat ? VINYL_FORMAT_RULES[vinylFormat] : null;
  const sideOrder: VinylSide[] = rule ? rule.sides : ["A", "B"];
  const bucket: Record<string, any[]> = {};
  const usedSides = new Set<string>();
  for (const s of songRows) {
    const side = (s.vinyl_side as string) || "A";
    (bucket[side] ??= []).push(s);
    usedSides.add(side);
  }
  // Deterministic order within each side: vinyl_order, else track_number.
  for (const side of Object.keys(bucket)) {
    bucket[side].sort((a, b) => {
      const oa = a.vinyl_order ?? a.track_number;
      const ob = b.vinyl_order ?? b.track_number;
      if (oa !== ob) return oa - ob;
      return (a.track_number ?? 0) - (b.track_number ?? 0);
    });
  }

  const { ref, kind } = albumLpRefFor(vinylFormat);

  const orderedSides = [
    ...sideOrder.filter((s) => usedSides.has(s)),
    ...Array.from(usedSides).filter((s) => !sideOrder.includes(s as VinylSide)).sort(),
  ];

  const sides: PqSide[] = orderedSides.map((side) => {
    const items = bucket[side] ?? [];
    let cursor = 0;
    const tracks: PqTrack[] = items.map((s, i) => {
      const lenSec = Math.max(0, Math.round(Number(s.duration) || 0));
      const start = cursor;
      const end = start + lenSec;
      cursor = end + gapSeconds; // fixed gap between tracks
      const urlName =
        fileFromUrl(s.audio_source_url) ?? fileFromUrl(s.audio_url) ?? null;
      // Prefer an upload_validations file name whose stem matches, else the
      // URL tail, else a synthesized readable name.
      const uvMatch =
        uvNameByAsset.get(String(s.audio_source_url ?? "")) ??
        uvNameByAsset.get(String(s.audio_url ?? "")) ??
        uvNames.find(
          (n) => urlName && n && n.toLowerCase() === urlName.toLowerCase(),
        );
      const file =
        uvMatch ?? urlName ?? `${String(i + 1).padStart(2, "0")}_${s.title}`;
      return {
        songId: s.id,
        no: `${side}${i + 1}`,
        title: s.title,
        file,
        start: fmtMin(start),
        end: fmtMin(end),
        len: fmtMin(lenSec),
        lenSec,
        playable: !!s.mux_playback_id && s.mux_status === "ready",
      };
    });
    const totalSec = tracks.reduce((a, t) => a + t.lenSec, 0);
    return {
      side,
      tracks,
      totalSec,
      total: fmtMin(totalSec),
      verdict: sideVerdict(totalSec, ref),
    };
  });

  // Catalogue / matrix per side — operator override, else suggestion.
  const catalogFor = (side: string) =>
    sideCatalog[side] ?? suggestCatalogNumber(album.title, side);
  const primary = catalogStem(album.title) + "-001";
  const matrix = orderedSides.map((s) => catalogFor(s)).join(" / ") || primary;

  // Artist confirmations — README rule: never pre-tick.
  const approved = !!album.mastersApprovedByArtistAt;
  const allLossless =
    songRows.length > 0 && songRows.every((s) => isLossless(s));
  const sourceFormat = (s: any) =>
    String(s.audio_source_format ?? s.audio_format ?? "").toUpperCase();
  const sourceBitDepth = (s: any) =>
    Number(s.audio_source_bit_depth ?? s.audio_bit_depth ?? 0);
  const sourceSampleRate = (s: any) =>
    Number(s.audio_source_sample_rate ?? s.audio_sample_rate ?? 0);
  const formats = new Set(songRows.map(sourceFormat).filter(Boolean));
  const bitDepths = new Set(songRows.map(sourceBitDepth).filter(Boolean));
  const sampleRates = new Set(songRows.map(sourceSampleRate).filter(Boolean));
  const losslessLabel = (() => {
    if (!allLossless) return "Lossless masters — not confirmed";
    const f = formats.size === 1 ? Array.from(formats)[0] : "lossless";
    const depth =
      bitDepths.size === 1 ? `, ${Array.from(bitDepths)[0]}-bit` : "";
    // Render a real, concise format sentence only when each value is
    // actually uniform. Mixed source formats stay honest.
    const onlyRate =
      sampleRates.size === 1 ? Array.from(sampleRates)[0] : null;
    const rateText = onlyRate ? ` / ${onlyRate / 1000}kHz` : "";
    const consistency =
      formats.size === 1 && bitDepths.size === 1 && sampleRates.size === 1
        ? ", same format throughout"
        : "";
    return `All masters are lossless ${f}${depth}${rateText}${consistency}`;
  })();
  const confirmations: PqConfirmation[] = [
    {
      key: "lossless",
      label: losslessLabel,
      confirmed: allLossless,
    },
    {
      key: "levels",
      // No storage exists for this confirmation — show honestly.
      label: "Volume levels are consistent between tracks — not confirmed",
      confirmed: false,
    },
    {
      key: "approved",
      label: approved
        ? "Artist approved the masters as supplied — cut to match"
        : "Artist approval of masters — not confirmed",
      confirmed: approved,
    },
  ];

  return {
    album: album.title,
    artist: album.artist,
    press: null, // filled by the route from the assigned press if present
    project: album.id,
    date: fmtDate(new Date()),
    format: formatLabel(album.physicalFormat ?? null, vinylFormat),
    formatKind: kind,
    catalog: catalogFor(orderedSides[0] ?? "A").replace(/-[A-D]$/, ""),
    matrix,
    gap: `${gapSeconds} second${gapSeconds === 1 ? "" : "s"}`,
    cutSpeed: vinylFormat === "12_45" || vinylFormat === "7_45" ? "45 rpm" : "33⅓ rpm",
    confirmations,
    sides,
    reference: ref,
    notes: null,
    tokenLink: `${origin.replace(/\/$/, "")}/pq/${token}`,
  };
}
