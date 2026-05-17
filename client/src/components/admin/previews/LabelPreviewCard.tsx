import { useState } from "react";

/**
 * Fan-side LabelSheet preview — graduated out of the monolithic Admin.tsx
 * so the new split admin pages (AdminLabel) can mount it in the AdminFrame
 * preview pane without dragging the whole 10K-line classic admin along.
 *
 * Same chrome the LabelSheet will eventually use in-app: floating toolbar
 * over a tall hero, Instagram-style profile row with avatar + name +
 * tagline, then About / Music N / Artists N tabs.
 */

export interface LabelPreviewLabel {
  id: string;
  name: string;
  logoUrl: string | null;
  coverUrl: string | null;
  bio: string | null;
  location: string | null;
  websiteUrl: string | null;
}

export interface LabelPreviewAlbum {
  id: string;
  title: string;
  artist: string | null;
  artwork: string | null;
  year: number | null;
  type: string;
  labelId: string | null;
  isHidden: boolean;
  primaryArtistId: string | null;
}

export interface LabelPreviewPerson {
  id: string;
  name: string;
  photoUrl: string | null;
  labelId: string | null;
}

export function LabelPreviewCard({
  label,
  albums,
  people,
}: {
  label: LabelPreviewLabel;
  albums: LabelPreviewAlbum[];
  people: LabelPreviewPerson[];
}) {
  const [tab, setTab] = useState<"about" | "music" | "artists">("about");
  const [bioExpanded, setBioExpanded] = useState(false);

  // Music = every album credited to this label (hidden albums excluded —
  // they're invisible to fans, so the count would lie).
  const labelAlbums = albums.filter(
    (a) => a.labelId === label.id && !a.isHidden,
  );
  const musicCount = labelAlbums.length;

  // Artists = the union of two paths so an artist surfaces here as soon as
  // either link exists: directly-signed people (people.labelId === label.id)
  // OR primary artists on this label's non-hidden albums. People-first pass
  // registers both id key and name key so a signed artist who also has a
  // snapshot-typed album on this label only renders once.
  const artistKeys = new Set<string>();
  const artistRows: { id: string; name: string; photoUrl: string | null }[] = [];
  const nameKey = (n: string) => `name:${n.trim().toLowerCase()}`;
  for (const p of people) {
    if (p.labelId !== label.id) continue;
    if (artistKeys.has(p.id)) continue;
    artistKeys.add(p.id);
    artistKeys.add(nameKey(p.name));
    artistRows.push({ id: p.id, name: p.name, photoUrl: p.photoUrl });
  }
  for (const a of labelAlbums) {
    if (a.primaryArtistId) {
      if (artistKeys.has(a.primaryArtistId)) continue;
      const person = people.find((p) => p.id === a.primaryArtistId);
      artistKeys.add(a.primaryArtistId);
      if (person) artistKeys.add(nameKey(person.name));
      artistRows.push({
        id: a.primaryArtistId,
        name: person?.name ?? a.artist ?? "Unknown artist",
        photoUrl: person?.photoUrl ?? null,
      });
      continue;
    }
    const snapshot = (a.artist ?? "").trim();
    if (!snapshot) continue;
    const nk = nameKey(snapshot);
    if (artistKeys.has(nk)) continue;
    artistKeys.add(nk);
    artistRows.push({ id: `name:${snapshot}`, name: snapshot, photoUrl: null });
  }
  artistRows.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
  const artistsCount = artistRows.length;

  const domain = (() => {
    const raw = label.websiteUrl ?? "";
    try {
      return new URL(raw).hostname.replace(/^www\./, "");
    } catch {
      return (label.websiteUrl ?? "")
        .replace(/^https?:\/\//, "")
        .replace(/\/$/, "");
    }
  })();
  const tagline = label.location ?? domain;
  const bioFallback = `${label.name || "This label"} releases music on GoodTunes. Tap the globe icon to visit their site, or browse their catalog and roster in the tabs below.`;

  const IconBtn = ({
    children,
    testId,
  }: {
    children: React.ReactNode;
    testId?: string;
  }) => (
    <div
      className="w-8 h-8 rounded-full flex items-center justify-center text-white/85"
      style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(12px)" }}
      data-testid={testId}
    >
      {children}
    </div>
  );

  return (
    <div className="flex flex-col items-center">
      <p className="text-slate-400 text-[10.5px] font-semibold uppercase tracking-[0.12em] mb-3">
        Live preview
      </p>
      <div
        className="relative rounded-[42px] overflow-hidden shadow-2xl"
        style={{
          width: 360,
          height: 760,
          background: "#00062B",
          padding: 10,
          boxShadow:
            "0 0 0 2px rgba(255,255,255,0.08), 0 30px 70px rgba(0,0,0,0.6)",
        }}
        data-testid="preview-label"
      >
        <div className="w-full h-full rounded-[32px] overflow-hidden bg-[#00062B] flex flex-col">
          <div className="flex-shrink-0 flex items-center justify-between px-5 pt-3 pb-1 text-[11px] font-medium text-white">
            <span>9:41</span>
            <span>● ● ●</span>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-hide relative">
            {/* Floating toolbar */}
            <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-3 pt-2">
              <IconBtn testId="preview-label-back">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M15 6l-6 6 6 6" />
                </svg>
              </IconBtn>
              <div className="flex items-center gap-1.5">
                <IconBtn>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                  </svg>
                </IconBtn>
                <IconBtn>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 3v12" />
                    <path d="M7 8l5-5 5 5" />
                    <path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
                  </svg>
                </IconBtn>
                <IconBtn>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M3 12h18" />
                    <path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18z" />
                  </svg>
                </IconBtn>
                <IconBtn>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </IconBtn>
              </div>
            </div>

            {/* Hero */}
            <div className="relative w-full" style={{ aspectRatio: "1 / 1.05" }}>
              {label.coverUrl ? (
                <img
                  src={label.coverUrl}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                  data-testid="img-preview-label-cover"
                />
              ) : (
                // No cover image — fall back to the brand navy. We tried
                // a blurred-logo "halo" background here and it looked
                // muddy / off-brand. Solid #00062B (the player bg) with
                // the logo floated dead-center reads as intentional
                // rather than a missing-asset placeholder.
                <div
                  className="absolute inset-0 flex items-center justify-center"
                  style={{ background: "#00062B" }}
                >
                  {label.logoUrl && (
                    <div className="w-32 h-32 rounded-full overflow-hidden bg-white flex items-center justify-center">
                      <img
                        src={label.logoUrl}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                </div>
              )}
              <div
                className="absolute inset-x-0 bottom-0 h-1/2"
                style={{
                  background:
                    "linear-gradient(to bottom, rgba(0,6,43,0) 0%, rgba(0,6,43,0.55) 35%, #00062B 70%, #00062B 100%)",
                }}
              />
            </div>

            {/* Profile row */}
            <div className="px-5 -mt-7 relative flex items-end gap-3">
              <div
                className="flex-shrink-0 w-[72px] h-[72px] rounded-full p-[3px]"
                style={{
                  background:
                    "linear-gradient(135deg, #4AFFCA 0%, #319ED8 50%, #7F10A7 100%)",
                }}
                data-testid="preview-label-avatar"
              >
                <div
                  className="w-full h-full rounded-full overflow-hidden flex items-center justify-center"
                  style={{ background: "#fff" }}
                >
                  {label.logoUrl ? (
                    <img
                      src={label.logoUrl}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span
                      className="text-[26px] font-bold"
                      style={{ color: "#00062B" }}
                    >
                      {(label.name || "?").charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
              </div>
              <div className="min-w-0 flex-1 pb-1">
                <h2
                  className="text-white font-bold leading-tight tracking-tight line-clamp-2 break-words"
                  style={{ fontSize: (label.name?.length ?? 0) > 18 ? 17 : 20 }}
                  data-testid="text-preview-label-name"
                >
                  {label.name || "Untitled label"}
                </h2>
                {tagline && (
                  <p
                    className="text-[13px] mt-0.5 line-clamp-2"
                    style={{ color: "rgba(235,235,245,0.7)" }}
                  >
                    {tagline}
                  </p>
                )}
              </div>
            </div>

            {/* Tabs — text-anchored underline (Apple Music) */}
            <div className="px-5 pt-4">
              <div className="flex gap-5 border-b border-white/10">
                {(
                  [
                    { key: "about", label: "About", count: undefined as number | undefined },
                    { key: "music", label: "Music", count: musicCount > 0 ? musicCount : undefined },
                    { key: "artists", label: "Artists", count: artistsCount > 0 ? artistsCount : undefined },
                  ] as const
                ).map((t) => {
                  const active = tab === t.key;
                  return (
                    <button
                      type="button"
                      key={t.key}
                      onClick={() => setTab(t.key)}
                      className="pb-2 text-[14px] font-semibold active:opacity-80 flex items-baseline gap-1.5"
                      style={{
                        color: active ? "#fff" : "rgba(235,235,245,0.55)",
                      }}
                      data-testid={`tab-preview-label-${t.key}`}
                    >
                      <span className="relative inline-block">
                        {t.label}
                        {active && (
                          <span
                            aria-hidden
                            className="absolute left-0 right-0 -bottom-[9px] h-[2px] rounded-full"
                            style={{ background: "#319ED8" }}
                          />
                        )}
                      </span>
                      {typeof t.count === "number" && (
                        <span
                          className="text-[12px] font-medium"
                          style={{ color: "rgba(235,235,245,0.45)" }}
                        >
                          {t.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {tab === "about" && (
              <div className="px-5 pt-4 pb-6">
                <h3 className="text-white text-[18px] font-bold leading-tight tracking-tight mb-1.5">
                  About {label.name || "this label"}
                </h3>
                {(() => {
                  const body = label.bio || bioFallback;
                  const isLong = body.length > 260;
                  return (
                    <>
                      <p
                        className={`text-[13px] leading-relaxed whitespace-pre-line ${
                          isLong && !bioExpanded ? "line-clamp-5" : ""
                        }`}
                        style={{ color: "rgba(235,235,245,0.72)" }}
                        data-testid="text-preview-label-bio"
                      >
                        {body}
                      </p>
                      {isLong && (
                        <button
                          type="button"
                          onClick={() => setBioExpanded((v) => !v)}
                          className="mt-1.5 text-[13px] font-semibold active:opacity-70"
                          style={{ color: "#319ED8" }}
                          data-testid="button-preview-label-bio-toggle"
                        >
                          {bioExpanded ? "less" : "more"}
                        </button>
                      )}
                    </>
                  );
                })()}

                {label.location && (
                  <div className="mt-4">
                    <p className="text-[12px] mb-0.5" style={{ color: "rgba(235,235,245,0.55)" }}>
                      Location
                    </p>
                    <p className="text-white text-[14px]">{label.location}</p>
                  </div>
                )}

                {domain && (
                  <div className="mt-4">
                    <p className="text-[12px] mb-0.5" style={{ color: "rgba(235,235,245,0.55)" }}>
                      Web
                    </p>
                    <p
                      className="text-[14px]"
                      style={{ color: "#319ED8" }}
                      data-testid="text-preview-label-website"
                    >
                      {domain}
                    </p>
                  </div>
                )}
              </div>
            )}

            {tab === "music" && (
              <div className="px-5 pt-4 pb-6">
                <h3 className="text-white text-[18px] font-bold leading-tight tracking-tight mb-3">
                  Albums
                </h3>
                {musicCount === 0 ? (
                  <p className="text-[13px]" style={{ color: "rgba(235,235,245,0.5)" }}>
                    No albums attached yet. Set this label on an album's editor to populate this list.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {labelAlbums.map((a) => (
                      <div
                        key={a.id}
                        className="flex flex-col text-left"
                        data-testid={`preview-label-album-${a.id}`}
                      >
                        <div
                          className="aspect-square rounded-2xl overflow-hidden"
                          style={{ boxShadow: "0 4px 20px rgba(0,0,0,0.4)" }}
                        >
                          {a.artwork ? (
                            <img
                              src={a.artwork}
                              alt={a.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div
                              className="w-full h-full flex items-center justify-center text-white/40 text-[28px]"
                              style={{ background: "rgba(255,255,255,0.06)" }}
                              aria-hidden
                            >
                              ♪
                            </div>
                          )}
                        </div>
                        <p className="text-white text-[13px] font-semibold leading-tight truncate mt-2">
                          {a.title}
                        </p>
                        <p
                          className="text-[11px] truncate mt-0.5"
                          style={{ color: "rgba(235,235,245,0.5)" }}
                        >
                          {a.year ? `${a.year} · ${a.type}` : a.type}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === "artists" && (
              <div className="px-5 pt-4 pb-6">
                <h3 className="text-white text-[18px] font-bold leading-tight tracking-tight mb-3">
                  Artists
                </h3>
                {artistsCount === 0 ? (
                  <p className="text-[13px]" style={{ color: "rgba(235,235,245,0.5)" }}>
                    No artists yet. They'll appear here once an album is attached to this label.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {artistRows.map((p) => {
                      const initials =
                        p.name
                          .split(" ")
                          .filter(Boolean)
                          .slice(0, 2)
                          .map((w) => w[0]?.toUpperCase() ?? "")
                          .join("") || "•";
                      return (
                        <div
                          key={p.id}
                          className="flex flex-col items-center text-center"
                          data-testid={`preview-label-artist-${p.id}`}
                        >
                          {p.photoUrl ? (
                            <img
                              src={p.photoUrl}
                              alt={p.name}
                              className="rounded-full object-cover"
                              style={{
                                width: "100%",
                                aspectRatio: "1 / 1",
                                boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
                              }}
                            />
                          ) : (
                            <div
                              className="rounded-full flex items-center justify-center text-white font-semibold"
                              style={{
                                width: "100%",
                                aspectRatio: "1 / 1",
                                background: "#319ED8",
                                fontSize: 32,
                                boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
                              }}
                              aria-hidden
                            >
                              {initials}
                            </div>
                          )}
                          <p className="text-white text-[13px] font-semibold leading-tight mt-2 line-clamp-2">
                            {p.name}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      <p className="text-slate-400 text-[11px] mt-3 text-center">
        Preview of the in-app LabelSheet — {musicCount}{" "}
        {musicCount === 1 ? "album" : "albums"} · {artistsCount}{" "}
        {artistsCount === 1 ? "artist" : "artists"}.
      </p>
    </div>
  );
}
