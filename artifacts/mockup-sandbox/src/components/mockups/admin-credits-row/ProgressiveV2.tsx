import {
  Trash2,
  GripVertical,
  Plus,
  ChevronDown,
  ChevronUp,
  Upload,
  Search,
  Music2,
  Guitar,
  Mic2,
  AlertCircle,
  Sparkles,
  Info,
} from "lucide-react";

/**
 * Credits editor — Progressive v2 (admin)
 *
 * Priority-ordered sections, each one supports BOTH a manual entry path
 * (small artists, one-off credits) AND a spreadsheet import path
 * (Muso TSV, label-supplied CSV, publisher cue-sheet):
 *
 *   A · Performance         — REQUIRED  · who played what
 *   B · Writers             — STRONGLY ENCOURAGED · composition attribution
 *   C · Publishing splits   — OPTIONAL  · composition revenue %
 *   D · Mechanical splits   — OPTIONAL  · master/recording revenue %
 *
 * Real data: "Made for Us" (song-5-1) from the Helium album-5 import.
 */
export function ProgressiveV2() {
  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans antialiased">
      <div className="max-w-[720px] mx-auto space-y-3">
        {/* track header */}
        <div className="flex items-center justify-between pb-2">
          <div>
            <div className="text-slate-400 text-[11px] font-semibold uppercase tracking-wider">
              Track 1 of 14 · Helium
            </div>
            <h2 className="text-slate-900 text-[20px] font-bold">Made for Us</h2>
          </div>
          <button className="px-3 py-1.5 rounded-md border border-slate-200 bg-white text-slate-600 text-[12px] font-medium hover:bg-slate-50 inline-flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[#319ED8]" />
            Re-import from Muso
          </button>
        </div>

        {/* =================================================================== */}
        {/* A · PERFORMANCE  (required, primary)                                */}
        {/* =================================================================== */}
        <SectionShell
          letter="A"
          title="Performance"
          subtitle="Who played, sang, engineered or mixed"
          required
          count="2 people · 4 roles"
        >
          {/* Person 1 — Nick Carter, single role, collapsed */}
          <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50/60 group">
            <GripVertical className="w-4 h-4 text-slate-200 group-hover:text-slate-400 flex-shrink-0" />
            <Avatar gradient="from-pink-400 to-rose-600" initials="NC" />
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 text-[13px]">
                <span className="text-slate-900 font-semibold truncate">Nick Carter</span>
                <span className="text-slate-300">·</span>
                <span className="text-slate-600 truncate">Lead vocals</span>
              </div>
              <AliasChip count={4} />
            </div>
            <ChevronDown className="w-4 h-4 text-slate-300" />
          </div>

          {/* Person 2 — Vic Martin, 3 roles, EXPANDED */}
          <div className="bg-[#FAFBFC]">
            <div className="flex items-center gap-3 px-3 py-2.5">
              <GripVertical className="w-4 h-4 text-slate-300 flex-shrink-0" />
              <Avatar gradient="from-sky-400 to-indigo-600" initials="VM" />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 text-[13px]">
                  <span className="text-slate-900 font-semibold truncate">
                    Vic “BillboardKiller” Martin
                  </span>
                  <span className="text-slate-300">·</span>
                  <span className="text-slate-600 truncate">
                    Background vocals, Engineer, Mixing engineer
                  </span>
                </div>
                <AliasChip count={2} />
              </div>
              <ChevronUp className="w-4 h-4 text-slate-400" />
            </div>

            <div className="ml-10 mr-2 pb-2.5 space-y-1.5">
              <RoleRow icon={<Mic2 className="w-3 h-3" />} role="Background vocals" gear={null} />
              <RoleRow icon={<Music2 className="w-3 h-3" />} role="Engineer" gear={null} hint="Behind the desk" />
              <RoleRow icon={<Music2 className="w-3 h-3" />} role="Mixing engineer" gear={null} hint="Mix room" />
              <button className="ml-1 mt-1 inline-flex items-center gap-1 text-[#319ED8] text-[11px] font-medium hover:underline">
                <Plus className="w-3 h-3" /> Add another role for Vic
              </button>
            </div>
          </div>
        </SectionShell>

        {/* =================================================================== */}
        {/* B · WRITERS  (composition attribution — no money)                    */}
        {/* =================================================================== */}
        <SectionShell
          letter="B"
          title="Writers"
          subtitle="Composer, lyricist, producer credits"
          encouraged
          count="4 people · 11 roles"
        >
          <WriterRow
            initials="NC"
            gradient="from-pink-400 to-rose-600"
            name="Nick Carter"
            roles={["Lyricist", "Composer"]}
            aliases={4}
          />
          <WriterRow
            initials="VM"
            gradient="from-sky-400 to-indigo-600"
            name="Vic “BillboardKiller” Martin"
            roles={["Lyricist", "Composer", "Producer"]}
            aliases={2}
          />
          <WriterRow
            initials="BS"
            gradient="from-amber-400 to-orange-600"
            name="Bryan Shackle"
            roles={["Lyricist", "Composer", "Producer"]}
          />
          <WriterRow
            initials="BN"
            gradient="from-emerald-400 to-teal-600"
            name="Beck Nebel"
            roles={["Lyricist", "Composer", "Producer"]}
          />
        </SectionShell>

        {/* =================================================================== */}
        {/* C · PUBLISHING SPLITS  (optional — composition revenue %)            */}
        {/* =================================================================== */}
        <SectionShell
          letter="C"
          title="Publishing splits"
          subtitle="Composition revenue · who gets paid when the song is licensed"
          optional
          count="1 of 4 writers entered"
        >
          {/* org row */}
          <SplitRow
            kind="org"
            logoHint="SK"
            logoGradient="from-purple-500 to-fuchsia-600"
            name="Songs of Kaotic"
            badge="Publisher"
            extra="Hipgnosis admin"
            percent={null}
          />

          {/* empty-state hint inside the section */}
          <div className="flex items-start gap-2 px-3 py-3 bg-amber-50/60 border-t border-amber-100">
            <Info className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 text-[12px] text-amber-900">
              <span className="font-semibold">No percentages entered yet.</span>{" "}
              You can fill them by hand, paste a cue sheet, or skip — splits aren't required to publish the track.
              <div className="mt-1.5 flex items-center gap-2">
                <button className="px-2 py-0.5 rounded bg-white border border-amber-200 text-amber-800 text-[11px] font-medium hover:bg-amber-50">
                  One-writer shortcut → 100%
                </button>
                <button className="px-2 py-0.5 rounded bg-white border border-amber-200 text-amber-800 text-[11px] font-medium hover:bg-amber-50">
                  Even split across 4
                </button>
              </div>
            </div>
          </div>

          {/* totals */}
          <SplitTotal entered={0} target={100} />
        </SectionShell>

        {/* =================================================================== */}
        {/* D · MECHANICAL SPLITS  (optional — master revenue %)                */}
        {/* =================================================================== */}
        <SectionShell
          letter="D"
          title="Mechanical splits"
          subtitle="Master/recording revenue · who gets paid for the audio file itself"
          optional
          count="1 of 1 participant"
        >
          <SplitRow
            kind="org"
            logoHint="PP"
            logoGradient="from-slate-600 to-slate-900"
            name="Popkid Productions, Inc."
            badge="Record label"
            extra="100% master holder"
            percent={100}
          />
          <SplitTotal entered={100} target={100} />
        </SectionShell>

        {/* =================================================================== */}
        {/* E · GEAR & INSTRUMENT NOTES  (lowest priority, deferred)             */}
        {/* =================================================================== */}
        <SectionShell
          letter="E"
          title="Gear & instrument notes"
          subtitle="Specific instrument, tuning, room — drives SuperCredits™ instrument sheets"
          optional
          count="Not yet captured"
        >
          <div className="flex items-start gap-3 px-3 py-4">
            <Guitar className="w-5 h-5 text-slate-300 flex-shrink-0 mt-0.5" />
            <div className="flex-1 text-[12.5px] text-slate-600 leading-relaxed">
              <span className="font-semibold text-slate-900">Nothing here yet.</span>{" "}
              When you (or the artist) is ready, attach an instrument to any
              role above — e.g. "Background vocals · SM7B through a 1073" or
              "Lead vocals · no chain notes". This is what powers the fan-side
              instrument sheet + vendor links.
              <div className="mt-2 flex items-center gap-2">
                <button className="px-2.5 py-1 rounded-md border border-slate-200 bg-white text-slate-700 text-[11.5px] font-medium hover:bg-slate-50 inline-flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Attach gear to a role
                </button>
                <button className="px-2.5 py-1 rounded-md border border-slate-200 bg-white text-slate-700 text-[11.5px] font-medium hover:bg-slate-50 inline-flex items-center gap-1">
                  <Upload className="w-3 h-3" /> Import gear sheet (.csv)
                </button>
              </div>
            </div>
          </div>
        </SectionShell>

        {/* footer note */}
        <p className="text-slate-400 text-[11px] leading-relaxed px-1 pt-3">
          <span className="font-semibold text-slate-500">Why this order:</span>{" "}
          Performance is the only section we want every track to have — it's
          the credit fans actually see in SuperCredits™. Writer attribution is
          strongly encouraged because legal/PRO data depends on it.
          Splits and gear are optional and frequently arrive later (from a
          label spreadsheet, a publisher cue sheet, or a follow-up call with
          the artist). The editor treats them that way.
        </p>
      </div>
    </div>
  );
}

