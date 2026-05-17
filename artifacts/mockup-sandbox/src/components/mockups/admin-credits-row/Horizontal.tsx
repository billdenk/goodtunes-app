import { useEffect, useRef, useState } from "react";
import {
  Search,
  Plus,
  X,
  Sparkles,
  PenLine,
  Mic2,
  Sliders,
  Users,
  ChevronUp,
} from "lucide-react";
import nickCarterPhoto from "@/assets/people/nick-carter.jpg";

// Per-track Credits tile.
//
// Three buckets — Song · Performance · Production — same vocabulary as
// AlbumCredits.tsx so the album tier and track tier speak the same language.
// Card chrome, type scale, and chip styling mirror AlbumCredits + TracksList:
//   - card: rounded-xl, border-slate-200/80, shadow-sm
//   - section header: 14px title / 11.5px subtitle, tiny slate-400 icon
//   - chips: pill with small slate dot avatar; #319ED8 is the only accent
//
// People are laid out horizontally with their role(s) stacked underneath
// (Beatles-liner-notes shape). One neutral avatar color — no rainbow.
//
// Top of the card surfaces the Muso reconcile state ("12 credits imported")
// because that's how most rows arrive — Muso pulls names + roles, the admin
// then adds the ones Muso missed (writers, locals) via the inline picker.

type Bucket = "song" | "performance" | "production";

type Person = {
  id: string;
  name: string;
  photoUrl?: string;
  roles: string[];
  source: "muso" | "manual";
};

// Real data from the admin People table — Nick Carter has a headshot
// uploaded; the rest fall back to slate initial circles (same pattern as
// the live admin shows today).
const SONG: Person[] = [
  { id: "p1", name: "Nick Carter", photoUrl: nickCarterPhoto, roles: ["Composer", "Lyricist"], source: "muso" },
  { id: "p2", name: "Vic Martin", roles: ["Composer"], source: "muso" },
  { id: "p3", name: "Bryan Shackle", roles: ["Composer", "Lyricist"], source: "muso" },
  { id: "p4", name: "Beck Nebel", roles: ["Composer"], source: "muso" },
];

const PERFORMANCE: Person[] = [
  { id: "p1", name: "Nick Carter", photoUrl: nickCarterPhoto, roles: ["Lead vocals", "Acoustic guitar"], source: "muso" },
  { id: "p2", name: "Vic Martin", roles: ["Background vocals", "Piano"], source: "muso" },
  { id: "p5", name: "Jenna Reid", roles: ["Background vocals"], source: "muso" },
  { id: "p6", name: "Marcus Lee", roles: ["Bass"], source: "muso" },
  { id: "p7", name: "Tomás Diaz", roles: ["Drums"], source: "muso" },
];

const PRODUCTION: Person[] = [
  { id: "p2", name: "Vic Martin", roles: ["Producer", "Mix engineer"], source: "muso" },
  { id: "p3", name: "Bryan Shackle", roles: ["Producer"], source: "muso" },
  { id: "p8", name: "Sara Holm", roles: ["Tracking engineer"], source: "muso" },
  { id: "p9", name: "Greg Calbi", roles: ["Mastering"], source: "muso" },
];

const ROSTER = [
  "Nick Carter", "Vic Martin", "Bryan Shackle", "Beck Nebel", "Jenna Reid",
  "Marcus Lee", "Tomás Diaz", "Sara Holm", "Greg Calbi", "Aisha Patel",
  "Diego Romero", "Hana Watanabe",
];

const ROLE_SUGGESTIONS: Record<Bucket, string[]> = {
  song: ["Composer", "Lyricist", "Arranger"],
  performance: [
    "Lead vocals", "Background vocals", "Acoustic guitar", "Electric guitar",
    "Bass", "Drums", "Piano", "Keys", "Strings",
  ],
  production: [
    "Producer", "Mix engineer", "Tracking engineer", "Mastering",
    "Recorded at", "Programming",
  ],
};

function initials(n: string) {
  return n
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0])
    .join("")
    .toUpperCase();
}

