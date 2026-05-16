import { ChevronDown, Plus, Search } from "lucide-react";

/**
 * Credits overview — Roon-inspired three-column grid.
 *
 * Album-level read-only-ish browse for the admin: every credited person on
 * "Love Life Tragedy" grouped by role section, sorted by track count. Click
 * the "N tracks" link to drill into the per-track editor (the row-level
 * variants — TwoColumn / Progressive — cover that surface).
 *
 * Data is the real album-5 aggregate so we can judge density honestly.
 */

type CreditRow = {
  name: string;
  tracks: number;
  photoInitials: string;
  hasPhoto?: boolean;
};

// Initials in a Roon-style serif monogram are the visual unit even when a
// photo exists, so we always compute them. The few rows with hasPhoto=true
// render a gradient circle to stand in for the real photo (the mockup
// sandbox can't reach /objects/uploads in the main app's domain).
function initials(name: string): string {
  const cleaned = name.replace(/["“”".]/g, "");
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const composers: CreditRow[] = [
  { name: "Vic “BillboardKiller” Martin", tracks: 15, photoInitials: "", hasPhoto: true },
  { name: "Nick Carter", tracks: 14, photoInitials: "", hasPhoto: true },
  { name: "Beck Nebel", tracks: 6, photoInitials: "" },
  { name: "Bryan Shackle", tracks: 6, photoInitials: "", hasPhoto: true },
  { name: "Abraham Poythress", tracks: 2, photoInitials: "" },
  { name: "Adrian X Porter", tracks: 2, photoInitials: "" },
  { name: "Edward Carl Martin", tracks: 2, photoInitials: "" },
  { name: "John Christian Frasca", tracks: 2, photoInitials: "" },
  { name: "Vincent Anthony Venditto", tracks: 2, photoInitials: "" },
  { name: "vinny venditto", tracks: 2, photoInitials: "", hasPhoto: true },
  { name: "ASHBA", tracks: 1, photoInitials: "", hasPhoto: true },
  { name: "Danny Kortchmar", tracks: 1, photoInitials: "", hasPhoto: true },
  { name: "Don Henley", tracks: 1, photoInitials: "" },
  { name: "Ghost Kid", tracks: 1, photoInitials: "", hasPhoto: true },
  { name: "Josh Goode", tracks: 1, photoInitials: "", hasPhoto: true },
  { name: "Matthew Gerrard", tracks: 1, photoInitials: "", hasPhoto: true },
  { name: "Michele Vice-Maslin", tracks: 1, photoInitials: "" },
  { name: "Pierre Ramos", tracks: 1, photoInitials: "" },
  { name: "Stuart Crichton", tracks: 1, photoInitials: "", hasPhoto: true },
  { name: "Tommy Lee James", tracks: 1, photoInitials: "", hasPhoto: true },
  { name: "Jakub Liszko", tracks: 1, photoInitials: "" },
];

const lyricists: CreditRow[] = [
  { name: "Vic “BillboardKiller” Martin", tracks: 13, photoInitials: "", hasPhoto: true },
  { name: "Nick Carter", tracks: 12, photoInitials: "", hasPhoto: true },
  { name: "Beck Nebel", tracks: 6, photoInitials: "" },
  { name: "Bryan Shackle", tracks: 6, photoInitials: "", hasPhoto: true },
  { name: "vinny venditto", tracks: 4, photoInitials: "", hasPhoto: true },
  { name: "Abraham Poythress", tracks: 3, photoInitials: "" },
];

const producers: CreditRow[] = [
  { name: "Vic “BillboardKiller” Martin", tracks: 15, photoInitials: "", hasPhoto: true },
  { name: "Beck Nebel", tracks: 6, photoInitials: "" },
  { name: "Bryan Shackle", tracks: 6, photoInitials: "", hasPhoto: true },
  { name: "vinny venditto", tracks: 6, photoInitials: "", hasPhoto: true },
  { name: "Abraham Poythress", tracks: 5, photoInitials: "" },
  { name: "Let Mii Rok Out", tracks: 2, photoInitials: "" },
  { name: "Ghost Kid", tracks: 1, photoInitials: "", hasPhoto: true },
];

const engineers: { name: string; role: string; tracks: number; hasPhoto?: boolean }[] = [
  { name: "Vic “BillboardKiller” Martin", role: "Engineer · Mixing", tracks: 15, hasPhoto: true },
  { name: "Daniel Clarke-DiCandilo", role: "Engineer", tracks: 5, hasPhoto: true },
  { name: "Beck Nebel", role: "Mastering · Mixing", tracks: 5 },
  { name: "Cee “OhhMrCope” Copeland", role: "Mastering · Mixing", tracks: 4 },
  { name: "vinny venditto", role: "Mixing Engineer", tracks: 3, hasPhoto: true },
];

const performers: { name: string; role: string; tracks: number; hasPhoto?: boolean }[] = [
  { name: "Nick Carter", role: "Lead Vocals", tracks: 11, hasPhoto: true },
  { name: "Vic “BillboardKiller” Martin", role: "Background Vocals", tracks: 15, hasPhoto: true },
  { name: "Beck Nebel", role: "Background Vocals", tracks: 5 },
  { name: "Bryan Shackle", role: "Background Vocals", tracks: 5, hasPhoto: true },
  { name: "Daren Ashba", role: "Guitar", tracks: 2 },
  { name: "Josh Goode", role: "Guitar", tracks: 1, hasPhoto: true },
];

function Avatar({ name, hasPhoto }: { name: string; hasPhoto?: boolean }) {
  if (hasPhoto) {
    return (
      <div
        className="w-12 h-12 rounded-full flex-shrink-0 bg-gradient-to-br from-slate-300 to-slate-500 flex items-center justify-center text-white text-[13px] font-medium tracking-wide"
        aria-hidden="true"
      >
        {initials(name)}
      </div>
    );
  }
  return (
    <div
      className="w-12 h-12 rounded-full flex-shrink-0 flex items-center justify-center text-slate-500 select-none"
      style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
      aria-hidden="true"
    >
      <span className="text-[18px] tracking-[0.02em]">{initials(name)}</span>
    </div>
  );
}

function CreditCard({
  name,
  role,
  tracks,
  hasPhoto,
}: {
  name: string;
  role: string;
  tracks: number;
  hasPhoto?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <Avatar name={name} hasPhoto={hasPhoto} />
      <div className="min-w-0 pt-0.5">
        <p className="text-slate-900 text-[13.5px] font-semibold leading-tight truncate">
          {name}
        </p>
        <p className="text-slate-500 text-[12px] leading-tight mt-0.5">{role}</p>
        <button className="text-[#319ED8] text-[12px] mt-1 hover:underline">
          {tracks} {tracks === 1 ? "track" : "tracks"}
        </button>
      </div>
    </div>
  );
}

function Section({
  title,
  count,
  children,
  collapsible,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
  collapsible?: boolean;
}) {
  return (
    <section className="pt-6">
      <div className="flex items-baseline justify-between border-b border-slate-200 pb-2 mb-3">
        <h3 className="text-slate-900 text-[15px] font-semibold tracking-tight">
          {title}
          <span className="text-slate-400 font-normal ml-2 text-[13px]">({count})</span>
        </h3>
        {collapsible && (
          <button className="text-slate-400 text-[12px] hover:text-slate-700 flex items-center gap-1">
            Show less <ChevronDown className="w-3.5 h-3.5 rotate-180" />
          </button>
        )}
      </div>
      <div className="grid grid-cols-3 gap-x-6">{children}</div>
    </section>
  );
}

export function RoonGrid() {
  return (
    <div className="min-h-screen bg-white font-sans antialiased">
      <div className="max-w-[1100px] mx-auto px-10 py-8">
        {/* Album header strip */}
        <div className="flex items-start justify-between mb-1">
          <div>
            <h1 className="text-slate-900 text-[22px] font-semibold tracking-tight leading-none">
              Love Life Tragedy
            </h1>
            <p className="text-slate-500 text-[13px] mt-1">Nick Carter · 2025 · 16 tracks</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                placeholder="Search this album's credits"
                className="pl-8 pr-3 py-1.5 rounded-md border border-slate-200 bg-white text-[12.5px] text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-[#319ED8] w-[260px]"
              />
            </div>
            <button className="flex items-center gap-1.5 text-[12.5px] font-medium text-white bg-[#319ED8] hover:bg-[#2585b8] px-3 py-1.5 rounded-md">
              <Plus className="w-3.5 h-3.5" /> Credit
            </button>
          </div>
        </div>

        {/* Tab-ish breadcrumb to echo Roon's TRACKS · CREDITS · VERSIONS row */}
        <div className="flex items-center gap-6 border-b border-slate-200 pt-5">
          <button className="text-slate-400 text-[12.5px] font-semibold uppercase tracking-wider pb-2">
            Tracks
          </button>
          <button className="text-slate-900 text-[12.5px] font-semibold uppercase tracking-wider pb-2 border-b-2 border-[#319ED8] -mb-px">
            Credits
          </button>
          <button className="text-slate-400 text-[12.5px] font-semibold uppercase tracking-wider pb-2">
            Splits & Payments
          </button>
        </div>

        {/* Sections */}
        <Section title="Composers" count={composers.length}>
          {composers.map((c) => (
            <CreditCard
              key={c.name}
              name={c.name}
              role="Composer"
              tracks={c.tracks}
              hasPhoto={c.hasPhoto}
            />
          ))}
        </Section>

        <Section title="Lyricists" count={lyricists.length}>
          {lyricists.map((c) => (
            <CreditCard
              key={c.name}
              name={c.name}
              role="Lyricist"
              tracks={c.tracks}
              hasPhoto={c.hasPhoto}
            />
          ))}
        </Section>

        <Section title="Production" count={producers.length}>
          {producers.map((c) => (
            <CreditCard
              key={c.name}
              name={c.name}
              role="Producer"
              tracks={c.tracks}
              hasPhoto={c.hasPhoto}
            />
          ))}
        </Section>

        <Section title="Engineering & Mixing" count={engineers.length}>
          {engineers.map((c) => (
            <CreditCard
              key={`${c.name}-${c.role}`}
              name={c.name}
              role={c.role}
              tracks={c.tracks}
              hasPhoto={c.hasPhoto}
            />
          ))}
        </Section>

        <Section title="Performers" count={performers.length}>
          {performers.map((c) => (
            <CreditCard
              key={`${c.name}-${c.role}`}
              name={c.name}
              role={c.role}
              tracks={c.tracks}
              hasPhoto={c.hasPhoto}
            />
          ))}
        </Section>

        {/* Caption */}
        <p className="mt-10 text-slate-400 text-[11.5px] leading-relaxed max-w-[640px]">
          <span className="font-semibold text-slate-500">Idea:</span> Roon-style album-level
          overview. Every credit on the album is visible at a glance, grouped by what the
          person did and sorted by how often they did it. Click any "N tracks" to drop into
          the per-track editor (where your TwoColumn / Progressive row designs live). Search
          filters across all sections. Adding a credit from here opens a quick-add modal that
          asks "which tracks?" so we never have to repeat data entry per track.
        </p>
      </div>
    </div>
  );
}
