import { useMemo, useState, type ReactNode } from "react";
import { isDisplayRole } from "@/lib/creditSubtitle";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
  SheetShell,
  PerformerProfileContent,
  usePersonGearDrilldown,
  resolveStaticInstrument,
  personProfileIsRich,
  type RigDetailView,
} from "@/pages/AlbumDetail";
import { SheetClose, SheetBack, SHEET_TOP_FADE } from "@/components/ui/SheetChrome";
import { scrimFade } from "@/lib/motion";
import { track } from "@/lib/analytics";
import type {
  Album,
  Person,
  Song,
  Instrument,
  TrackCredits,
  TrackPerformer,
} from "@/data/musicData";

/* Minimal slice of GET /api/people/:id/profile — just the fields the credits
   list needs to decide whether a person is worth linking to (a real profile)
   vs. a name + photo dead-end. */
type PersonProfileLite = {
  person?: { bio?: string | null } | null;
  tracks?: Array<{ instrumentId?: string | null; albumId?: string | null }>;
};

export type AlbumCreditsPerson = {
  id: string;
  name: string;
  photoUrl?: string | null;
};

/* A Rig attached to a track — the artist's named gear setup (base instrument
   + accessory entries) plus an optional per-take tweak note. Shape mirrors
   the TrackRigWithDetail payload from GET /api/songs/:id/credits. */
export type SongRig = {
  id: string;
  rigName: string;
  tweakNote?: string | null;
  rig?: {
    id: string;
    name: string;
    notes?: string | null;
    instrument?: Instrument | null;
    accessories?: Array<{
      id: string;
      type: string;
      value: string;
      /* When set, the accessory is itself a catalog instrument the fan can
         open (its own gear sheet); free-text accessories leave it null. */
      instrumentId?: string | null;
    }>;
  } | null;
};

export type AlbumCreditsRow = {
  id: string;
  personId?: string | null;
  name: string;
  role: string;
  person: AlbumCreditsPerson | null;
  /* Performer rows carry the instrument they played so the per-song "On this
     track" doors can link a performer to their matching rig (rig↔performer
     join is purely instrumentId; trackRigs have no personId). Writer /
     production rows leave it undefined. */
  instrumentId?: string | null;
};

/* Full credits payload as returned by GET /api/albums/:id/credits — the
   per-song writers/performers plus the album-level production rows. The
   credits surface aggregates all three into Apple's broad groups. */
export type AlbumCreditsPayload = {
  bySongId?: Record<
    string,
    { writers?: AlbumCreditsRow[]; performers?: AlbumCreditsRow[] } | undefined
  >;
  production?: AlbumCreditsRow[];
};

type CreditEntry = {
  key: string;
  name: string;
  personId: string | null;
  photoUrl: string | null;
  /* Apple shows each person's specific role(s) as a subtitle under the name
     (e.g. "Vocals, Bass Guitar"). We dedupe a person within a group and join
     their distinct roles in first-seen order. */
  subtitle: string;
};

type CreditGroup = { title: string; entries: CreditEntry[] };

/* The Apple-song-page header shown above a *per-track* credits surface (the
   album-credits surface keeps its quiet eyebrow/title/subtitle header). Carries
   everything the song header needs: the artwork, the song title, the
   artist · album · date line (album name is a tappable link back to the album),
   and a Play/Pause control that toggles just this one song. */
export type CreditsSongHeader = {
  artwork?: string | null;
  songTitle: string;
  artistName: string;
  albumName: string;
  /* e.g. a release year — appended after the album name when present. */
  dateLabel?: string;
  /* True when THIS song is the one currently playing (flips Play → Pause). */
  isPlaying: boolean;
  onTogglePlay: () => void;
  /* Tapping the album name returns the fan to the album (the credits surface
     was opened from it, so this is just the surface's own close). */
  onOpenAlbum: () => void;
};

/* The profile a credit row drills into — uniform across the mobile sheet and
   the desktop page so the shared slider can host either. The mobile surface
   resolves a real Person plus the contextual song lead-in (so the profile
   opens on the track they played on); the desktop surface synthesizes a
   minimal Person from the credit entry and opens About-first with no track
   context. */
export type CreditsPersonView = {
  person: Person;
  role?: string;
  song?: Song;
  selectedCreditId?: string;
  currentSongCredits: TrackCredits | undefined;
  otherTracks: Array<{ song: Song; performer: TrackPerformer }>;
};

