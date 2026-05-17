import { useState } from "react";
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
  Upload,
  Download,
  Trash2,
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
      <div className="max-w-[1100px] mx-auto space-y-3">
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

          {/* tabs — Artwork has been folded into Overview as its
              right-hand panel, so it's no longer a sibling tab. */}
          <div className="flex items-center gap-4 border-b border-slate-200 pt-1">
            <Tab label="Overview" active />
            <Tab label="Tracks" badge="17" />
            <Tab label="Files" />
          </div>
        </div>

        {/* ============================ TWO-COL BODY ============================
            Left: metadata sections (the bulk of the editing surface).
            Right: artwork card + release-readiness — sticky so artwork
            stays visible as you scroll through metadata. */}
        <div className="grid grid-cols-[1fr_320px] gap-4 items-start">
          <div className="space-y-3 min-w-0">

        {/* ============================ HERO ============================
            Cover thumbnail removed — artwork now lives in its own card
            on the right so we don't show two cover surfaces. */}
        <section className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4">
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

            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
              <span className="inline-flex items-center gap-1 text-emerald-700 text-[11.5px] font-semibold">
                <Check className="w-3.5 h-3.5" /> 6 of 8 sections complete
              </span>
              <button className="text-[#319ED8] text-[11.5px] font-medium hover:underline">
                Open release checklist
              </button>
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
              label="Track 17 — Take You with Me (Bonus Track)"
              status="warn"
              hint="Not present in the LLT credits doc (16 songs). Hide from the canonical tracklist, or capture credits separately?"
            />
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

          </div>

          {/* ============================ RIGHT RAIL ============================
              Artwork card — visible by default the moment you land on
              Overview. Hover the cover for Replace / Download / Remove,
              or drag a file straight onto it. Sticky so it stays in
              view as you scroll the metadata sections. */}
          <aside className="sticky top-3 space-y-3">
            <ArtworkCard />
          </aside>
        </div>

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

/**
 * ArtworkCard — the lone surface that owns album cover editing.
 *
 *   • Hover the cover → dark scrim fades in with Replace · Download · Remove
 *   • Drag a file from Finder onto the cover → blue scrim, "Drop to replace"
 *   • Click the cover (or "Replace") → opens system file picker
 *
 * One surface, two gestures (hover and drag) — replaces the old
 * two-column "current + dropzone" pattern entirely.
 */
function ArtworkCard() {
  const [hover, setHover] = useState(false);
  const [drag, setDrag] = useState(false);

  return (
    <section className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
      <header className="px-3.5 py-2.5 border-b border-slate-100 flex items-center justify-between">
        <h3 className="text-slate-900 text-[13px] font-bold">Artwork</h3>
        <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-bold uppercase tracking-wide inline-flex items-center gap-1">
          <Check className="w-2.5 h-2.5" /> Live
        </span>
      </header>

      <div className="p-3">
        <div
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
          }}
          className={[
            "relative w-full aspect-square rounded-xl overflow-hidden cursor-pointer transition-shadow",
            "bg-gradient-to-br from-purple-500 via-fuchsia-500 to-rose-500",
            drag
              ? "ring-2 ring-[#319ED8] shadow-[0_0_0_5px_rgba(49,158,216,0.18)]"
              : "ring-1 ring-slate-200",
          ].join(" ")}
        >
          {/* The real artwork would render here. In the mockup we use
              a brand-tinted "LLT" monogram as a stand-in. */}
          <div className="absolute inset-0 flex items-center justify-center text-white text-[56px] font-black tracking-tight opacity-90 select-none">
            LLT
          </div>

          {/* Hover overlay — Replace / Download / Remove.
              Stacked vertically so each verb keeps a real touch target
              instead of becoming a row of cramped icons. */}
          <div
            className={[
              "absolute inset-0 bg-black/55 backdrop-blur-[1px] flex flex-col items-center justify-center gap-2 transition-opacity duration-150",
              hover && !drag ? "opacity-100" : "opacity-0 pointer-events-none",
            ].join(" ")}
          >
            <button className="w-[140px] px-3 py-1.5 rounded-md bg-white text-slate-900 text-[12px] font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-slate-100">
              <Upload className="w-3.5 h-3.5" /> Replace
            </button>
            <button className="w-[140px] px-3 py-1.5 rounded-md bg-white/15 text-white text-[12px] font-semibold inline-flex items-center justify-center gap-1.5 border border-white/30 hover:bg-white/25">
              <Download className="w-3.5 h-3.5" /> Download
            </button>
            <button className="w-[140px] px-3 py-1.5 rounded-md bg-[#FF5470]/95 text-white text-[12px] font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-[#FF5470]">
              <Trash2 className="w-3.5 h-3.5" /> Remove
            </button>
          </div>

          {/* Drag-over overlay — replaces the hover overlay while a
              file is being dragged over the cover. Brand blue so it
              reads as "yes, drop here" the moment you're over it. */}
          <div
            className={[
              "absolute inset-0 bg-[#319ED8]/90 flex flex-col items-center justify-center gap-2 text-white transition-opacity duration-150",
              drag ? "opacity-100" : "opacity-0 pointer-events-none",
            ].join(" ")}
          >
            <Upload className="w-8 h-8" />
            <span className="text-[13px] font-bold">Drop to replace</span>
          </div>
        </div>

        <p className="text-slate-500 text-[10.5px] mt-3 leading-snug">
          Hover the cover for options — or drag a file straight onto it.
        </p>
        <p className="text-slate-400 text-[10.5px] mt-1 leading-snug">
          Square, at least 3000×3000 px. JPG, PNG, or WebP up to 8 MB.
        </p>
      </div>
    </section>
  );
}

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
