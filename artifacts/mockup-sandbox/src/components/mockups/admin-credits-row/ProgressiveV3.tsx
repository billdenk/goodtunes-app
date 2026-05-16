import {
  Trash2,
  GripVertical,
  Plus,
  ChevronDown,
  ChevronUp,
  Upload,
  Search,
  Music2,
  Mic2,
  AlertCircle,
  Sparkles,
  Info,
  ChevronLeft,
  ChevronRight,
  Check,
  Copy,
  Globe2,
  Building2,
  FileCheck2,
  Filter,
  Link2,
  StickyNote,
} from "lucide-react";

/**
 * Credits editor — Progressive v3 (admin)
 *
 * Changes vs. v2 (informed by CD Baby reference):
 *  - Track header: chip strip (14 tracks · ✓ when Performance is filled),
 *    prev/next, "Save & next track" CTA.
 *  - Section A (Performance): gear is now folded into each role row
 *    (no more Section E). Engineers/mixers can attach console/mic/plugin.
 *  - Section B (Writers): expandable to capture publisher + share %
 *    inline. The old Section C (Publishing splits) is folded in here.
 *    Adds legal name, country of residence, PRO/IPI, "collect royalties".
 *  - Section C (was D) Mechanical splits — unchanged.
 *  - Songwriter Bank–style picker pattern, with "+ New writer" inline.
 *  - "Apply to every track on Helium" bulk action on Section A header.
 */
