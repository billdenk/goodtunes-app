import { useState } from "react";
import { Search, Plus, ChevronRight, X, Mic, Guitar, Sliders } from "lucide-react";

type Person = {
  id: string;
  name: string;
  roles: string[];
  accent: string;
  initials: string;
};

const SONG: Person[] = [
  { id: "p1", name: "Nick Carter", roles: ["Composer", "Lyricist"], accent: "#319ED8", initials: "NC" },
  { id: "p2", name: "Vic Martin", roles: ["Composer"], accent: "#7F10A7", initials: "VM" },
  { id: "p3", name: "Bryan Shackle", roles: ["Composer", "Lyricist"], accent: "#4AFFCA", initials: "BS" },
  { id: "p4", name: "Beck Nebel", roles: ["Composer"], accent: "#FF5470", initials: "BN" },
];

const PERFORMANCE: Person[] = [
  { id: "p1", name: "Nick Carter", roles: ["Lead vocals", "Acoustic guitar"], accent: "#319ED8", initials: "NC" },
  { id: "p2", name: "Vic Martin", roles: ["Background vocals", "Piano"], accent: "#7F10A7", initials: "VM" },
  { id: "p5", name: "Jenna Reid", roles: ["Background vocals"], accent: "#FFB454", initials: "JR" },
  { id: "p6", name: "Marcus Lee", roles: ["Bass"], accent: "#5BD68E", initials: "ML" },
  { id: "p7", name: "Tomás Diaz", roles: ["Drums"], accent: "#D85B9F", initials: "TD" },
];

const PRODUCTION: Person[] = [
  { id: "p2", name: "Vic Martin", roles: ["Producer", "Mix engineer"], accent: "#7F10A7", initials: "VM" },
  { id: "p3", name: "Bryan Shackle", roles: ["Producer"], accent: "#4AFFCA", initials: "BS" },
  { id: "p8", name: "Sara Holm", roles: ["Tracking engineer"], accent: "#A7B6FF", initials: "SH" },
  { id: "p9", name: "Greg Calbi", roles: ["Mastering"], accent: "#FFE066", initials: "GC" },
];

const ROSTER = [
  "Nick Carter", "Vic Martin", "Bryan Shackle", "Beck Nebel", "Jenna Reid",
  "Marcus Lee", "Tomás Diaz", "Sara Holm", "Greg Calbi", "Aisha Patel",
  "Diego Romero", "Hana Watanabe",
];

function PersonChip({ p, onRemove }: { p: Person; onRemove: (id: string) => void }) {
  return (
    <div className="flex w-[124px] shrink-0 flex-col items-center text-center" data-testid={`person-${p.id}`}>
      <div className="relative">
        <div
          className="flex h-16 w-16 items-center justify-center rounded-full text-base font-semibold text-white shadow-sm"
          style={{ backgroundColor: p.accent }}
        >
          {p.initials}
        </div>
        <button
          onClick={() => onRemove(p.id)}
          className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white text-slate-400 shadow ring-1 ring-slate-200 transition hover:text-rose-500"
          aria-label={`Remove ${p.name}`}
        >
          <X className="h-3 w-3" strokeWidth={2.5} />
        </button>
      </div>
      <div className="mt-2 text-[13.5px] font-semibold leading-tight text-slate-900">{p.name}</div>
      <div className="mt-1 space-y-0.5 text-[12px] leading-tight text-slate-600">
        {p.roles.map((r) => (
          <div key={r}>{r}</div>
        ))}
      </div>
    </div>
  );
}