function initialsOf(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/* Collapse a flat list of credit rows into one entry per person, collecting
   their distinct roles (preserving first-seen order) into the subtitle. */
function aggregateRows(rows: AlbumCreditsRow[]): CreditEntry[] {
  const order: string[] = [];
  const byKey = new Map<
    string,
    { name: string; personId: string | null; photoUrl: string | null; roles: string[] }
  >();
  for (const r of rows) {
    const personId = r.person?.id ?? r.personId ?? null;
    const name = r.person?.name ?? r.name;
    const photoUrl = r.person?.photoUrl ?? null;
    const key = personId ?? `name:${name.trim().toLowerCase()}`;
    let entry = byKey.get(key);
    if (!entry) {
      entry = { name, personId, photoUrl, roles: [] };
      byKey.set(key, entry);
      order.push(key);
    }
    if (!entry.photoUrl && photoUrl) entry.photoUrl = photoUrl;
    const role = (r.role ?? "").trim();
    if (role && isDisplayRole(role) && !entry.roles.includes(role)) entry.roles.push(role);
  }
  return order.map((key) => {
    const e = byKey.get(key)!;
    return {
      key,
      name: e.name,
      personId: e.personId,
      photoUrl: e.photoUrl,
      subtitle: e.roles.join(", "),
    };
  });
}

/* Build Apple's three broad credit groups from the full credits payload:
   Performing Artists (track performers), Composition & Lyrics (track
   writers), and Production & Engineering (album-level production). Empty
   groups are dropped so a section heading never renders without entries. */
export function buildAlbumCreditGroups(
  credits: AlbumCreditsPayload | undefined,
): CreditGroup[] {
  if (!credits) return [];
  const performers: AlbumCreditsRow[] = [];
  const writers: AlbumCreditsRow[] = [];
  for (const song of Object.values(credits.bySongId ?? {})) {
    if (song?.performers) performers.push(...song.performers);
    if (song?.writers) writers.push(...song.writers);
  }
  const groups: CreditGroup[] = [];
  const performing = aggregateRows(performers);
  if (performing.length) groups.push({ title: "Performing Artists", entries: performing });
  const composition = aggregateRows(writers);
  if (composition.length)
    groups.push({ title: "Composition & Lyrics", entries: composition });
  const production = aggregateRows(credits.production ?? []);
  if (production.length)
    groups.push({ title: "Production & Engineering", entries: production });
  return groups;
}

/* Circular photo (or initials fallback) for a credit row. */
function CreditAvatar({ e }: { e: CreditEntry }) {
  if (e.photoUrl) {
    return (
      <img
        src={e.photoUrl}
        alt=""
        style={{ width: 40, height: 40 }}
        className="rounded-full object-cover flex-shrink-0"
      />
    );
  }
  /* No photo → a solid brand-blue circle with white initials so the row reads
     as an avatar, not two stray letters floating on the navy bg. Mirrors the
     admin Edit-Profile initials treatment (brand-blue fill + white initials). */
  return (
    <span
      aria-hidden
      style={{ width: 40, height: 40 }}
      className="rounded-full bg-[var(--brand-blue)] flex-shrink-0 inline-flex items-center justify-center text-xs font-semibold text-white"
    >
      {initialsOf(e.name)}
    </span>
  );
}

/* Name + wrapping role-subtitle. Shared by the tappable and plain rows. */
function CreditLabel({ e }: { e: CreditEntry }) {
  return (
    <span className="flex-1 min-w-0 py-3">
      <span className="block truncate text-fan-primary text-base font-semibold leading-tight tracking-[-0.01em]">
        {e.name}
      </span>
      {e.subtitle && (
        <span className="block text-sm leading-snug text-fan-secondary mt-0.5">
          {e.subtitle}
        </span>
      )}
    </span>
  );
}

/* Trailing chevron — the *only* affordance that signals a row leads somewhere.
   It appears on tappable (rich-profile) rows and is omitted entirely on dead
   rows (no disabled/greyed caret), matching Apple Music: the presence or
   absence of the chevron is itself the "is there more here?" indicator. */
function RowChevron() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-fan-faint flex-shrink-0 ml-1"
      aria-hidden="true"
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function CreditButton({
  e,
  onOpenPerson,
}: {
  e: CreditEntry;
  onOpenPerson: (personId: string, role: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpenPerson(e.personId!, e.subtitle)}
      className="w-full flex items-center gap-3 px-4 text-left transition-colors hover:bg-white/[0.04] active:bg-white/[0.06]"
      data-testid={`link-album-credit-person-${e.personId}`}
    >
      <CreditAvatar e={e} />
      <CreditLabel e={e} />
      <RowChevron />
    </button>
  );
}

function CreditPlainRow({ e }: { e: CreditEntry }) {
  return (
    <div
      className="flex items-center gap-3 px-4"
      data-testid={`text-album-credit-${e.key}`}
    >
      <CreditAvatar e={e} />
      <CreditLabel e={e} />
    </div>
  );
}

/* Tappable only when the person has a real profile to open. Loads the
   lightweight profile and renders a plain (dead) row until it's proven rich —
   a bio, any gear, or a track on another album. People who are just a name +
   photo (session players, assistant engineers) stay non-tappable instead of
   dead-ending on an empty page (matches Apple Music). The profile query is
   shared with the in-place person view, so opening a rich person is instant. */
function GatedCreditEntry({
  e,
  currentAlbumId,
  onOpenPerson,
}: {
  e: CreditEntry;
  currentAlbumId?: string;
  onOpenPerson: (personId: string, role: string) => void;
}) {
  const { data } = useQuery<PersonProfileLite>({
    queryKey: ["/api/people", e.personId, "profile"],
    enabled: !!e.personId,
  });
  if (personProfileIsRich(data, currentAlbumId)) {
    return <CreditButton e={e} onOpenPerson={onOpenPerson} />;
  }
  return <CreditPlainRow e={e} />;
}

/* Apple's song-page header for a per-track credits surface: centered artwork,
   song title, an artist · album · date line whose album name links back to the
   album, and a Play/Pause control that toggles just this one song. Rendered in
   GoodTunes' palette (navy bg inherited, white Play pill, brand-blue album
   link) instead of Apple's light theme. */
function SongCreditHeader({ h }: { h: CreditsSongHeader }) {
  return (
    <div className="px-5 flex flex-col items-center text-center">
      {h.artwork && (
        <img
          src={h.artwork}
          alt=""
          className="w-40 h-40 rounded-2xl object-cover"
          style={{ boxShadow: "0 16px 40px rgba(0,0,0,0.45)" }}
          data-testid="img-song-credits-art"
        />
      )}
      <h2
        className="mt-4 text-fan-primary text-2xl font-bold leading-tight tracking-tight"
        data-testid="text-song-credits-title"
      >
        {h.songTitle}
      </h2>
      <p className="mt-1.5 text-fan-secondary text-base leading-snug">
        <span>{h.artistName}</span>
        <span aria-hidden className="px-1.5">
          ·
        </span>
        <button
          type="button"
          onClick={h.onOpenAlbum}
          className="text-fan-secondary hover:text-[color:var(--brand-blue)] hover:underline underline-offset-2 transition-colors"
          data-testid="link-song-credits-album"
        >
          {h.albumName}
        </button>
        {h.dateLabel && (
          <>
            <span aria-hidden className="px-1.5">
              ·
            </span>
            <span>{h.dateLabel}</span>
          </>
        )}
      </p>
      <button
        type="button"
        onClick={h.onTogglePlay}
        className="mt-5 inline-flex items-center justify-center gap-2.5 h-12 px-10 rounded-full font-semibold text-base active:scale-[0.97] transition-transform"
        style={{ background: "#fff", color: "var(--brand-bg)" }}
        aria-label={h.isPlaying ? "Pause song" : "Play song"}
        data-testid="button-song-credits-play"
      >
        {h.isPlaying ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="currentColor"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          >
            <path d="M8 5.14v14l11-7-11-7z" />
          </svg>
        )}
        {h.isPlaying ? "Pause" : "Play"}
      </button>
    </div>
  );
}

