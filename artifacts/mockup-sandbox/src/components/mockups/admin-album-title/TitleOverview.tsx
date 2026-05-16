import {
  ChevronRight,
  Check,
  Pencil,
  Music2,
  Globe2,
  MapPin,
  Calendar,
  Building2,
  Hash,
  Sparkles,
  Disc3,
  Plus,
  AlertCircle,
} from "lucide-react";

/**
 * Album Title Overview (admin) — sibling to the Credits editor.
 *
 * Mirrors the discoverable metadata a player actually uses, borrowed from
 * the CD Baby "Title Overview" pattern but trimmed of distributor concerns
 * (no DSP delivery, no partner artist IDs, no royalty collection mechanics).
 *
 * Captured here:
 *   - Artist Name · Record Label · Release Date · UPC
 *   - Primary / Secondary Genre + Subgenre
 *   - Mood / Style · Album Language · Artist Sounds Like · Artist Location
 *   - Cover art + release-readiness checklist
 *
 * This is the SIBLING mockup to ProgressiveV3 — same admin shell, same
 * stepper, but operating one level up (album, not track).
 */
export function TitleOverview() {
  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans antialiased">
      <div className="max-w-[720px] mx-auto space-y-3">
        {/* ============================ HEADER ============================ */}
        <div className="space-y-2 pb-1">
          <div className="text-slate-400 text-[11px] font-medium flex items-center gap-1.5">
            <span>Albums</span>
            <ChevronRight className="w-3 h-3" />
            <span className="text-slate-700 font-semibold">Love Life Tragedy</span>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-slate-400 text-[11px] font-semibold uppercase tracking-wider">
                Album · Nick Carter
              </div>
              <h2 className="text-slate-900 text-[20px] font-bold truncate">
                Love Life Tragedy
              </h2>
            </div>
            <button className="px-3 py-1.5 rounded-md border border-slate-200 bg-white text-slate-600 text-[12px] font-medium hover:bg-slate-50 inline-flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#319ED8]" />
              Re-import from Muso
            </button>
          </div>

          {/* tabs */}
          <div className="flex items-center gap-4 border-b border-slate-200 pt-1">
            <Tab label="Overview" active />
            <Tab label="Tracks" badge="17" />
            <Tab label="Artwork" />
            <Tab label="Files" />
          </div>
        </div>

        {/* ============================ HERO ============================ */}
        <section className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-stretch gap-4 p-4">
            {/* cover */}
            <div className="w-32 h-32 rounded-lg bg-gradient-to-br from-purple-500 via-fuchsia-500 to-rose-500 flex-shrink-0 relative overflow-hidden shadow-md">
              <div className="absolute inset-0 flex items-center justify-center text-white text-[36px] font-black tracking-tight opacity-90">
                LLT
              </div>
              <button className="absolute bottom-1.5 right-1.5 w-6 h-6 rounded-md bg-black/40 backdrop-blur text-white flex items-center justify-center hover:bg-black/60">
                <Pencil className="w-3 h-3" />
              </button>
            </div>

            <div className="flex-1 min-w-0 flex flex-col">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                <Field
                  label="Artist Name"
                  value="Nick Carter"
                  icon={<Music2 className="w-3 h-3" />}
                  good
                />
                <Field
                  label="Record Label"
                  value="BMG Rights Management (US) LLC"
                  icon={<Building2 className="w-3 h-3" />}
                  good
                />
                <Field
                  label="Release Date"
                  value="Oct 28, 2022"
                  icon={<Calendar className="w-3 h-3" />}
                  good
                />
                <Field
                  label="UPC"
                  value="—"
                  icon={<Hash className="w-3 h-3" />}
                  hint="Assign one for me"
                />
              </div>

              <div className="mt-auto pt-3 flex items-center justify-between">
                <span className="inline-flex items-center gap-1 text-emerald-700 text-[11.5px] font-semibold">
                  <Check className="w-3.5 h-3.5" /> 6 of 8 sections complete
                </span>
                <button className="text-[#319ED8] text-[11.5px] font-medium hover:underline">
                  Open release checklist
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ============================ GENRE ============================ */}
        <SectionShell
          title="Genre & subgenre"
          subtitle="Drives library shelves, browse rows and recommendations"
          status="complete"
        >
          <div className="grid grid-cols-2 gap-3 px-4 py-3">
            <ChipField label="Primary Genre" value="Rock" />
            <ChipField label="Secondary Genre" value="Rock" />
            <ChipField label="Primary Subgenre" value="Album Rock" />
            <ChipField label="Secondary Subgenre" value="Americana" />
          </div>
        </SectionShell>

        {/* ============================ MOOD / LANG ============================ */}
        <SectionShell
          title="Mood, language & locale"
          subtitle="Powers fan-side filters (e.g. 'Featuring guitar' · 'English' · 'United States')"
          status="complete"
        >
          <div className="grid grid-cols-2 gap-3 px-4 py-3">
            <ChipField label="Mood / Style" value="Featuring guitar" />
            <ChipField label="Album Language" value="English" icon={<Globe2 className="w-3 h-3" />} />
            <ChipField
              label="Artist Location"
              value="United States · California"
              icon={<MapPin className="w-3 h-3" />}
            />
            <ChipField
              label="Artist Sounds Like"
              value="John Lennon"
              hint="Used by 'If you like…' rows"
            />
          </div>
        </SectionShell>

        {/* ============================ DESCRIPTION ============================ */}
        <SectionShell
          title="Story & liner notes"
          subtitle="Free-form description shown on the album page, above the track list"
          status="partial"
        >
          <div className="px-4 py-3 space-y-2">
            <textarea
              className="w-full min-h-[80px] rounded-md border border-slate-200 bg-white px-3 py-2 text-[12.5px] text-slate-700 placeholder-slate-400 focus:outline-none focus:border-[#319ED8] resize-none"
              defaultValue="Nick Carter's first solo record in over a decade, written and recorded across late-night sessions in Nashville and Los Angeles…"
            />
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-[10.5px]">
                Markdown supported · 140 / 800 characters
              </span>
              <button className="px-2 py-1 rounded-md border border-slate-200 bg-white text-slate-600 text-[11px] hover:bg-slate-50 inline-flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-[#319ED8]" /> Draft from Muso bio
              </button>
            </div>
          </div>
        </SectionShell>

        {/* ============================ CHECKLIST ============================ */}
        <SectionShell
          title="Release readiness"
          subtitle="What still needs your attention before this album goes live in the player"
        >
          <div className="divide-y divide-slate-100">
            <CheckRow label="Cover art — 3000×3000, RGB, JPG or PNG" status="good" />
            <CheckRow label="Title-level metadata (this page)" status="good" />
            <CheckRow label="17 tracks ingested · audio files attached" status="good" />
            <CheckRow
              label="Credits per track"
              status="partial"
              hint="4 of 17 tracks have Performance filled"
            />
            <CheckRow
              label="Publishing splits"
              status="warn"
              hint="Optional — only 1 of 17 has any %"
            />
            <CheckRow
              label="UPC / barcode"
              status="warn"
              hint="No UPC assigned yet — pick 'assign one for me' or paste your own"
            />
          </div>
        </SectionShell>

        {/* ============================ ACTION BAR ============================ */}
        <div className="sticky bottom-0 -mx-1 mt-2">
          <div className="flex items-center justify-between gap-3 rounded-xl bg-white border border-slate-200 shadow-md px-3 py-2.5">
            <div className="flex items-center gap-2 text-[11.5px] text-slate-500">
              <Disc3 className="w-3.5 h-3.5 text-slate-400" />
              <span>Love Life Tragedy · 17 tracks · 4 fully credited</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button className="px-3 py-1.5 rounded-md bg-slate-100 text-slate-700 text-[12px] font-medium hover:bg-slate-200">
                Save
              </button>
              <button className="px-3 py-1.5 rounded-md bg-[#319ED8] text-white text-[12px] font-semibold hover:bg-[#2890c8] inline-flex items-center gap-1">
                Open Track 1 <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        <p className="text-slate-400 text-[11px] leading-relaxed px-1 pt-2">
          <span className="font-semibold text-slate-500">Scope note:</span>{" "}
          We are not a distributor — no DSP delivery, no partner artist IDs,
          no royalty-collection toggles, no territory restrictions. Only the
          metadata the player itself uses for browse, search and "if you
          like…" rows.
        </p>
      </div>
    </div>
  );
}

