import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
  SheetShell,
  PerformerProfileContent,
  usePersonGearDrilldown,
  resolveStaticInstrument,
  personProfileIsRich,
} from "@/pages/AlbumDetail";
import { SheetClose, SheetBack } from "@/components/ui/SheetChrome";
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

export type AlbumCreditsRow = {
  id: string;
  personId?: string | null;
  name: string;
  role: string;
  person: AlbumCreditsPerson | null;
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
    if (role && !entry.roles.includes(role)) entry.roles.push(role);
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

const SLIDE_SPRING = { type: "spring", stiffness: 420, damping: 44, mass: 0.9 } as const;

/* The shared list ↔ person slider. Holds no state of its own — both the mobile
   sheet and the desktop page own `selected` + the gear sub-stack and pass them
   down so the chrome (sheet shell vs. full page) stays the host's concern.
   Tapping a person slides their profile in over the list (horizontal Apple
   push) with a back caret top-left; the list keeps its own close affordance.
   The container never resizes between the two views. */
function CreditsSlider({
  groups,
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
            style={{ background: surfaceBg }}
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
            style={{ background: surfaceBg }}
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
                <CreditsList
                  groups={groups}
                  onOpenPerson={onOpenPerson}
                  currentAlbumId={currentAlbumId}
                  multiColumn={multiColumn}
                />
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
  album: Album;
  resolveInstrument: (instrumentId?: string) => Instrument | undefined;
  resolvePersonContext: (personId: string, role: string) => CreditsPersonView | null;
  /** Apple song-page header (artwork + Play + artist · album · date). */
  songHeader?: CreditsSongHeader;
  onClose: () => void;
}) {
  const groups = useMemo(() => buildAlbumCreditGroups(credits), [credits]);
  return (
    <CreditsSheetHost
      ariaLabel={`Credits for ${songTitle}`}
      testId="sheet-credits"
      eyebrow="Song Credits"
      title={songTitle}
      subtitle={`${artist} · ${albumTitle}`}
      groups={groups}
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
                eyebrow={eyebrow}
                title={albumTitle}
                subtitle={artist}
                currentAlbumId={album.id}
                album={album}
                selected={selected}
                onOpenPerson={openPerson}
                onBack={() => setSelected(null)}
                onClose={requestClose}
                resolveInstrument={resolveStaticInstrument}
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