/* Apple-Music-style grouped credits — a small-caps role label over a single
   quiet dark rounded card ("pill") per group. There are NO bright white
   horizontal rules: groups are separated by spacing and rows are grouped by
   the dark card alone. Shared by the mobile sheet and the desktop page.
   `multiColumn` (per-track tablet/desktop) flows the role groups into two
   balanced CSS columns the way Apple's iPad credits page does; mobile leaves it
   off and stays single-column. */
function CreditsList({
  groups,
  onOpenPerson,
  currentAlbumId,
  multiColumn = false,
}: {
  groups: CreditGroup[];
  onOpenPerson: (personId: string, role: string) => void;
  currentAlbumId?: string;
  multiColumn?: boolean;
}) {
  if (groups.length === 0) {
    return (
      <div className="px-5 pb-4 text-fan-secondary text-sm">
        Production credits for this album haven't been published yet.
      </div>
    );
  }
  return (
    <div
      className={
        multiColumn
          ? "px-4 pb-4 sm:[column-count:2] sm:[column-gap:1.25rem]"
          : "px-4 pb-4"
      }
    >
      {groups.map((group, groupIdx) => (
        <section
          key={group.title}
          className={
            multiColumn
              ? "break-inside-avoid mb-7"
              : groupIdx === 0
                ? ""
                : "mt-8"
          }
          data-testid={`row-album-credit-role-${group.title
            .replace(/\s+/g, "-")
            .toLowerCase()}`}
        >
          {/* Apple's Credits card uses a calm Title-Case section header (not a
              tiny tracked all-caps label) above each role group. */}
          <h3 className="px-1 mb-2.5 text-fan-secondary text-base font-semibold tracking-[-0.005em]">
            {group.title}
          </h3>
          <div className="rounded-2xl bg-white/[0.04] overflow-hidden">
            {group.entries.map((e) => {
              if (e.personId) {
                return (
                  <GatedCreditEntry
                    key={e.key}
                    e={e}
                    currentAlbumId={currentAlbumId}
                    onOpenPerson={onOpenPerson}
                  />
                );
              }
              return <CreditPlainRow key={e.key} e={e} />;
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

/* ── "On this track" gear doors ──────────────────────────────────────────
   The per-song credits surface leads with the performers as *gear doors*
   (mockup gear-rig-cards/SongInstruments): a small instrument-family glyph,
   the player's name, a "{role} · {gear}" subtitle, and — when their
   instrument matches a named rig — a "Rig ›" affordance that opens the full
   rig. Performers with no rig but a rich profile open their person page; the
   rest are plain rows. Writers + album production follow as quiet grouped
   rows (CreditsList) so "who played" stays the headline. */

/* Map an instrument family to the small line glyph shown in the gear-door
   tile (guitar / bass / drums / keys / vocals), falling back to a generic
   gear glyph for anything unrecognized. Mirrors the canvas mockup icons. */
function gearIconFor(category?: string | null): ReactNode {
  const c = (category ?? "").toLowerCase();
  const svg = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (/\bbass\b/.test(c)) {
    return (
      <svg {...svg}>
        <path d="M9 17 V6 l9 -2 V15" />
        <circle cx="6.5" cy="17.5" r="2.5" />
        <circle cx="15.5" cy="15.5" r="2.5" />
      </svg>
    );
  }
  if (/guitar|string|banjo|mandolin|ukulele/.test(c)) {
    return (
      <svg {...svg}>
        <path d="M14 4 l6 6 -8 8 a3 3 0 1 1 -4 -4 z M4 20 l4 -4" />
      </svg>
    );
  }
  if (/drum|perc|cymbal/.test(c)) {
    return (
      <svg {...svg}>
        <ellipse cx="12" cy="7" rx="8" ry="3" />
        <path d="M4 7 V15 a8 3 0 0 0 16 0 V7" />
      </svg>
    );
  }
  if (/key|piano|synth|organ|wurli|rhodes|mellotron|clav/.test(c)) {
    return (
      <svg {...svg}>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M8 5 V19 M13 5 V19 M18 5 V19" strokeWidth={1.2} />
      </svg>
    );
  }
  if (/vocal|voice|sing|mic|choir/.test(c)) {
    return (
      <svg {...svg}>
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M6 11 a6 6 0 0 0 12 0 M12 17 v4 M9 21 h6" />
      </svg>
    );
  }
  return (
    <svg {...svg}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="12" r="3" />
      <path d="M16 8 h2 M16 12 h2 M16 16 h2" />
    </svg>
  );
}

/* The per-song "On this track" view fed into CreditsSlider: the raw performer
   rows (so two performers sharing one instrument BOTH appear — no person
   dedupe), the track's named rigs, the quiet writers/production groups, and
   the callback that resolves + opens a rig at tap time. */
export type CreditsSongView = {
  performers: AlbumCreditsRow[];
  rigs: SongRig[];
  textGroups: CreditGroup[];
  onOpenRig: (
    rig: SongRig,
    ctx: { performerName?: string; performerPhotoUrl?: string | null },
  ) => void;
};

/* Shared gear-door chrome: a 40×40 glyph tile (mint on the first/highlighted
   row, brand-blue otherwise), a name + subtitle block, and an optional
   trailing affordance. Rendered as a button when tappable, a plain div
   otherwise. */
function GearDoorShell({
  icon,
  highlight,
  name,
  subtitle,
  trailing,
  onClick,
  testId,
}: {
  icon: ReactNode;
  highlight: boolean;
  name: string;
  subtitle?: string;
  trailing?: ReactNode;
  onClick?: () => void;
  testId: string;
}) {
  const Tag: any = onClick ? "button" : "div";
  return (
    <Tag
      {...(onClick ? { type: "button", onClick } : {})}
      className={`w-full flex items-center gap-3.5 rounded-2xl p-[13px] text-left border border-white/10 ${
        onClick ? "active:opacity-80 transition-opacity" : ""
      }`}
      style={{
        background: highlight
          ? "linear-gradient(135deg, rgba(49,158,216,0.16), rgba(127,16,167,0.16))"
          : "rgba(255,255,255,0.06)",
      }}
      data-testid={testId}
    >
      <span
        className="w-10 h-10 rounded-[10px] flex-shrink-0 inline-flex items-center justify-center"
        style={{
          background: "rgba(255,255,255,0.06)",
          color: highlight ? "var(--brand-mint)" : "var(--brand-blue)",
        }}
      >
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block truncate text-[15.5px] font-bold tracking-[-0.01em] text-fan-primary leading-tight">
          {name}
        </span>
        {subtitle && (
          <span className="block truncate text-[13px] text-fan-secondary mt-0.5">
            {subtitle}
          </span>
        )}
      </span>
      {trailing}
    </Tag>
  );
}

/* The "Rig ›" trailing affordance (brand-blue label + chevron). */
function RigTrailing() {
  return (
    <span
      className="inline-flex items-center gap-[3px] text-[13px] font-semibold flex-shrink-0"
      style={{ color: "var(--brand-blue)" }}
    >
      Rig
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M9 6l6 6-6 6" />
      </svg>
    </span>
  );
}

/* One performer's gear door. Whole-row tap opens: the matched RIG when this
   performer's instrument links to a named rig ("Rig ›"); else the PERSON
   profile when they have a rich profile (person chevron); else nothing
   (plain, non-tappable row). The rich-profile probe only runs on the
   person-fallback path (a rig-having row never needs it). */
function SongPerformerDoor({
  perf,
  rig,
  highlight,
  currentAlbumId,
  resolveInstrument,
  onOpenRig,
  onOpenPerson,
}: {
  perf: AlbumCreditsRow;
  rig?: SongRig;
  highlight: boolean;
  currentAlbumId?: string;
  resolveInstrument: (instrumentId?: string) => Instrument | undefined;
  onOpenRig: CreditsSongView["onOpenRig"];
  onOpenPerson: (personId: string, role: string) => void;
}) {
  const inst = perf.instrumentId ? resolveInstrument(perf.instrumentId) : undefined;
  const gearName = rig?.rig?.instrument?.name ?? inst?.name;
  const category = inst?.shortCategory ?? inst?.category ?? rig?.rig?.instrument?.category;
  const subtitle = gearName ? `${perf.role} · ${gearName}` : perf.role;
  const icon = gearIconFor(category);

  // Only probe the profile on the person-fallback path — a rig-having row
  // opens the rig regardless of how rich the person is.
  const { data } = useQuery<PersonProfileLite>({
    queryKey: ["/api/people", perf.personId, "profile"],
    enabled: !rig && !!perf.personId,
  });
  const personRich = !rig && !!perf.personId && personProfileIsRich(data, currentAlbumId);

  if (rig) {
    return (
      <GearDoorShell
        icon={icon}
        highlight={highlight}
        name={perf.name}
        subtitle={subtitle}
        trailing={<RigTrailing />}
        onClick={() =>
          onOpenRig(rig, {
            performerName: perf.name,
            performerPhotoUrl: perf.person?.photoUrl ?? null,
          })
        }
        testId={`door-rig-${rig.id}`}
      />
    );
  }
  if (personRich) {
    return (
      <GearDoorShell
        icon={icon}
        highlight={highlight}
        name={perf.name}
        subtitle={subtitle}
        trailing={<RowChevron />}
        onClick={() => onOpenPerson(perf.personId!, perf.role)}
        testId={`door-performer-${perf.personId}`}
      />
    );
  }
  return (
    <GearDoorShell
      icon={icon}
      highlight={highlight}
      name={perf.name}
      subtitle={subtitle}
      testId={`row-performer-${perf.id}`}
    />
  );
}

/* An orphan rig — a named rig whose base instrument matches no performer on
   the track. Rendered as a personless door at the END of "On this track"
   (title = rig name, subtitle = the base instrument). */
function SongOrphanRigDoor({
  tr,
  resolveInstrument,
  onOpenRig,
}: {
  tr: SongRig;
  resolveInstrument: (instrumentId?: string) => Instrument | undefined;
  onOpenRig: CreditsSongView["onOpenRig"];
}) {
  const baseId = tr.rig?.instrument?.id;
  const base = baseId ? resolveInstrument(baseId) ?? tr.rig?.instrument : tr.rig?.instrument;
  const category = base?.shortCategory ?? base?.category;
  return (
    <GearDoorShell
      icon={gearIconFor(category)}
      highlight={false}
      name={tr.rigName || tr.rig?.name || "Rig"}
      subtitle={base?.name ?? undefined}
      trailing={<RigTrailing />}
      onClick={() => onOpenRig(tr, {})}
      testId={`door-rig-${tr.rig?.id ?? tr.id}`}
    />
  );
}

/* The full per-song credits body: the "On this track" gear doors (performers
   then orphan rigs) + helper line, then the quiet writers / production
   groups. Replaces the album-style flat CreditsList for per-track surfaces. */
function SongTrackCredits({
  songView,
  currentAlbumId,
  resolveInstrument,
  onOpenPerson,
  multiColumn,
}: {
  songView: CreditsSongView;
  currentAlbumId?: string;
  resolveInstrument: (instrumentId?: string) => Instrument | undefined;
  onOpenPerson: (personId: string, role: string) => void;
  multiColumn?: boolean;
}) {
  const { performers, rigs, textGroups, onOpenRig } = songView;
  // A performer matches a rig purely by instrumentId (rigs carry no personId).
  // Two performers sharing an instrument both match the same rig → "Rig ›" on
  // both (no dedupe). A rig matching no performer is an orphan, shown last.
  const rigFor = (perf: AlbumCreditsRow): SongRig | undefined =>
    perf.instrumentId
      ? rigs.find((tr) => !!tr.rig && tr.rig.instrument?.id === perf.instrumentId)
      : undefined;
  const matchedRigIds = new Set<string>();
  for (const perf of performers) {
    const r = rigFor(perf);
    if (r?.rig) matchedRigIds.add(r.rig.id);
  }
  const orphanRigs = rigs.filter((tr) => tr.rig && !matchedRigIds.has(tr.rig.id));
  const hasTrackSection = performers.length > 0 || orphanRigs.length > 0;

  return (
    <>
      {hasTrackSection && (
        <section data-testid="section-on-this-track">
          <h3 className="px-5 mb-3 text-fan-primary text-[22px] font-extrabold tracking-tight">
            On this track
          </h3>
          <div className="px-5 flex flex-col gap-2.5">
            {performers.map((perf, i) => (
              <SongPerformerDoor
                key={perf.id}
                perf={perf}
                rig={rigFor(perf)}
                highlight={i === 0}
                currentAlbumId={currentAlbumId}
                resolveInstrument={resolveInstrument}
                onOpenRig={onOpenRig}
                onOpenPerson={onOpenPerson}
              />
            ))}
            {orphanRigs.map((tr) => (
              <SongOrphanRigDoor
                key={tr.id}
                tr={tr}
                resolveInstrument={resolveInstrument}
                onOpenRig={onOpenRig}
              />
            ))}
          </div>
          <p className="px-5 mt-3.5 text-[13px] text-fan-secondary leading-snug">
            Tap a player to open their full rig — every instrument, amp and pedal,
            shoppable from one place.
          </p>
        </section>
      )}
      {textGroups.length > 0 && (
        <div className={hasTrackSection ? "mt-8" : ""}>
          <CreditsList
            groups={textGroups}
            onOpenPerson={onOpenPerson}
            currentAlbumId={currentAlbumId}
            multiColumn={multiColumn}
          />
        </div>
      )}
    </>
  );
}

const SLIDE_SPRING = { type: "spring", stiffness: 420, damping: 44, mass: 0.9 } as const;

/* The shared list ↔ person slider. Holds no state of its own — both the mobile
   sheet and the desktop page own `selected` + the gear sub-stack and pass them
   down so the chrome (sheet shell vs. full page) stays the host's concern.
   Tapping a person slides their profile in over the list (horizontal Apple
   push) with a back caret top-left; the list keeps its own close affordance.
   The container never resizes between the two views. */
function CreditsSlider({
  groups,
  songView,
  eyebrow,
  title,
  subtitle,
  currentAlbumId,
  album,
  selected,
  onOpenPerson,
  onBack,
  onClose,
  resolveInstrument,
  onOpenInstrument,
  showCloseOnPerson,
  surfaceBg,
  songHeader,
  multiColumn,
}: {
  groups: CreditGroup[];
  /* When set (per-song surface), the list view leads with the "On this track"
     gear doors + writers/production groups instead of the flat CreditsList. */
  songView?: CreditsSongView;
  eyebrow: string;
  title: string;
  subtitle: string;
  currentAlbumId?: string;
  album: Album;
  selected: CreditsPersonView | null;
  onOpenPerson: (personId: string, role: string) => void;
  onBack: () => void;
  onClose: () => void;
  resolveInstrument: (instrumentId?: string) => Instrument | undefined;
  onOpenInstrument: (
    instrument: Instrument,
    tuningNotes?: string,
    attribution?: { personId: string; songId: string },
  ) => void;
  /* The desktop page keeps a persistent close in the corner; the mobile sheet
     hides the X on the person view (back caret only) so the credits list keeps
     the single close affordance. */
  showCloseOnPerson: boolean;
  /* Opaque background painted on BOTH sliding panes so the cross-slide shows
     exactly one pane at a time — never the outgoing pane or the page behind
     bleeding through. Each host passes its own surface color (the mobile sheet
     panel vs. the desktop card) so the panes match their container. */
  surfaceBg: string;
  /* When set, the list view leads with the Apple song-page header (artwork +
     Play + artist · album · date) instead of the quiet eyebrow/title/subtitle.
     Per-track surfaces pass it; the album-credits surface leaves it undefined
     so its header is unchanged. */
  songHeader?: CreditsSongHeader;
  /* Flow the role groups into balanced columns (per-track tablet/desktop). */
  multiColumn?: boolean;
}) {
  const reduce = !!useReducedMotion();
  const fade = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.12 } }
    : null;

  return (
    <div className="relative flex-1 min-h-0 overflow-hidden">
      {/* Pinned chrome — back caret (person view only) top-left, close X
          top-right. Both sit above the sliding panes so they never move. */}
      {selected && (
        <div className="absolute top-2 left-3 z-20">
          <SheetBack onClick={onBack} data-testid="button-credits-back" />
        </div>
      )}
      {(!selected || showCloseOnPerson) && (
        <div className="absolute top-2 right-3 z-20">
          <SheetClose onClick={onClose} data-testid="button-credits-close" />
        </div>
      )}

      <AnimatePresence initial={false}>
        {selected ? (
          <motion.div
            key="person"
            className="absolute inset-0 z-10 overflow-y-auto scrollbar-hide"
            style={{
              background: surfaceBg,
              WebkitMaskImage: SHEET_TOP_FADE,
              maskImage: SHEET_TOP_FADE,
            }}
            initial={fade ? fade.initial : { x: "100%" }}
            animate={fade ? fade.animate : { x: 0 }}
            exit={fade ? fade.exit : { x: "100%" }}
            transition={fade ? fade.transition : SLIDE_SPRING}
          >
            <div className="mx-auto w-full max-w-[680px] pt-16 pb-10">
              <PerformerProfileContent
                person={selected.person}
                song={selected.song}
                album={album}
                contextLabel={selected.role}
                selectedCreditId={selected.selectedCreditId}
                currentSongCredits={selected.currentSongCredits}
                otherTracks={selected.otherTracks}
                resolveInstrument={resolveInstrument}
                onOpenInstrument={onOpenInstrument}
              />
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="list"
            className="absolute inset-0 overflow-y-auto scrollbar-hide"
            style={{
              background: surfaceBg,
              WebkitMaskImage: SHEET_TOP_FADE,
              maskImage: SHEET_TOP_FADE,
            }}
            initial={fade ? fade.initial : { x: "-25%" }}
            animate={fade ? fade.animate : { x: 0 }}
            exit={fade ? fade.exit : { x: "-25%" }}
            transition={fade ? fade.transition : SLIDE_SPRING}
          >
            <div className="mx-auto w-full max-w-[680px] pt-16 pb-6">
              {songHeader ? (
                <SongCreditHeader h={songHeader} />
              ) : (
                <div className="px-5">
                  <p className="text-[color:var(--brand-blue)] text-xs font-semibold uppercase tracking-wider mb-1">
                    {eyebrow}
                  </p>
                  <h2 className="text-fan-primary text-2xl sm:text-3xl font-bold leading-tight tracking-tight">
                    {title}
                  </h2>
                  <p className="text-fan-secondary text-base mt-1 leading-snug">
                    {subtitle}
                  </p>
                </div>
              )}
              <div className={songHeader ? "mt-7" : "mt-4"}>
                {songView ? (
                  <SongTrackCredits
                    songView={songView}
                    currentAlbumId={currentAlbumId}
                    resolveInstrument={resolveInstrument}
                    onOpenPerson={onOpenPerson}
                    multiColumn={multiColumn}
                  />
                ) : (
                  <CreditsList
                    groups={groups}
                    onOpenPerson={onOpenPerson}
                    currentAlbumId={currentAlbumId}
                    multiColumn={multiColumn}
                  />
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* Build the synthesized, context-free person view the desktop page opens with
   (no track context — leads with About + the credited role as subtitle). */
function synthPersonView(e: CreditEntry, role: string): CreditsPersonView {
  return {
    person: { id: e.personId!, name: e.name, photoUrl: e.photoUrl ?? undefined } as Person,
    role,
    song: undefined,
    selectedCreditId: undefined,
    currentSongCredits: undefined,
    otherTracks: [],
  };
}

/* ── Mobile bottom-sheet credits host ────────────────────────────────────
   A fixed-height sheet that slides the person profile in over the credits
   list (no separate PerformerSheet, no X on the person view). Preserves the
   rich-profile gate and the contextual song lead-in via `resolvePersonContext`
   so the profile opens on the track the person actually played on. Shared by
   the album-credits and per-song "Song Credits" surfaces — they differ only
   in the eyebrow/title/subtitle and which groups they feed in. */
function CreditsSheetHost({
  ariaLabel,
  testId,
  eyebrow,
  title,
  subtitle,
  groups,
  rigs,
  songPerformers,
  songTextGroups,
  resolveRigView,
  albumId,
  album,
  trackExtra,
  resolveInstrument,
  resolvePersonContext,
  songHeader,
  onClose,
}: {
  ariaLabel: string;
  testId: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  groups: CreditGroup[];
  /** Named gear setups attached to this track (per-track surfaces only). */
  rigs?: SongRig[];
  /** Raw performer rows for the per-song "On this track" gear doors. When set
   *  (with resolveRigView), the list view renders the song view instead of the
   *  flat album-style CreditsList. */
  songPerformers?: AlbumCreditsRow[];
  /** Quiet writers / production groups shown under the gear doors. */
  songTextGroups?: CreditGroup[];
  /** Resolves a tapped rig into the fully-hydrated RigDetailView at tap time. */
  resolveRigView?: (
    rig: SongRig,
    ctx: { performerName?: string; performerPhotoUrl?: string | null },
  ) => RigDetailView;
  /** Apple song-page header for per-track surfaces (album credits omit it). */
  songHeader?: CreditsSongHeader;
  /** Current album id — lets the rich-profile gate count a track on THIS
   *  album as not-rich, matching the desktop page. */
  albumId?: string;
  /** Full album — needed to host the in-place person view. */
  album: Album;
  /** Extra analytics props merged into the credits_person_clicked event
   *  (e.g. the contextual songId for the per-song surface). */
  trackExtra?: Record<string, unknown>;
  resolveInstrument: (instrumentId?: string) => Instrument | undefined;
  /** Resolves the contextual person view (real Person + lead-in song +
   *  other-tracks) for a tapped credit. Returns null if the person is
   *  unknown. */
  resolvePersonContext: (personId: string, role: string) => CreditsPersonView | null;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<CreditsPersonView | null>(null);

  // Gear/vendor/in-app-browser sub-stack for the person view. Its X tears the
  // whole stack down (returns past everything to the album); each sub-sheet's
  // own back chevron still pops one level. Rendered OUTSIDE the SheetShell
  // (its panel is framer-transformed, which would break the sub-sheets'
  // position:fixed).
  const gear = usePersonGearDrilldown(() => {
    setSelected(null);
    onClose();
  });

  const openPerson = (personId: string, role: string) => {
    const view = resolvePersonContext(personId, role);
    if (!view) return;
    track("credits_person_clicked", { personId, albumId: album.id, ...trackExtra });
    setSelected(view);
  };

  // Per-song surfaces pass raw performer rows + a rig resolver; that flips the
  // list pane into the "On this track" gear doors. The album-credits surface
  // leaves these undefined and keeps the flat CreditsList.
  const songView: CreditsSongView | undefined =
    songPerformers && resolveRigView
      ? {
          performers: songPerformers,
          rigs: rigs ?? [],
          textGroups: songTextGroups ?? [],
          onOpenRig: (rig, ctx) => gear.openRig(resolveRigView(rig, ctx)),
        }
      : undefined;

  return (
    <>
      <SheetShell
        ariaLabel={ariaLabel}
        testId={testId}
        onClose={onClose}
        variant="fixed"
      >
        <CreditsSlider
          groups={groups}
          songView={songView}
          eyebrow={eyebrow}
          title={title}
          subtitle={subtitle}
          currentAlbumId={albumId}
          album={album}
          selected={selected}
          onOpenPerson={openPerson}
          onBack={() => setSelected(null)}
          onClose={onClose}
          resolveInstrument={resolveInstrument}
          onOpenInstrument={gear.openInstrument}
          showCloseOnPerson={false}
          surfaceBg="rgb(20, 24, 48)"
          songHeader={songHeader}
        />
      </SheetShell>
      {gear.overlay}
    </>
  );
}

export function AlbumCreditsSheet({
  albumId,
  albumTitle,
  artist,
  credits,
  album,
  resolveInstrument,
  resolvePersonContext,
  onClose,
}: {
  /** Current album id — lets the rich-profile gate count a track on THIS
   *  album as not-rich, matching the desktop page. */
  albumId?: string;
  albumTitle: string;
  artist: string;
  credits: AlbumCreditsPayload;
  /** Full album — needed to host the in-place person view. */
  album: Album;
  resolveInstrument: (instrumentId?: string) => Instrument | undefined;
  /** Resolves the contextual person view (real Person + lead-in song +
   *  other-tracks) for a tapped credit. Returns null if the person is
   *  unknown. */
  resolvePersonContext: (personId: string, role: string) => CreditsPersonView | null;
  onClose: () => void;
}) {
  const groups = useMemo(() => buildAlbumCreditGroups(credits), [credits]);
  return (
    <CreditsSheetHost
      ariaLabel={`Credits for ${albumTitle}`}
      testId="sheet-album-credits"
      eyebrow="Album Credits"
      title={albumTitle}
      subtitle={artist}
      groups={groups}
      albumId={albumId}
      album={album}
      resolveInstrument={resolveInstrument}
      resolvePersonContext={resolvePersonContext}
      onClose={onClose}
    />
  );
}

/* Shared per-song view-model parts for the mobile SongCreditsSheet and the
   desktop AlbumCreditsPage song view: the raw performer rows (no dedupe — two
   performers sharing one instrument each surface as their own gear door) plus
   the quiet writers (Composition & Lyrics) + album-level production
   (Production & Engineering) text groups shown beneath the gear doors. */
function buildSongCreditsParts(
  credits: AlbumCreditsPayload,
  songId: string,
  production?: AlbumCreditsRow[],
): { songPerformers: AlbumCreditsRow[]; songTextGroups: CreditGroup[] } {
  const songPerformers = credits.bySongId?.[songId]?.performers ?? [];
  const songTextGroups: CreditGroup[] = [];
  const composition = aggregateRows(credits.bySongId?.[songId]?.writers ?? []);
  if (composition.length)
    songTextGroups.push({ title: "Composition & Lyrics", entries: composition });
  const prod = aggregateRows(production ?? []);
  if (prod.length)
    songTextGroups.push({ title: "Production & Engineering", entries: prod });
  return { songPerformers, songTextGroups };
}

/* ── Mobile per-song "Song Credits" ──────────────────────────────────────
   Same dark pill cards + in-place slide-in person view as the album credits
   sheet, but scoped to a single track. `credits` is a single-song payload
   (one `bySongId` entry, no album-level production) so `buildAlbumCreditGroups`
   yields just this song's Performing Artists / Composition & Lyrics groups.
   The contextual song is always the current track, so the person profile
   opens on the song they actually played on. */
export function SongCreditsSheet({
  songId,
  songTitle,
  albumId,
  albumTitle,
  artist,
  credits,
  rigs,
  production,
  resolveRigView,
  album,
  resolveInstrument,
  resolvePersonContext,
  songHeader,
  onClose,
}: {
  songId: string;
  songTitle: string;
  albumId?: string;
  albumTitle: string;
  artist: string;
  /** Single-song credits payload (one bySongId entry). */
  credits: AlbumCreditsPayload;
  /** Named gear setups attached to this track. */
  rigs?: SongRig[];
  /** Album-level production rows, threaded in as the song view's quiet
   *  "Production & Engineering" group (Apple-Music honest — production is
   *  credited at the album level, not per-track). */
  production?: AlbumCreditsRow[];
  /** Resolves a tapped rig into the fully-hydrated RigDetailView at tap time. */
  resolveRigView?: (
    rig: SongRig,
    ctx: { performerName?: string; performerPhotoUrl?: string | null },
  ) => RigDetailView;
  album: Album;
  resolveInstrument: (instrumentId?: string) => Instrument | undefined;
  resolvePersonContext: (personId: string, role: string) => CreditsPersonView | null;
  /** Apple song-page header (artwork + Play + artist · album · date). */
  songHeader?: CreditsSongHeader;
  onClose: () => void;
}) {
  // Raw performer doors + quiet writers/production groups (shared with the
  // desktop AlbumCreditsPage song view).
  const { songPerformers, songTextGroups } = useMemo(
    () => buildSongCreditsParts(credits, songId, production),
    [credits, songId, production],
  );
  return (
    <CreditsSheetHost
      ariaLabel={`Credits for ${songTitle}`}
      testId="sheet-credits"
      eyebrow="Song Credits"
      title={songTitle}
      subtitle={`${artist} · ${albumTitle}`}
      groups={[]}
      rigs={rigs}
      songPerformers={songPerformers}
      songTextGroups={songTextGroups}
      resolveRigView={resolveRigView}
      albumId={albumId}
      album={album}
      trackExtra={{ songId }}
      resolveInstrument={resolveInstrument}
      resolvePersonContext={resolvePersonContext}
      songHeader={songHeader}
      onClose={onClose}
    />
  );
}

/* ── iPad / desktop credits page ─────────────────────────────────────────
   On the desktop player, album credits open as a centered card floating over
   the album page — the dimmed backdrop keeps the fan left/right rails visible
   behind it (mirrors the Edit-Profile centered-card pattern), rather than an
   opaque full-viewport takeover. Tapping a person slides their profile in with
   a back caret; nothing resizes between the list and person views. Serves both
   the album credits and the per-track "Song Credits" (via `eyebrow`). The
   page self-manages its close animation — call sites keep their plain
   `{cond && <AlbumCreditsPage/>}` mount; the exit fade plays via
   AnimatePresence + onExitComplete before the real unmount fires. */
export function AlbumCreditsPage({
  album,
  albumTitle,
  artist,
  credits,
  eyebrow = "Album Credits",
  songHeader,
  songId,
  production,
  rigs,
  resolveRigView,
  resolveInstrument = resolveStaticInstrument,
  onClose,
}: {
  /** Full album — needed to host the in-place person view's gear/album
   *  drill-downs. */
  album: Album;
  albumTitle: string;
  artist: string;
  credits: AlbumCreditsPayload;
  /** Small uppercase label above the title. Defaults to "Album Credits";
   *  the per-track surface passes "Song Credits". */
  eyebrow?: string;
  /** Apple song-page header for per-track surfaces. When set, the page also
   *  flows the role groups into balanced columns (tablet/desktop). The
   *  album-credits surface omits it → unchanged single-column header. */
  songHeader?: CreditsSongHeader;
  /** When set (with resolveRigView), the page renders the per-song "On this
   *  track" gear doors instead of the flat album credit list. */
  songId?: string;
  /** Album-level production rows, threaded into the song view as the quiet
   *  "Production & Engineering" group. */
  production?: AlbumCreditsRow[];
  /** Named gear setups attached to this track. */
  rigs?: SongRig[];
  /** Resolves a tapped rig into the fully-hydrated RigDetailView at tap time. */
  resolveRigView?: (
    rig: SongRig,
    ctx: { performerName?: string; performerPhotoUrl?: string | null },
  ) => RigDetailView;
  /** Resolves an instrument id to its (vendor-enriched) detail. Defaults to the
   *  static roster; the per-song surface passes a resolver seeded from the live
   *  album credits so the gear doors + person-view gear carry vendor
   *  availability. */
  resolveInstrument?: (instrumentId?: string) => Instrument | undefined;
  onClose: () => void;
}) {
  const reduce = !!useReducedMotion();
  const [open, setOpen] = useState(true);
  const requestClose = () => setOpen(false);
  const groups = useMemo(() => buildAlbumCreditGroups(credits), [credits]);

  const [selected, setSelected] = useState<CreditsPersonView | null>(null);

  // Gear sub-stack for the person view. Its X closes the whole page (returns
  // past the entire stack); each sub-sheet's back chevron pops one level.
  // `contained` makes the gear/vendor/in-app-browser panes slide in INSIDE the
  // credits card (clipped to its rounded bounds, rails + dimmed page still
  // visible behind), matching the person drill-down — instead of a
  // full-viewport takeover. So the overlay is rendered as a child of the card.
  const gear = usePersonGearDrilldown(requestClose, { contained: true });

  const openPerson = (personId: string, role: string) => {
    const entry = groups.flatMap((g) => g.entries).find((e) => e.personId === personId);
    if (!entry) return;
    track("credits_person_clicked", { personId, albumId: album.id });
    setSelected(synthPersonView(entry, role));
  };

  // Per-song surface: raw performer rows + a rig resolver flip the list pane
  // into the "On this track" gear doors (mirrors the mobile CreditsSheetHost).
  // The album-credits surface leaves songId/resolveRigView unset → flat list.
  let songView: CreditsSongView | undefined;
  if (songId && resolveRigView) {
    const { songPerformers, songTextGroups } = buildSongCreditsParts(
      credits,
      songId,
      production,
    );
    songView = {
      performers: songPerformers,
      rigs: rigs ?? [],
      textGroups: songTextGroups,
      onOpenRig: (rig, ctx) => gear.openRig(resolveRigView(rig, ctx)),
    };
  }

  return (
    <>
      <AnimatePresence onExitComplete={onClose}>
        {open && (
          <motion.div
            key="album-credits-page"
            className="fixed inset-0 z-[78] flex items-center justify-center p-6"
            role="dialog"
            aria-modal="true"
            aria-label={`Credits for ${albumTitle}`}
            data-testid="page-album-credits"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={scrimFade(reduce)}
          >
            {/* Dimmed backdrop — keeps the fan rails visible behind the card;
                a tap outside the card closes it. */}
            <div
              className="absolute inset-0 bg-black/60"
              onClick={requestClose}
              data-testid="backdrop-album-credits"
            />
            <motion.div
              className={`relative flex flex-col w-full ${songHeader ? "max-w-[760px]" : "max-w-[680px]"} h-[82vh] max-h-[820px] rounded-3xl overflow-hidden shadow-2xl text-fan-primary`}
              style={{
                background: "var(--brand-bg)",
                fontFamily: "system-ui, -apple-system, 'SF Pro Text', sans-serif",
              }}
              initial={{ scale: reduce ? 1 : 0.97, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: reduce ? 1 : 0.98, opacity: 0 }}
              transition={scrimFade(reduce)}
            >
              <CreditsSlider
                groups={groups}
                songView={songView}
                eyebrow={eyebrow}
                title={albumTitle}
                subtitle={artist}
                currentAlbumId={album.id}
                album={album}
                selected={selected}
                onOpenPerson={openPerson}
                onBack={() => setSelected(null)}
                onClose={requestClose}
                resolveInstrument={resolveInstrument}
                onOpenInstrument={gear.openInstrument}
                showCloseOnPerson
                surfaceBg="var(--brand-bg)"
                songHeader={songHeader}
                multiColumn={!!songHeader}
              />
              {/* In-card gear/vendor/in-app-browser panes. Rendered inside the
                  card (which is `relative overflow-hidden`) so the contained
                  sub-sheets' `absolute inset-0` pins + clips to the card. */}
              {gear.overlay}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