/* =============================== bits ===================================== */

function Tab({
  label,
  active,
  badge,
}: {
  label: string;
  active?: boolean;
  badge?: string;
}) {
  return (
    <button
      className={[
        "px-1 pb-2 text-[12.5px] font-semibold border-b-2 -mb-px inline-flex items-center gap-1.5",
        active
          ? "text-slate-900 border-[#319ED8]"
          : "text-slate-400 border-transparent hover:text-slate-600",
      ].join(" ")}
    >
      {label}
      {badge && (
        <span className="px-1.5 py-px rounded bg-slate-100 text-slate-500 text-[10px] font-bold tabular-nums">
          {badge}
        </span>
      )}
    </button>
  );
}

function SectionShell({
  title,
  subtitle,
  status,
  children,
}: {
  title: string;
  subtitle: string;
  status?: "complete" | "partial" | "warn";
  children: React.ReactNode;
}) {
  const chip =
    status === "complete" ? (
      <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-bold uppercase tracking-wide inline-flex items-center gap-1">
        <Check className="w-2.5 h-2.5" /> Complete
      </span>
    ) : status === "partial" ? (
      <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-[10px] font-bold uppercase tracking-wide">
        In progress
      </span>
    ) : status === "warn" ? (
      <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 text-[10px] font-bold uppercase tracking-wide">
        Needs attention
      </span>
    ) : null;

  return (
    <section className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
      <header className="flex items-start gap-3 px-4 py-3 border-b border-slate-100 bg-gradient-to-b from-white to-slate-50/40">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-slate-900 text-[14px] font-bold">{title}</h3>
            {chip}
          </div>
          <p className="text-slate-500 text-[11.5px] mt-0.5">{subtitle}</p>
        </div>
        <button className="px-2 py-1 rounded-md border border-slate-200 bg-white text-slate-600 text-[11.5px] hover:bg-slate-50 inline-flex items-center gap-1 flex-shrink-0">
          <Pencil className="w-3 h-3" /> Edit
        </button>
      </header>
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  hint,
  icon,
  good,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: React.ReactNode;
  good?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="text-slate-400 text-[10px] font-semibold uppercase tracking-wider inline-flex items-center gap-1">
        {icon}
        {label}
      </div>
      <div className="flex items-center gap-1.5 mt-0.5">
        <span className="text-slate-900 text-[13px] font-semibold truncate">
          {value}
        </span>
        {good && (
          <Check className="w-3 h-3 text-emerald-500 flex-shrink-0" />
        )}
      </div>
      {hint && (
        <button className="text-[#319ED8] text-[10.5px] font-medium hover:underline mt-0.5 inline-flex items-center gap-0.5">
          <Plus className="w-2.5 h-2.5" />
          {hint}
        </button>
      )}
    </div>
  );
}

function ChipField({
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
      <div className="mt-1">
        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-100 text-slate-800 text-[12px] font-medium">
          <Check className="w-3 h-3 text-emerald-500" />
          {value}
        </span>
      </div>
      {hint && (
        <div className="text-slate-400 text-[10.5px] mt-1 italic">{hint}</div>
      )}
    </div>
  );
}

function CheckRow({
  label,
  status,
  hint,
}: {
  label: string;
  status: "good" | "partial" | "warn";
  hint?: string;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      {status === "good" ? (
        <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0">
          <Check className="w-3 h-3" />
        </span>
      ) : status === "partial" ? (
        <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0">
          <AlertCircle className="w-3 h-3" />
        </span>
      ) : (
        <span className="w-5 h-5 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center flex-shrink-0">
          <AlertCircle className="w-3 h-3" />
        </span>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-slate-800 text-[12.5px] font-medium truncate">
          {label}
        </div>
        {hint && (
          <div className="text-slate-500 text-[11px] truncate">{hint}</div>
        )}
      </div>
      <button className="text-slate-300 hover:text-slate-700 text-[11px] font-medium px-2 flex-shrink-0">
        Open
      </button>
    </div>
  );
}