function AddPersonRow({
  section,
  placeholder,
  onAdd,
}: {
  section: string;
  placeholder: string;
  onAdd: (name: string, isNew: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const matches = query
    ? ROSTER.filter((n) => n.toLowerCase().includes(query.toLowerCase())).slice(0, 5)
    : [];

  const pick = (name: string, isNew: boolean) => {
    onAdd(name, isNew);
    setQuery("");
    setOpen(false);
  };

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          placeholder={placeholder}
          className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-[13.5px] text-slate-900 placeholder:text-slate-400 focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200"
          data-testid={`input-add-${section}`}
        />
        {open && (matches.length > 0 || query) && (
          <div className="absolute left-0 right-0 top-11 z-10 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
            {matches.map((name) => (
              <button
                key={name}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(name, false);
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-[13.5px] text-slate-700 hover:bg-slate-50"
              >
                <span>{name}</span>
                <Plus className="h-3.5 w-3.5 text-slate-400" />
              </button>
            ))}
            {query && (
              <button
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(query, true);
                }}
                className="flex w-full items-center gap-2 border-t border-slate-100 bg-slate-50 px-3 py-2 text-left text-[13px] font-medium text-slate-700 hover:bg-slate-100"
              >
                <Plus className="h-3.5 w-3.5 text-slate-500" />
                Create new person: "{query}"
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const ACCENTS = ["#319ED8", "#7F10A7", "#4AFFCA", "#FF5470", "#00062B"];

function Section({
  letter,
  title,
  subtitle,
  icon,
  tint,
  people,
  setPeople,
  placeholder,
}: {
  letter: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  tint: string;
  people: Person[];
  setPeople: (next: Person[]) => void;
  placeholder: string;
}) {
  const handleAdd = (name: string, isNew: boolean) => {
    if (people.some((p) => p.name === name)) return;
    const initials = name
      .split(/\s+/)
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase();
    const accent = ACCENTS[people.length % ACCENTS.length];
    setPeople([
      ...people,
      {
        id: `new-${Date.now()}`,
        name,
        roles: [isNew ? "New — add role" : "Add role"],
        accent,
        initials: initials || "?",
      },
    ]);
  };

  const handleRemove = (id: string) => setPeople(people.filter((p) => p.id !== id));

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <header className="mb-3 flex items-start gap-3">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white"
          style={{ backgroundColor: tint }}
        >
          {icon}
        </div>
        <div className="flex-1">
          <div className="flex items-baseline gap-2">
            <h3 className="text-[15px] font-semibold leading-tight text-slate-900">{title}</h3>
            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
              {letter} · {people.length} {people.length === 1 ? "person" : "people"}
            </span>
          </div>
          <p className="mt-0.5 text-[12.5px] leading-snug text-slate-500">{subtitle}</p>
        </div>
      </header>

      <div className="relative">
        <div className="-mx-1 overflow-x-auto pb-1">
          <div className="flex gap-3 px-1">
            {people.map((p) => (
              <PersonChip key={p.id} p={p} onRemove={handleRemove} />
            ))}
          </div>
        </div>
        {/* edge fade to hint horizontal scroll */}
        <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-white to-transparent" />
      </div>

      <AddPersonRow section={letter.toLowerCase()} placeholder={placeholder} onAdd={handleAdd} />
    </section>
  );
}

export function Horizontal() {
  const [song, setSong] = useState(SONG);
  const [performance, setPerformance] = useState(PERFORMANCE);
  const [production, setProduction] = useState(PRODUCTION);

  return (
    <div className="min-h-screen bg-slate-50 px-5 py-6 font-sans">
      <div className="mx-auto max-w-[940px]">
        {/* Track header */}
        <div className="mb-5 flex items-center gap-3">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-lg text-white shadow-sm"
            style={{
              background:
                "linear-gradient(135deg, #00062B 0%, #319ED8 55%, #7F10A7 100%)",
            }}
          >
            <span className="text-base font-bold">3</span>
          </div>
          <div className="flex-1">
            <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
              Track 3 · Credits
            </div>
            <h2 className="text-[19px] font-semibold leading-tight text-slate-900">
              Made for Us
            </h2>
            <div className="text-[12.5px] text-slate-500">
              Nick Carter · <span className="italic">Love Life Tragedy</span>
            </div>
          </div>
          <button className="flex items-center gap-1 rounded-full bg-slate-900 px-3 py-1.5 text-[12px] font-medium text-white">
            <Plus className="h-3.5 w-3.5" />
            Quick add
          </button>
        </div>

        <div className="space-y-3.5">
          <Section
            letter="Song"
            title="Song"
            subtitle="Who wrote it — composers, lyricists, and arrangers."
            icon={<svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>}
            tint="#319ED8"
            people={song}
            setPeople={setSong}
            placeholder="Add a writer, composer, or lyricist…"
          />
          <Section
            letter="Performance"
            title="Performance"
            subtitle="Who played and sang on this recording."
            icon={<Mic className="h-4 w-4" strokeWidth={2.2} />}
            tint="#7F10A7"
            people={performance}
            setPeople={setPerformance}
            placeholder="Add a vocalist or instrumentalist…"
          />
          <Section
            letter="Production"
            title="Production"
            subtitle="Producers, engineers, mixers, and mastering."
            icon={<Sliders className="h-4 w-4" strokeWidth={2.2} />}
            tint="#0E8F6E"
            people={production}
            setPeople={setProduction}
            placeholder="Add a producer, engineer, or mixer…"
          />
        </div>

        <p className="mt-5 text-center text-[11.5px] leading-relaxed text-slate-400">
          Tap any person later to add the specific instrument they played,
          tuning notes, or gear (deferred — drill-down lives in the song view).
        </p>
      </div>
    </div>
  );
}

export default Horizontal;