/* ============================ section shell =============================== */

function SectionShell({
  letter,
  title,
  subtitle,
  count,
  required,
  encouraged,
  optional,
  children,
}: {
  letter: string;
  title: string;
  subtitle: string;
  count: string;
  required?: boolean;
  encouraged?: boolean;
  optional?: boolean;
  children: React.ReactNode;
}) {
  const statusChip = required ? (
    <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 text-[10px] font-bold uppercase tracking-wide">
      Required
    </span>
  ) : encouraged ? (
    <span className="px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 text-[10px] font-bold uppercase tracking-wide">
      Encouraged
    </span>
  ) : optional ? (
    <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px] font-bold uppercase tracking-wide">
      Optional
    </span>
  ) : null;

  return (
    <section className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
      <header className="flex items-start gap-3 px-4 py-3 border-b border-slate-100 bg-gradient-to-b from-white to-slate-50/40">
        <div className="w-6 h-6 rounded-md bg-slate-900 text-white text-[12px] font-bold flex items-center justify-center flex-shrink-0">
          {letter}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-slate-900 text-[14px] font-bold">{title}</h3>
            {statusChip}
            <span className="text-slate-400 text-[11px]">· {count}</span>
          </div>
          <p className="text-slate-500 text-[11.5px] mt-0.5">{subtitle}</p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button className="px-2 py-1 rounded-md border border-slate-200 bg-white text-slate-600 text-[11.5px] hover:bg-slate-50 inline-flex items-center gap-1">
            <Upload className="w-3 h-3" /> Import
          </button>
          <button className="px-2 py-1 rounded-md bg-[#319ED8] text-white text-[11.5px] font-medium hover:bg-[#2890c8] inline-flex items-center gap-1">
            <Plus className="w-3 h-3" /> Add
          </button>
        </div>
      </header>
      <div className="divide-y divide-slate-100">{children}</div>
    </section>
  );
}

