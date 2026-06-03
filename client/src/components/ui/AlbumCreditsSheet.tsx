import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { SheetShell, SheetHeader } from "@/pages/AlbumDetail";
import { SheetClose } from "@/components/ui/SheetChrome";
import { EASE_OUT, scrimFade } from "@/lib/motion";

export type AlbumCreditsRow = {
  id: string;
  personId: string | null;
  name: string;
  role: string;
  person: { id: string; name: string; photoUrl?: string | null } | null;
};

type Entry = {
  key: string;
  name: string;
  personId: string | null;
  photoUrl: string | null;
};

function initialsOf(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function useCreditsByRole(rows: AlbumCreditsRow[]) {
  return useMemo(() => {
    const m = new Map<string, Entry[]>();
    for (const r of rows) {
      const list = m.get(r.role) ?? [];
      list.push({
        key: r.id,
        name: r.person?.name ?? r.name,
        personId: r.person?.id ?? null,
        photoUrl: r.person?.photoUrl ?? null,
      });
      m.set(r.role, list);
    }
    return Array.from(m.entries());
  }, [rows]);
}

/* Shared role-grouped credits list. Rendered identically inside the mobile
   bottom sheet (AlbumCreditsSheet) and the desktop centered modal
   (AlbumCreditsModal) so fans see the same content on both surfaces. */
function AlbumCreditsBody({
  rows,
  onOpenPerson,
}: {
  rows: AlbumCreditsRow[];
  onOpenPerson?: (personId: string, role: string) => void;
}) {
  const byRole = useCreditsByRole(rows);

  if (rows.length === 0) {
    return (
      <div className="px-5 pb-4 text-white/55 text-sm">
        Production credits for this album haven't been published yet.
      </div>
    );
  }

  return (
    <div className="px-5 pb-4">
      {byRole.map(([role, entries], roleIdx) => (
        <section
          key={role}
          className={roleIdx === 0 ? "" : "mt-7"}
          data-testid={`row-album-credit-role-${role.replace(/\s+/g, "-").toLowerCase()}`}
        >
          <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-white/55 mb-3">
            {role}
          </h3>
          <ul className="flex flex-col">
            {entries.map((e) => {
              const avatar = e.photoUrl ? (
                <img
                  src={e.photoUrl}
                  alt=""
                  style={{ width: 32, height: 32 }}
                  className="rounded-full object-cover flex-shrink-0"
                />
              ) : (
                <span
                  aria-hidden
                  style={{ width: 32, height: 32 }}
                  className="rounded-full bg-white/[0.14] ring-1 ring-inset ring-white/20 flex-shrink-0 inline-flex items-center justify-center text-xs font-medium text-white/80"
                >
                  {initialsOf(e.name)}
                </span>
              );
              if (e.personId && onOpenPerson) {
                return (
                  <li key={e.key}>
                    <button
                      type="button"
                      onClick={() => onOpenPerson(e.personId!, role)}
                      className="group -mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-white/[0.06] active:bg-white/10"
                      data-testid={`link-album-credit-person-${e.personId}`}
                    >
                      {avatar}
                      <span className="flex-1 min-w-0 truncate text-white text-base font-normal leading-snug tracking-[-0.01em]">
                        {e.name}
                      </span>
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="flex-shrink-0 text-white/25 transition-colors group-hover:text-white/45"
                        aria-hidden="true"
                      >
                        <path d="M9 6l6 6-6 6" />
                      </svg>
                    </button>
                  </li>
                );
              }
              return (
                <li
                  key={e.key}
                  className="flex items-center gap-3 py-1.5"
                  data-testid={`text-album-credit-${e.key}`}
                >
                  {avatar}
                  <span className="text-white text-base font-normal leading-snug tracking-[-0.01em]">
                    {e.name}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function AlbumCreditsSheet({
  albumTitle,
  artist,
  rows,
  onOpenPerson,
  onClose,
}: {
  albumTitle: string;
  artist: string;
  rows: AlbumCreditsRow[];
  onOpenPerson?: (personId: string, role: string) => void;
  onClose: () => void;
}) {
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
      <AlbumCreditsBody rows={rows} onOpenPerson={onOpenPerson} />
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
  rows,
  onOpenPerson,
  onClose,
}: {
  albumTitle: string;
  artist: string;
  rows: AlbumCreditsRow[];
  onOpenPerson?: (personId: string, role: string) => void;
  onClose: () => void;
}) {
  const reduce = !!useReducedMotion();
  const [open, setOpen] = useState(true);
  const requestClose = () => setOpen(false);

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
            className="relative z-10 w-full max-w-[440px] max-h-[80vh] overflow-y-auto scrollbar-hide rounded-3xl pt-1 pb-6"
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
                  Album Credits
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
            <AlbumCreditsBody rows={rows} onOpenPerson={onOpenPerson} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
