import { useMemo, useRef, useState, type UIEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
  SheetShell,
  SheetHeader,
  PerformerProfileContent,
  usePersonGearDrilldown,
  resolveStaticInstrument,
  personProfileIsRich,
} from "@/pages/AlbumDetail";
import { SheetClose, SheetBack } from "@/components/ui/SheetChrome";
import { EASE_OUT, scrimFade } from "@/lib/motion";
import { track } from "@/lib/analytics";
import type { Album, Person } from "@/data/musicData";

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

/* Circular photo (or initials fallback) for a credit, shared by every row
   variant. */
function CreditAvatar({ e }: { e: CreditEntry }) {
  if (e.photoUrl) {
    return (
      <img
        src={e.photoUrl}
        alt=""
        style={{ width: 36, height: 36 }}
        className="rounded-full object-cover flex-shrink-0"
      />
    );
  }
  return (
    <span
      aria-hidden
      style={{ width: 36, height: 36 }}
      className="rounded-full bg-white/[0.06] flex-shrink-0 inline-flex items-center justify-center text-xs font-medium text-fan-primary"
    >
      {initialsOf(e.name)}
    </span>
  );
}

/* Avatar + name + role-subtitle for a single credit, shared by the tappable
   (button) and plain (non-tappable) row variants of the desktop modal. */
function CreditFace({ e }: { e: CreditEntry }) {
  return (
    <>
      <CreditAvatar e={e} />
      <span className="flex-1 min-w-0">
        <span className="block truncate text-fan-primary text-sm font-medium leading-tight tracking-[-0.01em]">
          {e.name}
        </span>
        {e.subtitle && (
          <span className="block truncate text-xs leading-tight text-fan-faint mt-0.5">
            {e.subtitle}
          </span>
        )}
      </span>
    </>
  );
}

function CreditPersonButton({
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
      className="group -mx-2 flex items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-white/[0.06] active:bg-white/10"
      data-testid={`link-album-credit-person-${e.personId}`}
    >
      <CreditFace e={e} />
    </button>
  );
}

function CreditPlainRow({ e }: { e: CreditEntry }) {
  return (
    <div
      className="flex items-center gap-3 py-2"
      data-testid={`text-album-credit-${e.key}`}
    >
      <CreditFace e={e} />
    </div>
  );
}

/* Tappable only when the person has a real profile to open. Loads the
   lightweight profile and renders a plain (dead) row until it's proven rich —
   a bio, any gear, or a track on another album. People who are just a name +
   photo (session players, assistant engineers) stay non-tappable instead of
   dead-ending on an empty page (matches Apple Music). The profile query is
   shared with the in-box person view, so opening a rich person is instant. */
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
    return <CreditPersonButton e={e} onOpenPerson={onOpenPerson} />;
  }
  return <CreditPlainRow e={e} />;
}

/* ── Mobile bottom-sheet row variants ────────────────────────────────────
   Apple's mobile credits stack each group in its own rounded card with the
   role label set above it in small caps. Rows inside a card are separated by
   a hairline that's inset past the avatar; the role-subtitle wraps (it isn't
   truncated like the dense desktop modal). `first` drops the top divider so
   the card edge stays clean. */

/* Name + wrapping role-subtitle, with the inset top hairline for non-first
   rows. The border lives on the text column (not the row) so it starts after
   the avatar, matching Apple. */
function SheetCreditLabel({ e, first }: { e: CreditEntry; first: boolean }) {
  return (
    <span
      className={`flex-1 min-w-0 py-3 ${
        first ? "" : "border-t border-white/[0.07]"
      }`}
    >
      <span className="block truncate text-fan-primary text-base font-semibold leading-tight tracking-[-0.01em]">
        {e.name}
      </span>
      {e.subtitle && (
        <span className="block text-xs leading-snug text-fan-secondary mt-0.5">
          {e.subtitle}
        </span>
      )}
    </span>
  );
}