/* =============================== rows ===================================== */

function Avatar({ gradient, initials }: { gradient: string; initials: string }) {
  return (
    <div
      className={`w-7 h-7 rounded-full bg-gradient-to-br ${gradient} text-white text-[10.5px] font-bold flex items-center justify-center flex-shrink-0`}
    >
      {initials}
    </div>
  );
}

function AliasChip({ count }: { count: number }) {
  if (!count) return null;
  return (
    <button className="mt-0.5 text-slate-400 hover:text-slate-700 text-[10.5px] inline-flex items-center gap-1">
      <Search className="w-2.5 h-2.5" />
      {count} alias{count === 1 ? "" : "es"}
    </button>
  );
}

function RoleRow({
  icon,
  role,
  gear,
  hint,
}: {
  icon: React.ReactNode;
  role: string;
  gear: string | null;
  hint?: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1.5">
      <span className="px-1.5 py-0.5 rounded bg-sky-50 text-[#319ED8] text-[10.5px] font-semibold tracking-wide flex-shrink-0 inline-flex items-center gap-1">
        {icon}
        {role.toUpperCase()}
      </span>
      {gear ? (
        <span className="text-slate-900 text-[12.5px] truncate">{gear}</span>
      ) : (
        <span className="text-slate-400 text-[11.5px] italic">
          {hint || "No gear noted"}
        </span>
      )}
      <div className="ml-auto flex items-center gap-1">
        <button className="text-slate-300 text-[11px] hover:text-slate-700 px-1">
          Edit
        </button>
        <button className="text-slate-300 hover:text-red-500 p-0.5">
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

function WriterRow({
  initials,
  gradient,
  name,
  roles,
  aliases = 0,
}: {
  initials: string;
  gradient: string;
  name: string;
  roles: string[];
  aliases?: number;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50/60 group">
      <GripVertical className="w-4 h-4 text-slate-200 group-hover:text-slate-400 flex-shrink-0" />
      <Avatar gradient={gradient} initials={initials} />
      <div className="flex-1 min-w-0">
        <div className="text-slate-900 text-[13px] font-semibold truncate">
          {name}
        </div>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          {roles.map((r) => (
            <span
              key={r}
              className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10.5px] font-medium"
            >
              {r}
            </span>
          ))}
          {aliases > 0 && (
            <span className="text-slate-300 text-[10.5px]">
              · {aliases} alias{aliases === 1 ? "" : "es"}
            </span>
          )}
        </div>
      </div>
      <ChevronDown className="w-4 h-4 text-slate-300 flex-shrink-0" />
    </div>
  );
}

function SplitRow({
  kind,
  logoHint,
  logoGradient,
  name,
  badge,
  extra,
  percent,
}: {
  kind: "person" | "org";
  logoHint: string;
  logoGradient: string;
  name: string;
  badge: string;
  extra?: string;
  percent: number | null;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50/60 group">
      <GripVertical className="w-4 h-4 text-slate-200 group-hover:text-slate-400 flex-shrink-0" />
      <div
        className={`w-7 h-7 ${
          kind === "org" ? "rounded-md" : "rounded-full"
        } bg-gradient-to-br ${logoGradient} text-white text-[10.5px] font-bold flex items-center justify-center flex-shrink-0`}
      >
        {logoHint}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap text-[13px]">
          <span className="text-slate-900 font-semibold truncate">{name}</span>
          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-bold uppercase tracking-wide flex-shrink-0">
            {badge}
          </span>
        </div>
        {extra && (
          <div className="text-slate-500 text-[11px] mt-0.5 truncate">{extra}</div>
        )}
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {percent === null ? (
          <button className="px-2 py-1 rounded-md border border-dashed border-amber-300 bg-amber-50/50 text-amber-700 text-[11.5px] font-medium hover:bg-amber-50 inline-flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            Set %
          </button>
        ) : (
          <div className="flex items-center rounded-md border border-slate-200 bg-white px-2 py-1">
            <input
              defaultValue={percent}
              className="w-10 bg-transparent text-[13px] text-slate-900 text-right tabular-nums focus:outline-none"
            />
            <span className="text-slate-400 text-[11px] pl-0.5">%</span>
          </div>
        )}
      </div>
    </div>
  );
}

function SplitTotal({ entered, target }: { entered: number; target: number }) {
  const ok = entered === target;
  const empty = entered === 0;
  return (
    <div
      className={`flex items-center justify-between px-3 py-2 text-[12px] ${
        empty
          ? "bg-slate-50/80"
          : ok
          ? "bg-emerald-50/60"
          : "bg-amber-50/60"
      }`}
    >
      <span className="text-slate-500 font-medium">Total split</span>
      <span
        className={`font-bold tabular-nums ${
          empty
            ? "text-slate-400"
            : ok
            ? "text-emerald-600"
            : "text-amber-700"
        }`}
      >
        {empty ? "—" : `${entered}%`} <span className="text-slate-300 font-normal">/ {target}%</span>
      </span>
    </div>
  );
}