function PersonColumn({
  p,
  armed,
  onRemove,
}: {
  p: Person;
  armed: boolean;
  onRemove: (id: string) => void;
}) {
  // Two-tap remove, mirroring AlbumCredits.tsx. First tap arms (rose ring +
  // "Remove?" label); second tap commits. Auto-disarms in 3s via parent.
  return (
    <div className="flex w-[96px] shrink-0 flex-col items-center text-center">
      <div className="relative">
        <div
          className={[
            "flex h-10 w-10 items-center justify-center overflow-hidden rounded-full text-[11px] font-semibold transition",
            armed
              ? "ring-2 ring-rose-400"
              : "",
            p.photoUrl ? "bg-slate-100" : "bg-slate-200 text-slate-600",
          ].join(" ")}
        >
          {p.photoUrl ? (
            <img
              src={p.photoUrl}
              alt={p.name}
              className="h-full w-full object-cover"
            />
          ) : (
            initials(p.name)
          )}
        </div>
        <button
          onClick={() => onRemove(p.id)}
          className={[
            "absolute -right-1 -top-1 inline-flex items-center justify-center rounded-full shadow ring-1 transition",
            armed
              ? "h-5 px-1.5 gap-0.5 bg-rose-500 text-white ring-rose-500 text-[9.5px] font-semibold"
              : "h-4 w-4 bg-white text-slate-400 ring-slate-200 hover:text-slate-700",
          ].join(" ")}
          aria-label={armed ? `Confirm remove ${p.name}` : `Remove ${p.name}`}
        >
          {armed ? (
            <>
              <X className="h-2.5 w-2.5" strokeWidth={2.5} /> Remove?
            </>
          ) : (
            <X className="h-2.5 w-2.5" strokeWidth={2.5} />
          )}
        </button>
      </div>
      <div className="mt-2 text-[12.5px] font-semibold leading-tight text-slate-900">
        {p.name}
      </div>
      <div className="mt-0.5 space-y-0 text-[11.5px] leading-snug text-slate-500">
        {p.roles.map((r) => (
          <div key={r}>{r}</div>
        ))}
      </div>
    </div>
  );
}

function AddPicker({
  onAdd,
  onClose,
  existing,
}: {
  onAdd: (name: string) => void;
  onClose: () => void;
  existing: string[];
}) {
  const [query, setQuery] = useState("");

  const matches = query
    ? ROSTER.filter(
        (n) =>
          n.toLowerCase().includes(query.toLowerCase()) && !existing.includes(n),
      ).slice(0, 5)
    : ROSTER.filter((n) => !existing.includes(n)).slice(0, 5);

  const pick = (name: string) => {
    if (!name.trim()) return;
    onAdd(name.trim());
    setQuery("");
    onClose();
  };

  return (
    <div className="w-full max-w-[420px]">
      <label className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-white border border-[#319ED8] ring-2 ring-[#319ED8]/20">
        <Search className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") pick(query);
            if (e.key === "Escape") {
              onClose();
              setQuery("");
            }
          }}
          placeholder="Search a person or type a new name…"
          className="flex-1 min-w-0 bg-transparent text-[12.5px] text-slate-700 placeholder-slate-400 focus:outline-none"
        />
        <button
          onClick={() => {
            onClose();
            setQuery("");
          }}
          className="w-5 h-5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 inline-flex items-center justify-center"
          aria-label="Cancel"
        >
          <X className="h-3 w-3" />
        </button>
      </label>

      <div className="mt-1.5 rounded-md border border-slate-200 bg-white shadow-sm overflow-hidden">
        {matches.map((name) => (
          <button
            key={name}
            onClick={() => pick(name)}
            className="flex w-full items-center justify-between px-2.5 py-1.5 text-left text-[12.5px] text-slate-700 hover:bg-[#319ED8]/5"
          >
            <span className="inline-flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-[9.5px] font-semibold text-slate-600">
                {initials(name)}
              </span>
              {name}
            </span>
            <Plus className="h-3 w-3 text-slate-400" />
          </button>
        ))}
        {query && !ROSTER.some((n) => n.toLowerCase() === query.toLowerCase()) && (
          <button
            onClick={() => pick(query)}
            className="flex w-full items-center gap-2 border-t border-slate-100 bg-slate-50 px-2.5 py-1.5 text-left text-[12px] font-medium text-[#319ED8] hover:bg-[#319ED8]/10"
          >
            <Plus className="h-3 w-3" strokeWidth={2.5} />
            Create new person: "{query}"
          </button>
        )}
      </div>
      <p className="mt-1.5 text-[10.5px] text-slate-400 px-1">
        Add their role on this track after you pick them.
      </p>
    </div>
  );
}

