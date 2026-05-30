import { useMemo } from "react";
import { SheetShell, SheetHeader } from "@/pages/AlbumDetail";

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
  const byRole = useMemo(() => {
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

      {rows.length === 0 ? (
        <div className="px-5 pb-4 text-white/55 text-sm">
          Production credits for this album haven't been published yet.
        </div>
      ) : (
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
      )}
    </SheetShell>
  );
}