export function ProgressiveV3() {
  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans antialiased">
      <div className="max-w-[720px] mx-auto space-y-3">
        {/* ============================ TRACK HEADER ============================ */}
        <div className="space-y-2 pb-1">
          {/* breadcrumb */}
          <div className="text-slate-400 text-[11px] font-medium flex items-center gap-1.5">
            <span>Albums</span>
            <ChevronRight className="w-3 h-3" />
            <span>Love Life Tragedy</span>
            <ChevronRight className="w-3 h-3" />
            <span className="text-slate-700 font-semibold">Tracks</span>
          </div>

          {/* title row */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button className="w-8 h-8 rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 flex items-center justify-center flex-shrink-0">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="min-w-0">
                <div className="text-slate-400 text-[11px] font-semibold uppercase tracking-wider">
                  Track 1 of 17 · Love Life Tragedy · Nick Carter
                </div>
                <h2 className="text-slate-900 text-[20px] font-bold truncate">
                  Made for Us
                </h2>
              </div>
              <button className="w-8 h-8 rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 flex items-center justify-center flex-shrink-0">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <button className="px-3 py-1.5 rounded-md border border-slate-200 bg-white text-slate-600 text-[12px] font-medium hover:bg-slate-50 inline-flex items-center gap-1.5 flex-shrink-0">
              <Sparkles className="w-3.5 h-3.5 text-[#319ED8]" />
              Re-import from Muso
            </button>
          </div>

          {/* tabs */}
          <div className="flex items-center gap-4 border-b border-slate-200 pt-1">
            <Tab label="Details" />
            <Tab label="Credits" active />
            <Tab label="Lyrics" />
            <Tab label="Files" />
          </div>

          {/* chip strip — 17 tracks */}
          <div className="flex items-center gap-1 overflow-x-auto pt-2 pb-1 -mx-1 px-1">
            {Array.from({ length: 17 }).map((_, i) => {
              const n = i + 1;
              const isActive = n === 1;
              const isDone = [2, 3, 4, 7].includes(n);
              const isWarn = [5, 8].includes(n);
              return (
                <button
                  key={n}
                  className={[
                    "h-7 min-w-[28px] px-2 rounded-md text-[11px] font-bold tabular-nums inline-flex items-center justify-center gap-1 flex-shrink-0 border transition-colors",
                    isActive
                      ? "bg-slate-900 text-white border-slate-900"
                      : isDone
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                      : isWarn
                      ? "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                      : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50",
                  ].join(" ")}
                >
                  {isDone && !isActive ? (
                    <Check className="w-3 h-3" />
                  ) : isWarn && !isActive ? (
                    <AlertCircle className="w-3 h-3" />
                  ) : null}
                  {n}
                </button>
              );
            })}
            <span className="text-slate-300 text-[11px] px-2 flex-shrink-0">
              4 of 17 complete
            </span>
          </div>

          {/* dense-mode filter row */}
          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-1.5">
              <button className="px-2 py-1 rounded-md border border-slate-200 bg-white text-slate-600 text-[11px] font-medium hover:bg-slate-50 inline-flex items-center gap-1">
                <Filter className="w-3 h-3" /> Show incomplete only
              </button>
              <button className="px-2 py-1 rounded-md bg-slate-100 text-slate-700 text-[11px] font-medium hover:bg-slate-200 inline-flex items-center gap-1">
                <AlertCircle className="w-3 h-3 text-amber-600" /> 7 unresolved
              </button>
            </div>
            <span className="text-slate-400 text-[10.5px] font-medium">
              On this track: 0 missing % · 3 missing legal · 2 missing instrument
            </span>
          </div>
        </div>

        {/* =================================================================== */}
        {/* A · PERFORMANCE  (required, primary)                                 */}
        {/* =================================================================== */}
        <SectionShell
          letter="A"
          title="Performance"
          subtitle="Who played, sang, engineered or mixed — and on what gear"
          required
          count="2 people · 4 roles"
          unresolved="2 missing instrument"
          extraHeaderAction={
            <button className="px-2 py-1 rounded-md border border-slate-200 bg-white text-slate-600 text-[11px] hover:bg-slate-50 inline-flex items-center gap-1">
              <Copy className="w-3 h-3" /> Apply to all 17 tracks
            </button>
          }
        >
          {/* Person 1 — Nick Carter, single role, collapsed */}
          <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50/60 group">
            <GripVertical className="w-4 h-4 text-slate-200 group-hover:text-slate-400 flex-shrink-0" />
            <Avatar gradient="from-pink-400 to-rose-600" initials="NC" />
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 text-[13px]">
                <span className="text-slate-900 font-semibold truncate">
                  Nick Carter
                </span>
                <span className="text-slate-300">·</span>
                <span className="text-slate-600 truncate">Lead vocals</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <AliasChip count={4} />
                <span className="text-slate-300 text-[10.5px]">·</span>
                <span className="text-slate-400 text-[10.5px] italic">
                  No gear noted
                </span>
              </div>
            </div>
            <ChevronDown className="w-4 h-4 text-slate-300" />
          </div>

          {/* Person 2 — Vic Martin, 3 roles, EXPANDED with gear */}
          <div className="bg-[#FAFBFC]">
            <div className="flex items-center gap-3 px-3 py-2.5">
              <GripVertical className="w-4 h-4 text-slate-300 flex-shrink-0" />
              <Avatar gradient="from-sky-400 to-indigo-600" initials="VM" />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 text-[13px]">
                  <span className="text-slate-900 font-semibold truncate">
                    Vic "BillboardKiller" Martin
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
              <RoleRow
                icon={<Mic2 className="w-3 h-3" />}
                role="Background vocals"
                instrument="Neumann U87"
                instrumentCategory="Microphone"
                notes="Through Avalon VT-737SP"
              />
              <RoleRow
                icon={<Music2 className="w-3 h-3" />}
                role="Engineer"
                instrument="SSL 4000 G+"
                instrumentCategory="Console"
                notes="Pro Tools Ultimate, Studio A"
              />
              <RoleRow
                icon={<Music2 className="w-3 h-3" />}
                role="Mixing engineer"
                instrument={null}
                notes={null}
                hint="Link a console, mic, plugin or room…"
              />
              <button className="ml-1 mt-1 inline-flex items-center gap-1 text-[#319ED8] text-[11px] font-medium hover:underline">
                <Plus className="w-3 h-3" /> Add another role for Vic
              </button>
            </div>
          </div>

          {/* add-person picker (Songwriter Bank pattern, reused) */}
          <div className="px-3 py-2.5 bg-slate-50/40">
            <div className="flex items-center gap-2 rounded-md border border-dashed border-slate-300 bg-white px-2.5 py-2">
              <Search className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              <input
                placeholder="Add a performer — search your roster, or type a new name…"
                className="flex-1 bg-transparent text-[12.5px] text-slate-700 placeholder-slate-400 focus:outline-none"
              />
              <span className="text-slate-300 text-[10.5px]">
                33 in roster
              </span>
            </div>
          </div>
        </SectionShell>

        {/* =================================================================== */}
        {/* B · WRITERS  (composition attribution + publishing splits folded in) */}
        {/* =================================================================== */}
        <SectionShell
          letter="B"
          title="Writers & publishing"
          subtitle="Composer / lyricist / producer credits — plus publisher splits if you have them"
          encouraged
          count="4 writers · 2 orgs"
          unresolved="3 missing legal · 75% unassigned"
          extraHeaderAction={
            <button className="px-2 py-1 rounded-md border border-slate-200 bg-white text-slate-600 text-[11px] hover:bg-slate-50 inline-flex items-center gap-1">
              <Copy className="w-3 h-3" /> Apply to all 17 tracks
            </button>
          }
        >
          {/* Writer 1 — collapsed */}
          <WriterRow
            initials="NC"
            gradient="from-pink-400 to-rose-600"
            name="Nick Carter"
            roles={["Lyricist", "Composer"]}
            aliases={4}
            sharePct={25}
            publisher="Songs of Kaotic"
          />

          {/* Writer 2 — EXPANDED with legal fields + share */}
          <div className="bg-[#FAFBFC]">
            <div className="flex items-center gap-3 px-3 py-2.5">
              <GripVertical className="w-4 h-4 text-slate-300 flex-shrink-0" />
              <Avatar gradient="from-sky-400 to-indigo-600" initials="VM" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-[13px]">
                  <span className="text-slate-900 font-semibold truncate">
                    Vic "BillboardKiller" Martin
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  <RoleChip>Lyricist</RoleChip>
                  <RoleChip>Composer</RoleChip>
                  <RoleChip>Producer</RoleChip>
                  <span className="text-slate-300 text-[10.5px]">· 2 aliases</span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="flex items-center rounded-md border border-slate-200 bg-white px-2 py-1">
                  <input
                    defaultValue={25}
                    className="w-9 bg-transparent text-[13px] text-slate-900 text-right tabular-nums focus:outline-none"
                  />
                  <span className="text-slate-400 text-[11px] pl-0.5">%</span>
                </div>
                <ChevronUp className="w-4 h-4 text-slate-400" />
              </div>
            </div>

            {/* legal / royalty fields */}
            <div className="ml-10 mr-3 pb-3 grid grid-cols-2 gap-x-3 gap-y-2">
              <Field
                label="Legal name"
                value="Victor Allen Martin Jr."
                icon={<FileCheck2 className="w-3 h-3" />}
              />
              <Field
                label="Country of residence"
                value="United States"
                icon={<Globe2 className="w-3 h-3" />}
              />
              <Field
                label="PRO"
                value="BMI"
                hint="#00497281"
              />
              <Field
                label="IPI / CAE"
                value="00578291422"
              />
              <Field
                label="Publisher"
                value="Songs of Kaotic"
                icon={<Building2 className="w-3 h-3" />}
                hint="Admin: Hipgnosis"
              />
              <div className="flex items-center gap-2 mt-3">
                <div className="w-7 h-4 rounded-full bg-emerald-500 relative">
                  <span className="absolute right-0.5 top-0.5 w-3 h-3 rounded-full bg-white" />
                </div>
                <span className="text-[11.5px] text-slate-700 font-medium">
                  Collect royalties on this credit
                </span>
              </div>
            </div>
          </div>

          {/* Writer 3 + 4 — collapsed, no publisher yet */}
          <WriterRow
            initials="BS"
            gradient="from-amber-400 to-orange-600"
            name="Bryan Shackle"
            roles={["Lyricist", "Composer", "Producer"]}
            sharePct={null}
          />
          <WriterRow
            initials="BN"
            gradient="from-emerald-400 to-teal-600"
            name="Beck Nebel"
            roles={["Lyricist", "Composer", "Producer"]}
            sharePct={null}
          />

          {/* Organization-only publishing rows (sub-publisher / admin) */}
          <div className="px-3 py-1.5 bg-purple-50/20 border-t border-slate-100">
            <div className="text-[10px] font-bold uppercase tracking-wider text-purple-700/80 inline-flex items-center gap-1">
              <Building2 className="w-3 h-3" /> Publishers & admins (no writer attached)
            </div>
          </div>
          <PublisherOrgRow
            initials="SK"
            gradient="from-purple-500 to-fuchsia-600"
            name="Songs of Kaotic"
            badge="Sub-publisher"
            extra="Admin: Hipgnosis · PRO: BMI"
            percent={null}
          />
          <PublisherOrgRow
            initials="HG"
            gradient="from-slate-700 to-slate-900"
            name="Hipgnosis Songs Fund"
            badge="Admin only"
            extra="Worldwide ex. North America"
            percent={null}
          />

          {/* totals + shortcuts */}
          <div className="flex items-center justify-between px-3 py-2 bg-amber-50/60 border-t border-amber-100">
            <div className="flex items-center gap-2 text-[12px] text-amber-900">
              <Info className="w-3.5 h-3.5" />
              <span className="font-semibold">Publishing splits: 25% of 100%.</span>
              <span className="text-amber-700">75% unassigned across 4 writers + 2 orgs.</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button className="px-2 py-0.5 rounded bg-white border border-amber-200 text-amber-800 text-[11px] font-medium hover:bg-amber-50">
                Even split
              </button>
              <span className="text-amber-700 font-bold text-[12px] tabular-nums">
                25% / 100%
              </span>
            </div>
          </div>

          {/* add picker */}
          <div className="px-3 py-2.5 bg-slate-50/40">
            <div className="flex items-center gap-2 rounded-md border border-dashed border-slate-300 bg-white px-2.5 py-2">
              <Search className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              <input
                placeholder="Songwriter Bank — search by name, IPI or PRO…"
                className="flex-1 bg-transparent text-[12.5px] text-slate-700 placeholder-slate-400 focus:outline-none"
              />
              <button className="text-[#319ED8] text-[11px] font-medium hover:underline inline-flex items-center gap-0.5">
                <Plus className="w-3 h-3" /> New writer
              </button>
            </div>
          </div>
        </SectionShell>

        {/* =================================================================== */}
        {/* C · MECHANICAL SPLITS  (optional — master revenue %)                 */}
        {/* =================================================================== */}
        <SectionShell
          letter="C"
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

        {/* ============================ ACTION BAR ============================ */}
        <div className="sticky bottom-0 -mx-1 mt-2">
          <div className="flex items-center justify-between gap-3 rounded-xl bg-white border border-slate-200 shadow-md px-3 py-2.5">
            <div className="flex items-center gap-2 text-[11.5px] text-slate-500">
              <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                <Check className="w-3.5 h-3.5" /> Performance complete
              </span>
              <span className="text-slate-300">·</span>
              <span>Writers 25% / 100%</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button className="px-3 py-1.5 rounded-md border border-slate-200 bg-white text-slate-700 text-[12px] font-medium hover:bg-slate-50 inline-flex items-center gap-1">
                <ChevronLeft className="w-3.5 h-3.5" /> Prev
              </button>
              <button className="px-3 py-1.5 rounded-md bg-slate-100 text-slate-700 text-[12px] font-medium hover:bg-slate-200">
                Save
              </button>
              <button className="px-3 py-1.5 rounded-md bg-[#319ED8] text-white text-[12px] font-semibold hover:bg-[#2890c8] inline-flex items-center gap-1">
                Save & next track <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* footer note */}
        <p className="text-slate-400 text-[11px] leading-relaxed px-1 pt-2">
          <span className="font-semibold text-slate-500">v3 changes:</span>{" "}
          Gear now lives on each role row inside Performance (one canonical
          home). Publishing splits + writer legal/PRO data are folded into the
          Writers card. Track stepper, prev/next, and "Save & next" make
          17-track albums tractable. "Apply to all 17 tracks" handles the
          common case of a band that plays every cut.
        </p>
      </div>
    </div>
  );
}

