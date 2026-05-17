import { useEffect, useRef, useState } from "react";
import {
  Plus,
  Pencil,
  X,
  Users,
  Disc3,
  Sliders,
  Mic2,
  MapPin,
  ImageIcon,
  Search,
  ChevronRight,
} from "lucide-react";

// Album-level credits surface.
//
// Why this exists as its own tier:
// Producer / Mix engineer / Master engineer / Studio are almost always the same
// across every track on an album. Forcing the admin to type Sarah Lin as the
// Producer on all 10 tracks is the kind of busywork that kills SuperCredits™
// adoption before it starts. Pattern Apple Music uses on liner notes: a single
// "Album credits" block at the top, then per-track credits below.
//
// Data shape (planned schema addition):
//   albumCredits { id, albumId, personId, role, position }
//
// At read time, GET /api/songs/:id/credits merges album-level rows in with
// track-level rows, marking the album-level ones with `source: "album"` so
// the UI can dim them + show a small "Album" badge. A track-level row with
// the same role overrides the album-level one (per-track wins).

const ROLES = [
  { key: "producer",   icon: Disc3,     label: "Producer",        hint: "Whose vision steered the album." },
  { key: "mix",        icon: Sliders,   label: "Mix engineer",    hint: "Mixed every track unless overridden." },
  { key: "master",     icon: Sliders,   label: "Master engineer", hint: "Final mastering pass." },
  { key: "recorded",   icon: Mic2,      label: "Recorded by",     hint: "Tracking engineer." },
  { key: "studio",     icon: MapPin,    label: "Recorded at",     hint: "Studio or location." },
  { key: "artwork",    icon: ImageIcon, label: "Artwork",         hint: "Cover designer / photographer." },
] as const;

type RoleKey = (typeof ROLES)[number]["key"];

type Credit = { id: string; name: string; note?: string };

const INITIAL: Record<RoleKey, Credit[]> = {
  producer: [
    { id: "c1", name: "Sarah Lin" },
  ],
  mix: [
    { id: "c2", name: "Mike Torres" },
  ],
  master: [],
  recorded: [
    { id: "c3", name: "Sarah Lin", note: "also producer" },
  ],
  studio: [
    { id: "c4", name: "Sound City · Van Nuys" },
  ],
  artwork: [],
};

const ROSTER = [
  { id: "p1", name: "James Walsh" },
  { id: "p2", name: "Sarah Lin" },
  { id: "p3", name: "Mike Torres" },
  { id: "p4", name: "Ana Reyes" },
];

function initials(n: string) {
  return n
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0])
    .join("")
    .toUpperCase();
}

