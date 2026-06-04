import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { SheetShell, SheetHeader } from "@/pages/AlbumDetail";
import { SheetClose } from "@/components/ui/SheetChrome";
import { EASE_OUT, scrimFade } from "@/lib/motion";

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

/* Shared role-grouped credits list. Rendered identically inside the mobile
   bottom sheet (AlbumCreditsSheet) and the desktop centered modal
   (AlbumCreditsModal) so fans see the same content on both surfaces. Apple
   style: broad-category headings, a responsive multi-column grid, and each
   person's specific role(s) as a subtitle beneath the name. */
function AlbumCreditsBody({
  groups,
  onOpenPerson,
}: {
  groups: CreditGroup[];
  onOpenPerson?: (personId: string, role: string) => void;
}) {
  if (groups.length === 0) {
    return (
      <div className="px-5 pb-4 text-white/55 text-sm">
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
            groupIdx === 0 ? "" : "mt-8 pt-7 border-t border-white/10"
          }
          data-testid={`row-album-credit-role-${group.title
            .replace(/\s+/g, "-")
            .toLowerCase()}`}
        >
          <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-white/55 mb-3">
            {group.title}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
            {group.entries.map((e) => {
              const avatar = e.photoUrl ? (
                <img
                  src={e.photoUrl}
                  alt=""
                  style={{ width: 36, height: 36 }}
                  className="rounded-full object-cover flex-shrink-0"
                />
              ) : (
                <span
                  aria-hidden
                  style={{ width: 36, height: 36 }}
                  className="rounded-full bg-white/[0.14] ring-1 ring-inset ring-white/20 flex-shrink-0 inline-flex items-center justify-center text-xs font-medium text-white/80"
                >
                  {initialsOf(e.name)}
                </span>
              );
              const text = (
                <span className="flex-1 min-w-0">
                  <span className="block truncate text-white text-sm font-medium leading-tight tracking-[-0.01em]">
                    {e.name}
                  </span>
                  {e.subtitle && (
                    <span className="block truncate text-xs leading-tight text-fan-faint mt-0.5">
                      {e.subtitle}
                    </span>
                  )}
                </span>
              );
              if (e.personId && onOpenPerson) {
                return (
                  <button
                    key={e.key}
                    type="button"
                    onClick={() => onOpenPerson(e.personId!, e.subtitle)}
                    className="group -mx-2 flex items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-white/[0.06] active:bg-white/10"
                    data-testid={`link-album-credit-person-${e.personId}`}
                  >
                    {avatar}
                    {text}
                  </button>
                );
              }
              return (
                <div
                  key={e.key}
                  className="flex items-center gap-3 py-2"
                  data-testid={`text-album-credit-${e.key}`}
                >
                  {avatar}
                  {text}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

export function AlbumCreditsSheet({
  albumTitle,
  artist,
  credits,
  onOpenPerson,
  onClose,
}: {
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
      <AlbumCreditsBody groups={groups} onOpenPerson={onOpenPerson} />
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
  albumTitle,
  artist,
  credits,
  eyebrow = "Album Credits",
  onOpenPerson,
  onClose,
}: {
  albumTitle: string;
  artist: string;
  credits: AlbumCreditsPayload;
  /** Small uppercase label above the title. Defaults to "Album Credits";
   *  the per-track surface passes "Song Credits". */
  eyebrow?: string;
  onOpenPerson?: (personId: string, role: string) => void;
  onClose: () => void;
}) {
  const reduce = !!useReducedMotion();
  const [open, setOpen] = useState(true);
  const requestClose = () => setOpen(false);
  const groups = useMemo(() => buildAlbumCreditGroups(credits), [credits]);

  return (
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
            className="relative z-10 w-full max-w-[600px] max-h-[80vh] overflow-y-auto scrollbar-hide rounded-3xl pt-1 pb-6"
            style={{
              background: "rgb(20, 24, 48)",
              boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
            }}
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 6 }}
            transition={{ duration: reduce ? 0.15 : 0.24, ease: EASE_OUT }}
          >
            <div className="flex items-start gap-3 px-5 pt-5 pb-4">
              <div className="flex-1 min-w-0">
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
              <SheetClose
                onClick={requestClose}
                className="-m-1.5"
                data-testid="button-credits-modal-close"
              />
            </div>
            <AlbumCreditsBody groups={groups} onOpenPerson={onOpenPerson} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
