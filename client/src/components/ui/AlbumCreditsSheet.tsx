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
        <div className="pb-3">
          {byRole.map(([role, entries]) => (
            <div
              key={role}
              className="px-5 py-2.5"
              data-testid={`row-album-credit-role-${role.replace(/\s+/g, "-").toLowerCase()}`}
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-white/45 mb-1.5">
                {role}
              </p>
              <div className="flex flex-col gap-1.5">
                {entries.map((e) => {
                  const inner = (
                    <span className="inline-flex items-center gap-2.5">
                      {e.photoUrl ? (
                        <img
                          src={e.photoUrl}
                          alt=""
                          style={{ width: 28, height: 28 }}
                          className="rounded-full object-cover flex-shrink-0"
                        />
                      ) : (
                        <span
                          aria-hidden
                          style={{ width: 28, height: 28 }}
                          className="rounded-full bg-white/10 flex-shrink-0 inline-flex items-center justify-center text-xs font-semibold text-white/70"
                        >
                          {e.name
                            .split(" ")
                            .filter(Boolean)
                            .slice(0, 2)
                            .map((w) => w[0]?.toUpperCase() ?? "")
                            .join("")}
                        </span>
                      )}
                      <span className="text-white text-sm font-medium">
                        {e.name}
                      </span>
                    </span>
                  );
                  if (e.personId && onOpenPerson) {
                    return (
                      <button
                        key={e.key}
                        type="button"
                        onClick={() => onOpenPerson(e.personId!)}
                        className="self-start text-left active:opacity-70 hover:opacity-90 transition-opacity"
                        data-testid={`link-album-credit-person-${e.personId}`}
                      >
                        {inner}
                      </button>
                    );
                  }
                  return (
                    <span
                      key={e.key}
                      className="self-start"
                      data-testid={`text-album-credit-${e.key}`}
                    >
                      {inner}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </SheetShell>
  );
}