function Section({
  bucket,
  title,
  Icon,
  people,
  setPeople,
}: {
  bucket: Bucket;
  title: string;
  Icon: React.ComponentType<{ className?: string }>;
  people: Person[];
  setPeople: (next: Person[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);
  const removeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const musoCount = people.filter((p) => p.source === "muso").length;
  const existingNames = people.map((p) => p.name);

  const handleAdd = (name: string) => {
    if (existingNames.includes(name)) return;
    const defaultRole = ROLE_SUGGESTIONS[bucket][0];
    setPeople([
      ...people,
      { id: `n-${Date.now()}`, name, roles: [defaultRole], source: "manual" },
    ]);
  };
  // Two-tap remove. First tap arms, second commits. Auto-disarms after 3s
  // so the rose state can't sit forever — same pattern as AlbumCredits.
  const handleRemove = (id: string) => {
    if (pendingRemove === id) {
      setPeople(people.filter((p) => p.id !== id));
      setPendingRemove(null);
      if (removeTimer.current) clearTimeout(removeTimer.current);
      return;
    }
    setPendingRemove(id);
  };
  useEffect(() => {
    if (!pendingRemove) return;
    if (removeTimer.current) clearTimeout(removeTimer.current);
    removeTimer.current = setTimeout(() => setPendingRemove(null), 3000);
    return () => {
      if (removeTimer.current) clearTimeout(removeTimer.current);
    };
  }, [pendingRemove]);

  return (
    <section>
      {/* Section header sits flush — no nested card chrome since the parent
          "Credits" panel already provides border/background. */}
      <header className="flex items-center gap-2 mb-2">
        <Icon className="w-3.5 h-3.5 text-slate-400" />
        <h2 className="text-[12px] font-semibold uppercase tracking-wider text-slate-500">
          {title}
        </h2>
        <span className="text-[11px] text-slate-400">
          · {people.length} {people.length === 1 ? "person" : "people"}
          {musoCount > 0 && (
            <span className="inline-flex items-center gap-0.5 ml-1.5">
              <Sparkles className="h-2.5 w-2.5 text-[#319ED8]" />
              {musoCount} from Muso
            </span>
          )}
        </span>
        <div className="flex-1" />
        <button
          onClick={() => setAdding((v) => !v)}
          className="px-2 py-0.5 rounded-md text-slate-500 text-[11px] font-medium hover:text-[#319ED8] hover:bg-[#319ED8]/5 inline-flex items-center gap-1 flex-shrink-0"
        >
          <Plus className="h-3 w-3" strokeWidth={2.5} />
          Add
        </button>
      </header>

      {adding && (
        <div className="mb-3 rounded-md border border-slate-200 bg-slate-50 p-2">
          <AddPicker
            onAdd={handleAdd}
            onClose={() => setAdding(false)}
            existing={existingNames}
          />
        </div>
      )}

      <div className="relative">
        <div className="-mx-1 overflow-x-auto pb-1">
          <div className="flex gap-3 px-1">
            {people.map((p) => (
              <PersonColumn
                key={p.id}
                p={p}
                armed={pendingRemove === p.id}
                onRemove={handleRemove}
              />
            ))}
            {people.length === 0 && (
              <div className="text-[11.5px] italic text-slate-400 py-3 px-1">
                No one credited yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export function Horizontal() {
  const [song, setSong] = useState(SONG);
  const [performance, setPerformance] = useState(PERFORMANCE);
  const [production, setProduction] = useState(PRODUCTION);

  const totalMuso = [song, performance, production]
    .flat()
    .filter((p) => p.source === "muso").length;

  return (
    // Page wrapper just frames the panel for the sandbox preview. In the
    // real admin, this whole content drops straight into the existing
    // "Credits" optional panel — replacing the WRITERS / PERFORMERS lists.
    <div className="min-h-screen bg-slate-100 py-6 px-5 font-sans antialiased">
      <div className="max-w-[640px] mx-auto">
        {/* ============== START: actual Credits-panel content ============== */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          {/* Parent panel header — matches the live admin's Credits header
              (small Users icon · "Credits" · summary · chevron). */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
            <Users className="h-4 w-4 text-[#319ED8]" />
            <span className="text-[13px] font-semibold text-slate-900">
              Credits
            </span>
            <div className="flex-1" />
            <span className="text-[11px] text-slate-400">
              {song.length + performance.length + production.length} credits ·{" "}
              {totalMuso} from Muso
            </span>
            <ChevronUp className="h-4 w-4 text-slate-400" />
          </div>

          {/* Panel body — three Grammy-axis sections, separated by hairlines,
              no nested cards. */}
          <div className="px-4 py-3">
            {/* Slim Muso reconcile strip — same affordance as before, just
                shrunk to one line so it doesn't dominate the panel. */}
            <div className="flex items-center gap-2 mb-3 rounded-md border border-[#319ED8]/30 bg-[#319ED8]/5 px-2.5 py-1.5">
              <Sparkles className="h-3.5 w-3.5 text-[#319ED8] flex-shrink-0" />
              <span className="text-[11.5px] text-slate-700 flex-1 min-w-0 truncate">
                <span className="font-semibold">{totalMuso}</span> imported from
                Muso · review and add anyone missed.
              </span>
              <button className="px-2 py-0.5 rounded text-[11px] text-[#319ED8] font-medium hover:bg-[#319ED8]/10 flex-shrink-0">
                Re-import
              </button>
            </div>

            <div className="divide-y divide-slate-100">
              <div className="py-3 first:pt-0">
                <Section
                  bucket="song"
                  title="Song"
                  Icon={PenLine}
                  people={song}
                  setPeople={setSong}
                />
              </div>
              <div className="py-3">
                <Section
                  bucket="performance"
                  title="Performance"
                  Icon={Mic2}
                  people={performance}
                  setPeople={setPerformance}
                />
              </div>
              <div className="py-3 last:pb-0">
                <Section
                  bucket="production"
                  title="Production"
                  Icon={Sliders}
                  people={production}
                  setPeople={setProduction}
                />
              </div>
            </div>
          </div>
        </div>
        {/* ============== END: actual Credits-panel content ============== */}
      </div>
    </div>
  );
}

export default Horizontal;