/* =============================== tabs ===================================== */

function Tab({ label, active }: { label: string; active?: boolean }) {
  return (
    <button
      className={[
        "px-1 pb-2 text-[12.5px] font-semibold border-b-2 -mb-px",
        active
          ? "text-slate-900 border-[#319ED8]"
          : "text-slate-400 border-transparent hover:text-slate-600",
      ].join(" ")}
    >
      {label}
    </button>
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
  unresolved,
  children,
  extraHeaderAction,
}: {
  letter: string;
  title: string;
  subtitle: string;
  count: string;
  required?: boolean;
  encouraged?: boolean;
  optional?: boolean;
  unresolved?: string;
  children: React.ReactNode;
  extraHeaderAction?: React.ReactNode;
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
          {unresolved && (
            <div className="mt-1 inline-flex items-center gap-1 text-amber-700 text-[10.5px] font-semibold">
              <AlertCircle className="w-3 h-3" />
              {unresolved}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
          {extraHeaderAction}
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

/* =============================== bits ===================================== */

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
    <button className="text-slate-400 hover:text-slate-700 text-[10.5px] inline-flex items-center gap-1">
      <Search className="w-2.5 h-2.5" />
      {count} alias{count === 1 ? "" : "es"}
    </button>
  );
}

function RoleChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10.5px] font-medium">
      {children}
    </span>
  );
}

