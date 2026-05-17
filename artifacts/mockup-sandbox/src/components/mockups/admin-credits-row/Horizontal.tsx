import { useEffect, useRef, useState } from "react";
import {
  Search,
  Plus,
  X,
  Sparkles,
  Users,
  ChevronUp,
  ChevronDown,
  Download,
  Pencil,
  UserPlus,
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
  photoUrl?: string;
  roles: string[];
  source: "muso" | "manual";
};

// Real credits for "Wild Heart" off Love Life Tragedy — the highest-credit
// song on the album (20 total). Pulled from track_writers + track_performers
// and re-bucketed Grammy-style: Lyricist + Composer → Song; Vocals + Guitar
// → Performance; Producer + Engineer + Mixing + Mastering → Production.
// Photos resolve from the same origin as the parent app (/objects/uploads/*).
const NICK = "/objects/uploads/7a8089b0-59aa-4318-9996-8273b2fd576b.jpg";
const VIC = "/objects/uploads/39807426-b4cf-494d-8502-a0ea8d654d4b.jpg";
const ASHBA_PHOTO = "/objects/uploads/629ab8ca-c96c-4aaa-b7fc-47aacf0df202.jpg";
const VINNY = "/objects/uploads/77cf6f4a-245d-4c20-b957-06e2cc2e5131.jpg";
const DANIEL = "/objects/uploads/f7505947-2f40-496f-8cd9-7dfb852e2606.jpg";

const SONG: Person[] = [
  { id: "p-nick",    name: "Nick Carter",                  photoUrl: NICK,        roles: ["Lyricist", "Composer"], source: "muso" },
  { id: "p-vic",     name: "Vic \u201CBillboardKiller\u201D Martin", photoUrl: VIC, roles: ["Lyricist", "Composer"], source: "muso" },
  { id: "p-ashba",   name: "ASHBA",                        photoUrl: ASHBA_PHOTO, roles: ["Lyricist", "Composer"], source: "muso" },
  { id: "p-abraham", name: "Abraham Poythress",                                   roles: ["Lyricist"],            source: "muso" },
  { id: "p-vinny",   name: "vinny venditto",               photoUrl: VINNY,       roles: ["Lyricist"],            source: "muso" },
  { id: "p-daren",   name: "Daren Ashba",                                         roles: ["Lyricist"],            source: "muso" },
];

const PERFORMANCE: Person[] = [
  { id: "p-nick-v",  name: "Nick Carter",                  photoUrl: NICK, roles: ["Vocals"],            source: "muso" },
  { id: "p-vic-v",   name: "Vic \u201CBillboardKiller\u201D Martin", photoUrl: VIC,  roles: ["Background Vocals"], source: "muso" },
  { id: "p-daren-g", name: "Daren Ashba",                                  roles: ["Guitar"],            source: "muso" },
];

const PRODUCTION: Person[] = [
  { id: "p-vic-p",   name: "Vic \u201CBillboardKiller\u201D Martin", photoUrl: VIC, roles: ["Producer", "Engineer", "Mixing Engineer"], source: "muso" },
  { id: "p-abraham-p", name: "Abraham Poythress",                                  roles: ["Producer"],                              source: "muso" },
  { id: "p-vinny-p", name: "vinny venditto",               photoUrl: VINNY,        roles: ["Producer", "Mixing Engineer"],           source: "muso" },
  { id: "p-daniel",  name: "Daniel Clarke-DiCandilo",      photoUrl: DANIEL,       roles: ["Engineer"],                              source: "muso" },
  { id: "p-cee",     name: "Cee \u201COhhMrCope\u201D Copeland",                   roles: ["Mastering Engineer"],                    source: "muso" },
];