function SheetCreditButton({
  e,
  first,
  onOpenPerson,
}: {
  e: CreditEntry;
  first: boolean;
  onOpenPerson: (personId: string, role: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpenPerson(e.personId!, e.subtitle)}
      className="w-full flex items-center gap-3 px-4 text-left transition-colors active:bg-white/[0.05]"
      data-testid={`link-album-credit-person-${e.personId}`}
    >
      <CreditAvatar e={e} />
      <SheetCreditLabel e={e} first={first} />
    </button>
  );
}

function SheetCreditPlainRow({ e, first }: { e: CreditEntry; first: boolean }) {
  return (
    <div
      className="flex items-center gap-3 px-4"
      data-testid={`text-album-credit-${e.key}`}
    >
      <CreditAvatar e={e} />
      <SheetCreditLabel e={e} first={first} />
    </div>
  );
}

function SheetGatedCreditEntry({
  e,
  first,
  currentAlbumId,
  onOpenPerson,
}: {
  e: CreditEntry;
  first: boolean;
  currentAlbumId?: string;
  onOpenPerson: (personId: string, role: string) => void;
}) {
  const { data } = useQuery<PersonProfileLite>({
    queryKey: ["/api/people", e.personId, "profile"],
    enabled: !!e.personId,
  });
  if (personProfileIsRich(data, currentAlbumId)) {
    return <SheetCreditButton e={e} first={first} onOpenPerson={onOpenPerson} />;
  }
  return <SheetCreditPlainRow e={e} first={first} />;
}

/* Apple-Music-style grouped credits for the mobile bottom sheet: a small-caps
   role label over a single rounded card per group, rows hairline-separated. */
