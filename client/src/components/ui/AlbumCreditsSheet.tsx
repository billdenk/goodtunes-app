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
  onOpenPerson?: (personId: string) => void;
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
                      className="rounded-full bg-white/[0.08] flex-shrink-0 inline-flex items-center justify-center text-xs font-medium text-white/55"
                    >
                      {initialsOf(e.name)}
                    </span>
                  );
                  const inner = (
                    <span className="inline-flex items-center gap-3 py-1.5">
                      {avatar}
                      <span className="text-white text-base font-normal leading-snug tracking-[-0.01em]">
                        {e.name}
                      </span>
                    </span>
                  );
                  if (e.personId && onOpenPerson) {
                    return (
                      <li key={e.key}>
                        <button
                          type="button"
                          onClick={() => onOpenPerson(e.personId!)}
                          className="self-start text-left active:opacity-70 hover:opacity-90 transition-opacity"
                          data-testid={`link-album-credit-person-${e.personId}`}
                        >
                          {inner}
                        </button>
                      </li>
                    );
                  }
                  return (
                    <li
                      key={e.key}
                      className="self-start"
                      data-testid={`text-album-credit-${e.key}`}
                    >
                      {inner}
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
