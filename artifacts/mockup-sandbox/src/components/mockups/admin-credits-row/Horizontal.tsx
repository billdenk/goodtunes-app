import { useState } from "react";
import {
  Search,
  Plus,
  X,
  Sparkles,
  PenLine,
  Mic2,
  Sliders,
  Check,
} from "lucide-react";

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
  roles: string[];
  source: "muso" | "manual";
};

const SONG: Person[] = [
  { id: "p1", name: "Nick Carter", roles: ["Composer", "Lyricist"], source: "muso" },
  { id: "p2", name: "Vic Martin", roles: ["Composer"], source: "muso" },
  { id: "p3", name: "Bryan Shackle", roles: ["Composer", "Lyricist"], source: "muso" },
  { id: "p4", name: "Beck Nebel", roles: ["Composer"], source: "muso" },
];

const PERFORMANCE: Person[] = [
  { id: "p1", name: "Nick Carter", roles: ["Lead vocals", "Acoustic guitar"], source: "muso" },
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
  onRemove,
}: {
  p: Person;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="flex w-[110px] shrink-0 flex-col items-center text-center">
      <div className="relative">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-200 text-[12px] font-semibold text-slate-600">
          {initials(p.name)}
        </div>
        <button
          onClick={() => onRemove(p.id)}
          className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-white text-slate-400 shadow ring-1 ring-slate-200 transition hover:text-rose-500"
          aria-label={`Remove ${p.name}`}
        >
          <X className="h-2.5 w-2.5" strokeWidth={2.5} />
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

function AddRow({
  bucket,
  onAdd,
  existing,
}: {
  bucket: Bucket;
  onAdd: (name: string) => void;
  existing: string[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const matches = query
    ? ROSTER.filter(
        (n) =>
          n.toLowerCase().includes(query.toLowerCase()) && !existing.includes(n),
      ).slice(0, 5)
    : ROSTER.filter((n) => !existing.includes(n)).slice(0, 5);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-dashed border-slate-300 text-[11.5px] font-semibold text-slate-500 hover:text-[#319ED8] hover:border-[#319ED8] hover:bg-[#319ED8]/5"
      >
        <Plus className="h-3 w-3" strokeWidth={2.5} />
        Add person
      </button>
    );
  }

  const pick = (name: string) => {
    if (!name.trim()) return;
    onAdd(name.trim());
    setQuery("");
    setOpen(false);
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
              setOpen(false);
              setQuery("");
            }
          }}
          placeholder="Search a person or type a new name…"
          className="flex-1 min-w-0 bg-transparent text-[12.5px] text-slate-700 placeholder-slate-400 focus:outline-none"
        />
        <button
          onClick={() => {
            setOpen(false);
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
  subtitle,
  Icon,
  people,
  setPeople,
}: {
  bucket: Bucket;
  title: string;
  subtitle: string;
  Icon: React.ComponentType<{ className?: string }>;
  people: Person[];
  setPeople: (next: Person[]) => void;
}) {
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
  const handleRemove = (id: string) =>
    setPeople(people.filter((p) => p.id !== id));

  return (
    <section className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
      <header className="px-5 pt-4 pb-3 flex items-center gap-3 border-b border-slate-100">
        <Icon className="w-4 h-4 text-slate-400" />
        <div className="flex-1 min-w-0">
          <h2 className="text-[14px] font-semibold text-slate-900">{title}</h2>
          <p className="text-[11.5px] text-slate-500 leading-snug">{subtitle}</p>
        </div>
        <span className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
          {people.length} {people.length === 1 ? "person" : "people"}
        </span>
      </header>

      <div className="px-5 py-4">
        <div className="relative">
          <div className="-mx-1 overflow-x-auto pb-1">
            <div className="flex gap-3 px-1">
              {people.map((p) => (
                <PersonColumn key={p.id} p={p} onRemove={handleRemove} />
              ))}
              {people.length === 0 && (
                <div className="text-[11.5px] italic text-slate-400 py-3 px-1">
                  No one credited yet — Muso didn't find anyone for this bucket.
                </div>
              )}
            </div>
          </div>
          <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-white to-transparent" />
        </div>

        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <AddRow bucket={bucket} onAdd={handleAdd} existing={existingNames} />
          {musoCount > 0 && (
            <span className="inline-flex items-center gap-1 text-[10.5px] text-slate-400">
              <Check className="h-3 w-3 text-emerald-500" />
              {musoCount} from Muso
            </span>
          )}
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
    <div className="min-h-screen bg-slate-50 py-8 px-6 font-sans antialiased">
      <div className="max-w-[760px] mx-auto">
        {/* Track header — same chrome as AlbumCredits */}
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-[#00062B] via-[#319ED8] to-[#7F10A7] flex-shrink-0 shadow-sm flex items-center justify-center text-white font-bold text-[15px]">
            3
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">
              Track 3 · Credits
            </div>
            <h1 className="text-[22px] font-bold text-slate-900 leading-tight truncate">
              Made for Us
            </h1>
            <div className="text-[12.5px] text-slate-500">
              Nick Carter · <span className="italic">Love Life Tragedy</span>
            </div>
          </div>
        </div>

        {/* Muso reconcile banner — shows where the data came from */}
        <div className="flex items-center justify-between gap-3 mb-3 rounded-xl border border-[#319ED8]/30 bg-[#319ED8]/5 px-4 py-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="h-4 w-4 text-[#319ED8] flex-shrink-0" />
            <div className="min-w-0">
              <div className="text-[12.5px] font-semibold text-slate-900">
                {totalMuso} credits imported from Muso
              </div>
              <div className="text-[11px] text-slate-500 leading-snug">
                Review and add anyone Muso missed below.
              </div>
            </div>
          </div>
          <button className="px-2.5 py-1 rounded-md border border-slate-200 bg-white text-slate-600 text-[11.5px] hover:bg-slate-50 inline-flex items-center gap-1 flex-shrink-0">
            <Sparkles className="h-3 w-3 text-[#319ED8]" />
            Re-import
          </button>
        </div>

        <div className="space-y-3">
          <Section
            bucket="song"
            title="Song"
            subtitle="Who wrote it — composers, lyricists, arrangers."
            Icon={PenLine}
            people={song}
            setPeople={setSong}
          />
          <Section
            bucket="performance"
            title="Performance"
            subtitle="Who played and sang on this recording."
            Icon={Mic2}
            people={performance}
            setPeople={setPerformance}
          />
          <Section
            bucket="production"
            title="Production"
            subtitle="Producers, engineers, mixers, mastering."
            Icon={Sliders}
            people={production}
            setPeople={setProduction}
          />
        </div>

        <p className="mt-5 text-center text-[11px] leading-relaxed text-slate-400 italic">
          Tap any person to add the specific instrument they played, tuning notes, or gear
          — drill-down lives in the song view.
        </p>
      </div>
    </div>
  );
}

export default Horizontal;