const ROSTER = [
  "Nick Carter", "Vic \u201CBillboardKiller\u201D Martin", "ASHBA",
  "Abraham Poythress", "vinny venditto", "Daren Ashba",
  "Daniel Clarke-DiCandilo", "Cee \u201COhhMrCope\u201D Copeland",
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
  editing,
  onRemove,
}: {
  p: Person;
  armed: boolean;
  editing: boolean;
  onRemove: (id: string) => void;
}) {
  // Two-tap remove, mirroring AlbumCredits.tsx. First tap arms (rose ring +
  // "Remove?" label); second tap commits. Auto-disarms in 3s via parent.
  // X is hidden outside edit mode so the panel reads calm by default.
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
        {editing && (
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
        )}
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
  people,
  setPeople,
}: {
  bucket: Bucket;
  title: string;
  people: Person[];
  setPeople: (next: Person[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);
  const removeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const existingNames = people.map((p) => p.name);

  // Click-away closes the pencil popover.
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = () => setMenuOpen(false);
    const t = setTimeout(() => window.addEventListener("click", onClick), 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener("click", onClick);
    };
  }, [menuOpen]);

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

  // The pencil trigger stays visible whenever the section is in a "loud"
  // state (editing or its menu/picker is open) so the affordance doesn't
  // disappear mid-interaction.
  const triggerVisible = editing || menuOpen || adding;

  return (
    <section className="group/section">
      <header className="flex items-center gap-2 mb-2">
        <h2 className="text-[12px] font-semibold uppercase tracking-wider text-slate-500">
          {title}
        </h2>
        {editing && (
          <span className="text-[10.5px] uppercase tracking-wider font-semibold text-[#319ED8]">
            · Editing
          </span>
        )}
        <div className="flex-1" />

        {/* Pencil menu — hover-revealed unless something's already open.
            Tap → choose Add person (opens search picker) or Edit credits
            (lets you remove people from this song; removals are scoped
            to this song's credits, not the People table). */}
        <div
          className="relative"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={`Edit ${title} credits`}
            className={[
              "h-7 w-7 rounded-md inline-flex items-center justify-center transition",
              "text-slate-500 hover:text-[#319ED8] hover:bg-[#319ED8]/5",
              "focus-visible:opacity-100 transition-opacity",
              triggerVisible
                ? "opacity-100"
                : "opacity-0 group-hover/section:opacity-100",
              editing ? "bg-[#319ED8]/10 text-[#319ED8]" : "",
            ].join(" ")}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 z-10 w-44 rounded-md border border-slate-200 bg-white shadow-md py-1">
              <button
                onClick={() => {
                  setMenuOpen(false);
                  setAdding(true);
                }}
                className="w-full text-left px-3 py-2 text-[12px] text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2"
              >
                <UserPlus className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                <span className="flex-1">Add person</span>
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  setEditing((v) => !v);
                  setPendingRemove(null);
                }}
                className="w-full text-left px-3 py-2 text-[12px] text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2"
              >
                {editing ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-[#319ED8] flex-shrink-0" />
                    <span className="flex-1">Done editing</span>
                  </>
                ) : (
                  <>
                    <Pencil className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                    <span className="flex-1">Edit credits</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
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

      {editing && (
        <p className="mb-2 text-[10.5px] text-slate-500 italic">
          Tap a person's X to remove them from this song. They stay in your People list.
        </p>
      )}

      {/* Wrapping grid — extra people flow onto the next row instead of
          hiding behind a horizontal scroll. */}
      <div className="flex flex-wrap gap-x-3 gap-y-4 -mx-1 px-1">
        {people.map((p) => (
          <PersonColumn
            key={p.id}
            p={p}
            armed={pendingRemove === p.id}
            editing={editing}
            onRemove={handleRemove}
          />
        ))}
        {people.length === 0 && (
          <div className="text-[11.5px] italic text-slate-400 py-3 px-1">
            No one credited yet.
          </div>
        )}
      </div>
    </section>
  );
}

function ImportMenu() {
  const [open, setOpen] = useState(false);
  // Click-away to close.
  useEffect(() => {
    if (!open) return;
    const onClick = () => setOpen(false);
    // Defer one tick so the same click that opens it doesn't immediately close.
    const t = setTimeout(() => window.addEventListener("click", onClick), 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener("click", onClick);
    };
  }, [open]);

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="px-2.5 py-1 rounded-md border border-slate-200 bg-white text-slate-700 text-[11.5px] font-medium hover:border-[#319ED8] hover:text-[#319ED8] inline-flex items-center gap-1 flex-shrink-0"
      >
        <Download className="h-3 w-3" strokeWidth={2.5} />
        Import
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-10 w-48 rounded-md border border-slate-200 bg-white shadow-md py-1">
          <button
            onClick={() => setOpen(false)}
            className="w-full text-left px-3 py-2 text-[12px] text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2"
          >
            <Sparkles className="h-3.5 w-3.5 text-[#319ED8] flex-shrink-0" />
            <span className="flex-1">From Muso.ai</span>
          </button>
          {/* Future: SoundExchange, AllMusic, manual CSV — same menu. */}
        </div>
      )}
    </div>
  );
}

export function Horizontal() {
  const [song, setSong] = useState(SONG);
  const [performance, setPerformance] = useState(PERFORMANCE);
  const [production, setProduction] = useState(PRODUCTION);

  return (
    // Page wrapper just frames the panel for the sandbox preview. In the
    // real admin, the inner card content drops straight into the existing
    // "Credits" optional panel — replacing the WRITERS / PERFORMERS lists.
    <div className="min-h-screen bg-slate-100 py-6 px-5 font-sans antialiased">
      <div className="max-w-[640px] mx-auto">
        {/* ============== START: actual Credits-panel content ============== */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          {/* Parent panel header. Counters are gone — the people grid is
              its own answer to "how many?". Import dropdown lives here so
              bulk re-pull from Muso (and future SoundExchange / AllMusic)
              is one click away without dominating the body. */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
            <Users className="h-4 w-4 text-[#319ED8]" />
            <span className="text-[13px] font-semibold text-slate-900">
              Credits
            </span>
            <div className="flex-1" />
            <ImportMenu />
            <ChevronUp className="h-4 w-4 text-slate-400" />
          </div>

          {/* Body — three Grammy-axis sections, hairline-separated. */}
          <div className="px-4 py-3">
            <div className="divide-y divide-slate-100">
              <div className="py-3 first:pt-0">
                <Section
                  bucket="song"
                  title="Song"
                  people={song}
                  setPeople={setSong}
                />
              </div>
              <div className="py-3">
                <Section
                  bucket="performance"
                  title="Performance"
                  people={performance}
                  setPeople={setPerformance}
                />
              </div>
              <div className="py-3 last:pb-0">
                <Section
                  bucket="production"
                  title="Production"
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