function RoleRow({
  icon,
  role,
  instrument,
  instrumentCategory,
  notes,
  hint,
}: {
  icon: React.ReactNode;
  role: string;
  instrument: string | null;
  instrumentCategory?: string;
  notes: string | null;
  hint?: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1.5">
      <span className="px-1.5 py-0.5 rounded bg-sky-50 text-[#319ED8] text-[10.5px] font-semibold tracking-wide flex-shrink-0 inline-flex items-center gap-1">
        {icon}
        {role.toUpperCase()}
      </span>
      {instrument ? (
        <span className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-md bg-violet-50 border border-violet-100 text-violet-800 text-[11.5px] font-medium flex-shrink-0 max-w-[180px]">
          <Link2 className="w-3 h-3 text-violet-500 flex-shrink-0" />
          <span className="truncate">{instrument}</span>
          {instrumentCategory && (
            <span className="text-violet-400 text-[9.5px] font-bold uppercase tracking-wide flex-shrink-0">
              · {instrumentCategory}
            </span>
          )}
        </span>
      ) : (
        <button className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-dashed border-slate-300 bg-white text-slate-500 text-[11px] hover:bg-slate-50 flex-shrink-0">
          <Link2 className="w-3 h-3" /> Link instrument
        </button>
      )}
      {notes ? (
        <span className="text-slate-500 text-[11.5px] truncate inline-flex items-center gap-1">
          <StickyNote className="w-3 h-3 text-slate-300 flex-shrink-0" />
          {notes}
        </span>
      ) : (
        <span className="text-slate-400 text-[11px] italic truncate">
          {hint || "No notes"}
        </span>
      )}
      <div className="ml-auto flex items-center gap-1 flex-shrink-0">
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

function PublisherOrgRow({
  initials,
  gradient,
  name,
  badge,
  extra,
  percent,
}: {
  initials: string;
  gradient: string;
  name: string;
  badge: string;
  extra?: string;
  percent: number | null;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 bg-purple-50/30 hover:bg-purple-50/60 group">
      <GripVertical className="w-4 h-4 text-slate-200 group-hover:text-slate-400 flex-shrink-0" />
      <div
        className={`w-7 h-7 rounded-md bg-gradient-to-br ${gradient} text-white text-[10.5px] font-bold flex items-center justify-center flex-shrink-0`}
      >
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap text-[13px]">
          <span className="text-slate-900 font-semibold truncate">{name}</span>
          <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 text-[10px] font-bold uppercase tracking-wide flex-shrink-0">
            {badge}
          </span>
        </div>
        {extra && (
          <div className="text-slate-500 text-[11px] mt-0.5 truncate">
            {extra}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {percent === null ? (
          <button className="px-2 py-1 rounded-md border border-dashed border-amber-300 bg-amber-50/50 text-amber-700 text-[11px] font-medium hover:bg-amber-50 inline-flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> Set %
          </button>
        ) : (
          <div className="flex items-center rounded-md border border-slate-200 bg-white px-2 py-1">
            <input
              defaultValue={percent}
              className="w-9 bg-transparent text-[13px] text-slate-900 text-right tabular-nums focus:outline-none"
            />
            <span className="text-slate-400 text-[11px] pl-0.5">%</span>
          </div>
        )}
        <ChevronDown className="w-4 h-4 text-slate-300" />
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
  sharePct,
  publisher,
}: {
  initials: string;
  gradient: string;
  name: string;
  roles: string[];
  aliases?: number;
  sharePct: number | null;
  publisher?: string;
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
            <RoleChip key={r}>{r}</RoleChip>
          ))}
          {aliases > 0 && (
            <span className="text-slate-300 text-[10.5px]">
              · {aliases} alias{aliases === 1 ? "" : "es"}
            </span>
          )}
          {publisher && (
            <span className="text-slate-400 text-[10.5px] inline-flex items-center gap-1">
              <Building2 className="w-2.5 h-2.5" />
              {publisher}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {sharePct === null ? (
          <button className="px-2 py-1 rounded-md border border-dashed border-amber-300 bg-amber-50/50 text-amber-700 text-[11px] font-medium hover:bg-amber-50 inline-flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> Set %
          </button>
        ) : (
          <div className="flex items-center rounded-md border border-slate-200 bg-white px-2 py-1">
            <input
              defaultValue={sharePct}
              className="w-9 bg-transparent text-[13px] text-slate-900 text-right tabular-nums focus:outline-none"
            />
            <span className="text-slate-400 text-[11px] pl-0.5">%</span>
          </div>
        )}
        <ChevronDown className="w-4 h-4 text-slate-300" />
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="text-slate-400 text-[10px] font-semibold uppercase tracking-wider inline-flex items-center gap-1">
        {icon}
        {label}
      </div>
      <div className="text-slate-900 text-[12.5px] font-medium truncate">
        {value}
      </div>
      {hint && (
        <div className="text-slate-400 text-[10.5px] truncate">{hint}</div>
      )}
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
          <div className="text-slate-500 text-[11px] mt-0.5 truncate">
            {extra}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {percent === null ? (
          <button className="px-2 py-1 rounded-md border border-dashed border-amber-300 bg-amber-50/50 text-amber-700 text-[11.5px] font-medium hover:bg-amber-50 inline-flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> Set %
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
        {empty ? "—" : `${entered}%`}{" "}
        <span className="text-slate-300 font-normal">/ {target}%</span>
      </span>
    </div>
  );
}