export default function AlbumCredits() {
  const [credits, setCredits] = useState<Record<RoleKey, Credit[]>>(INITIAL);
  // Which role is currently being added to (null = nothing open)
  const [activeRole, setActiveRole] = useState<RoleKey | null>(null);
  const [query, setQuery] = useState("");
  // Per replit.md "Destructive actions always confirm." We use a soft
  // two-tap pattern instead of a full sheet because removing one chip is
  // light-weight and a confirm sheet would feel heavier than the action.
  // Tapping X turns the chip rose with a "Remove?" label; second tap
  // confirms. The pending state auto-clears after 3s so the chip never
  // sits in a half-armed state forever.
  const [pendingRemove, setPendingRemove] = useState<{
    role: RoleKey;
    id: string;
  } | null>(null);

  const filledCount = Object.values(credits).flat().length;
  const totalRoles = ROLES.length;
  const rolesWithAny = ROLES.filter((r) => credits[r.key].length > 0).length;

  const handleAdd = (role: RoleKey, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCredits((c) => ({
      ...c,
      [role]: [...c[role], { id: `n-${Date.now()}`, name: trimmed }],
    }));
    setActiveRole(null);
    setQuery("");
  };

  // Two-tap remove. First tap arms the chip (shows "Remove?" in rose);
  // second tap on the same chip commits the delete.
  const removeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleRemove = (role: RoleKey, id: string) => {
    const armed =
      pendingRemove && pendingRemove.role === role && pendingRemove.id === id;
    if (armed) {
      setCredits((c) => ({
        ...c,
        [role]: c[role].filter((x) => x.id !== id),
      }));
      setPendingRemove(null);
      if (removeTimer.current) clearTimeout(removeTimer.current);
      return;
    }
    setPendingRemove({ role, id });
  };
  // Auto-disarm after 3s so a half-tapped chip can't sit in the rose
  // state forever.
  useEffect(() => {
    if (!pendingRemove) return;
    if (removeTimer.current) clearTimeout(removeTimer.current);
    removeTimer.current = setTimeout(() => setPendingRemove(null), 3000);
    return () => {
      if (removeTimer.current) clearTimeout(removeTimer.current);
    };
  }, [pendingRemove]);

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-6 font-sans antialiased">
      <div className="max-w-[760px] mx-auto">
        {/* Header strip — looks like the admin album page header so it sits
            naturally above the Tracks list when this graduates. */}
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-[#319ED8] to-[#7F10A7] flex-shrink-0 shadow-sm" />
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">
              Album
            </div>
            <h1 className="text-[22px] font-bold text-slate-900 leading-tight truncate">
              Storms
            </h1>
            <div className="text-[12.5px] text-slate-500">
              James Walsh · 2024
            </div>
          </div>
        </div>

        {/* The Album credits card. Visually parallels the Tracks list (white
            card, slate-100 hairlines, same padding rhythm). */}
        <section className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
          <header className="px-5 pt-4 pb-3 flex items-center gap-3 border-b border-slate-100">
            <Users className="w-4 h-4 text-slate-400" />
            <div className="flex-1 min-w-0">
              <h2 className="text-[14px] font-semibold text-slate-900">
                Album credits
              </h2>
              <p className="text-[11.5px] text-slate-500 leading-snug">
                Applied to every track unless a track sets its own.
              </p>
            </div>
            {/* Tiny status — same dot vocab as the track-row StatusMeter so the
                two surfaces feel related. */}
            <span className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold text-slate-400">
              {rolesWithAny}/{totalRoles}
              <span className="flex items-center gap-0.5">
                {ROLES.map((r) => (
                  <span
                    key={r.key}
                    className={[
                      "w-1.5 h-1.5 rounded-full",
                      credits[r.key].length > 0
                        ? "bg-emerald-500"
                        : "bg-slate-200",
                    ].join(" ")}
                  />
                ))}
              </span>
            </span>
          </header>

          <ul>
            {ROLES.map((role, idx) => {
              const Icon = role.icon;
              const isOpen = activeRole === role.key;
              const isLast = idx === ROLES.length - 1;
              const items = credits[role.key];
              const matches = ROSTER.filter((p) =>
                p.name.toLowerCase().includes(query.trim().toLowerCase()),
              );
              const showCreate =
                query.trim().length > 0 &&
                !ROSTER.some(
                  (p) =>
                    p.name.toLowerCase() === query.trim().toLowerCase(),
                );
              return (
                <li
                  key={role.key}
                  className={[
                    "px-5 py-3 transition-colors",
                    !isLast && "border-b border-slate-100",
                    isOpen ? "bg-slate-50/60" : "hover:bg-slate-50/50",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <div className="flex items-start gap-3">
                    {/* Role label column — fixed width so all roles line up. */}
                    <div className="flex items-center gap-2 w-[140px] flex-shrink-0 pt-1">
                      <Icon className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-[12.5px] font-semibold text-slate-700">
                        {role.label}
                      </span>
                    </div>

                    {/* Assigned chips + add button — fills remaining width. */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {items.length === 0 && !isOpen && (
                          <span className="text-[11.5px] text-slate-400 italic mr-1">
                            {role.hint}
                          </span>
                        )}
                        {items.map((c) => {
                          const armed =
                            pendingRemove !== null &&
                            pendingRemove.role === role.key &&
                            pendingRemove.id === c.id;
                          return (
                            <span
                              key={c.id}
                              className={[
                                "inline-flex items-center gap-1.5 pl-1 py-1 rounded-full border text-[11.5px] transition-colors",
                                armed
                                  ? "pr-2 bg-rose-50 border-rose-200 text-rose-700"
                                  : "pr-1 bg-white border-slate-200 text-slate-700",
                              ].join(" ")}
                            >
                              <span
                                className={[
                                  "w-5 h-5 rounded-full text-white text-[9px] font-bold inline-flex items-center justify-center",
                                  armed
                                    ? "bg-rose-500"
                                    : "bg-gradient-to-br from-[#319ED8] to-[#7F10A7]",
                                ].join(" ")}
                              >
                                {initials(c.name)}
                              </span>
                              <span className="pr-0.5 font-medium">
                                {c.name}
                              </span>
                              {c.note && !armed && (
                                <span className="text-[10px] text-slate-400">
                                  · {c.note}
                                </span>
                              )}
                              {armed ? (
                                // Confirm-state — full-word label, focus-ring,
                                // names the thing being destroyed per replit.md.
                                <button
                                  onClick={() => handleRemove(role.key, c.id)}
                                  autoFocus
                                  className="ml-0.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10.5px] font-semibold text-white bg-rose-500 hover:bg-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                                  aria-label={`Confirm remove ${c.name} from ${role.label}`}
                                >
                                  Remove?
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleRemove(role.key, c.id)}
                                  className="w-4 h-4 rounded-full text-slate-400 hover:text-rose-600 hover:bg-rose-50 inline-flex items-center justify-center ml-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
                                  aria-label={`Remove ${c.name} from ${role.label}`}
                                  title={`Remove ${c.name} — tap again to confirm`}
                                >
                                  <X className="w-2.5 h-2.5" />
                                </button>
                              )}
                            </span>
                          );
                        })}
                        {!isOpen && (
                          <button
                            onClick={() => {
                              setActiveRole(role.key);
                              setQuery("");
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-dashed border-slate-300 text-[11.5px] font-semibold text-slate-500 hover:text-[#319ED8] hover:border-[#319ED8] hover:bg-[#319ED8]/5"
                          >
                            <Plus className="w-3 h-3" />
                            Add
                          </button>
                        )}
                      </div>

                      {/* When this role is the active one, drop the picker
                          inline directly under its chip row. No modal, no
                          overlay — the row just grows. */}
                      {isOpen && (
                        <div className="mt-2 rounded-md border border-[#319ED8]/40 bg-[#319ED8]/5 p-2.5 space-y-2">
                          <label className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-white border border-slate-200 focus-within:border-[#319ED8] focus-within:ring-2 focus-within:ring-[#319ED8]/20">
                            <Search className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                            <input
                              autoFocus
                              value={query}
                              onChange={(e) => setQuery(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  // Pick the first match if there is one,
                                  // otherwise commit whatever was typed.
                                  if (matches.length > 0) {
                                    handleAdd(role.key, matches[0].name);
                                  } else if (query.trim()) {
                                    handleAdd(role.key, query.trim());
                                  }
                                } else if (e.key === "Escape") {
                                  setActiveRole(null);
                                }
                              }}
                              placeholder={`Add to ${role.label.toLowerCase()} — search roster or type a new name…`}
                              className="flex-1 min-w-0 bg-transparent text-[12.5px] text-slate-700 placeholder-slate-400 focus:outline-none"
                            />
                            <button
                              onClick={() => setActiveRole(null)}
                              className="w-5 h-5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 inline-flex items-center justify-center"
                              aria-label="Cancel"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </label>
                          <div className="flex flex-wrap gap-1.5">
                            {matches.map((p) => (
                              <button
                                key={p.id}
                                onClick={() => handleAdd(role.key, p.name)}
                                className="inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full border border-slate-200 bg-white hover:border-[#319ED8] hover:bg-[#319ED8]/5 text-[11.5px] text-slate-700"
                              >
                                <span className="w-5 h-5 rounded-full bg-gradient-to-br from-[#319ED8] to-[#7F10A7] text-white text-[9px] font-bold inline-flex items-center justify-center">
                                  {initials(p.name)}
                                </span>
                                {p.name}
                              </button>
                            ))}
                            {showCreate && (
                              <button
                                onClick={() =>
                                  handleAdd(role.key, query.trim())
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-dashed border-[#319ED8] text-[#319ED8] text-[11.5px] font-semibold hover:bg-[#319ED8]/5"
                              >
                                <Plus className="w-3 h-3" />
                                Create “{query.trim()}”
                              </button>
                            )}
                            {!showCreate && matches.length === 0 && (
                              <span className="text-[11.5px] text-slate-400 italic px-1 py-1">
                                No matches — keep typing to create.
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Footer — tells the user the override rule + nudges them to the
              tracks list so the relationship between the two tiers is clear. */}
          <footer className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <p className="text-[11px] text-slate-500">
              {filledCount} album credit{filledCount === 1 ? "" : "s"} ·
              applied to every track unless overridden.
            </p>
            <button className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[#319ED8] hover:underline">
              Go to tracks
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </footer>
        </section>

        {/* Tiny explainer card under the main one — sells the SuperCredits™
            promise without nagging.  Disappears once the album has Producer
            + Mix filled (the table-stakes pair). */}
        {(credits.producer.length === 0 || credits.mix.length === 0) && (
          <p className="mt-4 text-[12px] text-slate-500 leading-relaxed text-center">
            Tip · filling album-level Producer + Mix Engineer credits the
            roles inherit onto every track, so per-track credits start halfway
            done.
          </p>
        )}
      </div>
    </div>
  );
}