function SheetCreditsBody({
  groups,
  onOpenPerson,
  gateEmptyPeople = false,
  currentAlbumId,
}: {
  groups: CreditGroup[];
  onOpenPerson?: (personId: string, role: string) => void;
  gateEmptyPeople?: boolean;
  currentAlbumId?: string;
}) {
  if (groups.length === 0) {
    return (
      <div className="px-5 pb-4 text-fan-secondary text-sm">
        Production credits for this album haven't been published yet.
      </div>
    );
  }
  return (
    <div className="px-4 pb-4">
      {groups.map((group, groupIdx) => (
        <section
          key={group.title}
          className={groupIdx === 0 ? "" : "mt-6"}
          data-testid={`row-album-credit-role-${group.title
            .replace(/\s+/g, "-")
            .toLowerCase()}`}
        >
          <h3 className="px-1 mb-2 text-fan-faint text-xs font-semibold uppercase tracking-[0.08em]">
            {group.title}
          </h3>
          <div className="rounded-2xl bg-white/[0.04] overflow-hidden">
            {group.entries.map((e, i) => {
              const first = i === 0;
              if (e.personId && onOpenPerson) {
                if (gateEmptyPeople) {
                  return (
                    <SheetGatedCreditEntry
                      key={e.key}
                      e={e}
                      first={first}
                      currentAlbumId={currentAlbumId}
                      onOpenPerson={onOpenPerson}
                    />
                  );
                }
                return (
                  <SheetCreditButton
                    key={e.key}
                    e={e}
                    first={first}
                    onOpenPerson={onOpenPerson}
                  />
                );
              }
              return <SheetCreditPlainRow key={e.key} e={e} first={first} />;
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function AlbumCreditsBody({
  groups,
  onOpenPerson,
  /* When set, people are tappable only if their profile proves rich (Apple's
     dead-link behavior). The desktop modal opts in; the mobile sheet keeps its
     existing always-tappable behavior. */
  gateEmptyPeople = false,
  currentAlbumId,
}: {
  groups: CreditGroup[];
  onOpenPerson?: (personId: string, role: string) => void;
  gateEmptyPeople?: boolean;
  currentAlbumId?: string;
}) {
  if (groups.length === 0) {
    return (
      <div className="px-5 pb-4 text-fan-secondary text-sm">
        Production credits for this album haven't been published yet.
      </div>
    );
  }

  return (
    <div className="px-5 pb-4">
      {groups.map((group, groupIdx) => (
        <section
          key={group.title}
          className={
            groupIdx === 0 ? "" : "mt-7 pt-6 border-t border-white/[0.06]"
          }
          data-testid={`row-album-credit-role-${group.title
            .replace(/\s+/g, "-")
            .toLowerCase()}`}
        >
          <h3 className="text-fan-primary text-base font-semibold tracking-[-0.01em] mb-3.5">
            {group.title}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
            {group.entries.map((e) => {
              if (e.personId && onOpenPerson) {
                if (gateEmptyPeople) {
                  return (
                    <GatedCreditEntry
                      key={e.key}
                      e={e}
                      currentAlbumId={currentAlbumId}
                      onOpenPerson={onOpenPerson}
                    />
                  );
                }
                return <CreditPersonButton key={e.key} e={e} onOpenPerson={onOpenPerson} />;
              }
              return <CreditPlainRow key={e.key} e={e} />;
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

export function AlbumCreditsSheet({
  albumId,
  albumTitle,
  artist,
  credits,
  onOpenPerson,
  onClose,
}: {
  /** Current album id — lets the rich-profile gate count a track on THIS
   *  album as not-rich, matching the desktop card. */
  albumId?: string;
  albumTitle: string;
  artist: string;
  credits: AlbumCreditsPayload;
  onOpenPerson?: (personId: string, role: string) => void;
  onClose: () => void;
}) {
  const groups = useMemo(() => buildAlbumCreditGroups(credits), [credits]);
  return (
    <SheetShell
      ariaLabel={`Credits for ${albumTitle}`}
      testId="sheet-album-credits"
      onClose={onClose}
    >
      <SheetHeader
        eyebrow="Album Credits"
        title={albumTitle}
        subtitle={artist}
        onClose={onClose}
      />
      <SheetCreditsBody
        groups={groups}
        onOpenPerson={onOpenPerson}
        gateEmptyPeople
        currentAlbumId={albumId}
      />
    </SheetShell>
  );
}

/* Desktop credits surface. Apple opens album credits in a centered,
   rounded-rectangle modal card on the desktop player (not a bottom sheet),
   so the desktop album page uses this instead of AlbumCreditsSheet. The card
   self-manages its close animation — call sites keep their plain
   `{cond && <AlbumCreditsModal/>}` mount; the exit fade plays via
   AnimatePresence + onExitComplete before the real unmount fires. */
export function AlbumCreditsModal({
  album,
  albumTitle,
  artist,
  credits,
  eyebrow = "Album Credits",
  onClose,
}: {
  /** Full album — needed to host the in-box person view's gear/album
   *  drill-downs. */
  album: Album;
  albumTitle: string;
  artist: string;
  credits: AlbumCreditsPayload;
  /** Small uppercase label above the title. Defaults to "Album Credits";
   *  the per-track surface passes "Song Credits". */
  eyebrow?: string;
  onClose: () => void;
}) {
  const reduce = !!useReducedMotion();
  const [open, setOpen] = useState(true);
  const requestClose = () => setOpen(false);
  const groups = useMemo(() => buildAlbumCreditGroups(credits), [credits]);

  // In-box person drill-down. Tapping a (rich) person swaps the card's content
  // to their profile with a back chevron, instead of closing the box and
  // popping a separate sheet. The X still dismisses the whole box.
  const [selectedPerson, setSelectedPerson] = useState<{
    person: Person;
    role: string;
  } | null>(null);

  // Gear/vendor/in-app-browser sub-stack for the person view. Its X closes the
  // whole modal (returns past the entire stack); each sub-sheet's own back
  // chevron still pops one level. Rendered as a top-level sibling, OUTSIDE the
  // framer-transformed card (a transformed ancestor breaks position:fixed).
  const gear = usePersonGearDrilldown(requestClose);

  // Close-X fades while scrolling the card down, returns on scroll-up, at the
  // top, or shortly after scrolling stops. Disabled under reduced-motion.
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastTop = useRef(0);
  const stopTimer = useRef<ReturnType<typeof setTimeout>>();
  const [xHidden, setXHidden] = useState(false);

  const resetChrome = () => {
    setXHidden(false);
    lastTop.current = 0;
    if (stopTimer.current) clearTimeout(stopTimer.current);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  };

  const openPerson = (personId: string, role: string) => {
    const entry = groups.flatMap((g) => g.entries).find((e) => e.personId === personId);
    if (!entry) return;
    track("credits_person_clicked", { personId, albumId: album.id });
    setSelectedPerson({
      person: { id: personId, name: entry.name, photoUrl: entry.photoUrl ?? undefined } as Person,
      role,
    });
    resetChrome();
  };

  const backToList = () => {
    setSelectedPerson(null);
    resetChrome();
  };

  const onScroll = (e: UIEvent<HTMLDivElement>) => {
    if (reduce) return;
    const top = e.currentTarget.scrollTop;
    const prev = lastTop.current;
    lastTop.current = top;
    if (top <= 4) setXHidden(false);
    else if (top > prev + 2) setXHidden(true);
    else if (top < prev - 2) setXHidden(false);
    if (stopTimer.current) clearTimeout(stopTimer.current);
    stopTimer.current = setTimeout(() => setXHidden(false), 600);
  };

  return (
    <>
      <AnimatePresence onExitComplete={onClose}>
        {open && (
          <motion.div
            key="album-credits-modal"
            className="fixed inset-0 z-[78] flex items-center justify-center p-6"
            role="dialog"
            aria-modal="true"
            aria-label={`Credits for ${albumTitle}`}
            data-testid="modal-album-credits"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={scrimFade(reduce)}
          >
            {/* Solid dim — no live blur (keeps one paint surface, per the
                iOS-WebKit stacked-blur memo). Click anywhere off the card
                dismisses it. */}
            <div
              className="absolute inset-0 bg-black/70"
              onClick={requestClose}
              aria-hidden
              data-testid="backdrop-album-credits"
            />
            <motion.div
              className="relative z-10 w-full max-w-[600px] max-h-[80vh] overflow-hidden rounded-3xl"
              style={{
                background: "rgb(20, 24, 48)",
                boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
              }}
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 6 }}
              transition={{ duration: reduce ? 0.15 : 0.24, ease: EASE_OUT }}
            >
              {/* Pinned chrome — back chevron (person view only) top-left, the
                  close-X top-right (fades on scroll). Both sit above the
                  scroller so they stay fixed while content moves. */}
              {selectedPerson && (
                <div className="absolute top-3.5 left-4 z-20">
                  <SheetBack
                    onClick={backToList}
                    data-testid="button-credits-modal-back"
                  />
                </div>
              )}
              <div
                className="absolute top-3.5 right-4 z-20"
                style={{
                  opacity: xHidden ? 0 : 1,
                  transition: reduce ? undefined : "opacity 220ms ease",
                }}
              >
                <SheetClose
                  onClick={requestClose}
                  data-testid="button-credits-modal-close"
                />
              </div>

              <div
                ref={scrollRef}
                onScroll={onScroll}
                className="max-h-[80vh] overflow-y-auto scrollbar-hide"
              >
                {selectedPerson ? (
                  <div className="pt-16 pb-6">
                    <PerformerProfileContent
                      person={selectedPerson.person}
                      album={album}
                      contextLabel={selectedPerson.role}
                      currentSongCredits={undefined}
                      otherTracks={[]}
                      resolveInstrument={resolveStaticInstrument}
                      onOpenInstrument={gear.openInstrument}
                    />
                  </div>
                ) : (
                  <div className="pt-5 pb-6">
                    <div className="px-5 pr-14">
                      <p className="text-[color:var(--brand-blue)] text-xs font-semibold uppercase tracking-wider mb-1">
                        {eyebrow}
                      </p>
                      <h2 className="text-white text-[22px] font-bold leading-tight tracking-tight">
                        {albumTitle}
                      </h2>
                      <p
                        className="text-[15px] mt-1 leading-snug"
                        style={{ color: "rgba(235,235,245,0.55)" }}
                      >
                        {artist}
                      </p>
                    </div>
                    <div className="mt-4">
                      <AlbumCreditsBody
                        groups={groups}
                        onOpenPerson={openPerson}
                        gateEmptyPeople
                        currentAlbumId={album.id}
                      />
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {gear.overlay}
    </>
  );
}
