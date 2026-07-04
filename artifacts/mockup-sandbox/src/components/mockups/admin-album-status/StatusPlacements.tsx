import "./_group.css";
import {
  ChevronRight,
  Music,
  Disc3,
  MoreHorizontal,
  ChevronDown,
} from "lucide-react";

/**
 * Admin album header — STATUS PLACEMENT explorations.
 *
 * Bill's note: today the top meta line reads
 *   "LP · LESLIE MENDELSON  Released  MOVE TO PREPPING  SPIN Promo"
 * — the lifecycle status, the promote/demote action and the SPIN Promo tag
 * all fight for the same line, and the status doesn't obviously read as
 * "status".
 *
 * Four takes on where the album's lifecycle status (and the promote/demote
 * action that mutates it) should live. Every panel reuses the real admin
 * slate chrome (bg-slate-50 shell, white card, slate type scale); only the
 * STATUS placement changes between them so the comparison is apples to apples.
 */

// Warm neutral stand-in for the real cover (real album art can't load inside
// the sandbox iframe). These are NOT brand hex, so they stay lint-clean.
const COVER_GRADIENT =
  "linear-gradient(140deg, #2f2b3d 0%, #6a5d6e 48%, #c3b2a1 100%)";

type Variant = "today" | "cover" | "under-date" | "control";

type FrameDef = {
  key: Variant;
  caption: string;
  tone?: "muted" | "reco";
  note: string;
};

const FRAMES: FrameDef[] = [
  {
    key: "today",
    caption: "Today",
    tone: "muted",
    note: "Status, the “Move to prepping” action and the SPIN Promo tag all share the top line — a lot to parse, and “Released” doesn’t read as a status.",
  },
  {
    key: "cover",
    caption: "Option A — on the album cover",
    note: "Status overlays the cover, bottom-left. The top line drops to just format · artist; the promote / demote action moves into the ⋯ menu on the right.",
  },
  {
    key: "under-date",
    caption: "Option B — under the date",
    note: "A calm, labelled “Status” row sits beneath date · tracks — the word “Status” removes the guesswork, and the pill sits right next to the action that changes it.",
  },
  {
    key: "control",
    caption: "Option C — grouped status control",
    tone: "reco",
    note: "Status + promote/demote become one bordered control at the far right. Unmistakably a control, groups the state with its action, and scales cleanly to Prepping / Sunset.",
  },
];

export function StatusPlacements() {
  // `?only=<key>` renders a single placement full-fit (so each one can be
  // screenshotted without the stacked view clipping the bottom option).
  const only =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("only")
      : null;
  const frames = only ? FRAMES.filter((f) => f.key === only) : FRAMES;
  const single = frames.length === 1;

  return (
    <div className="min-h-screen bg-slate-100 p-8 font-sans antialiased">
      <div className="max-w-[1040px] mx-auto space-y-6">
        {!single && (
          <div>
            <h1 className="text-slate-900 text-[17px] font-bold">
              Admin album header — where should “status” live?
            </h1>
            <p className="text-slate-500 text-[12.5px] mt-1 max-w-[74ch] leading-relaxed">
              Same header, four placements for the lifecycle status and its
              promote / demote action. Breadcrumb, cover, title and the
              “date · tracks” line are identical to today — only the status
              treatment changes.
            </p>
          </div>
        )}

        {frames.map((f) => (
          <Frame key={f.key} caption={f.caption} tone={f.tone} note={f.note}>
            <Header variant={f.key} />
          </Frame>
        ))}

        {!single && (
          <p className="text-slate-400 text-[11.5px] leading-relaxed px-1 pt-1">
            <span className="font-semibold text-slate-500">Note:</span>{" "}
            secondary admin tags (SPIN Promo, Hidden-from-store, the reviewer
            “Preview” mirror) move off the primary line in A / B / C — shown
            here as small muted tags on the date row so the top of the header
            stays quiet.
          </p>
        )}
      </div>
    </div>
  );
}

/* =============================== frame =================================== */

// Labelled wrapper: a caption pill + one-line rationale above each header take.
function Frame({
  caption,
  note,
  tone,
  children,
}: {
  caption: string;
  note?: string;
  tone?: "muted" | "reco";
  children: React.ReactNode;
}) {
  const capCls =
    tone === "reco"
      ? "text-white"
      : tone === "muted"
        ? "bg-slate-200 text-slate-500"
        : "bg-slate-800 text-white";
  const capStyle =
    tone === "reco" ? { background: "var(--brand-blue)" } : undefined;

  return (
    <section>
      <div className="mb-2">
        <span
          className={[
            "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider",
            capCls,
          ].join(" ")}
          style={capStyle}
        >
          {caption}
        </span>
        {note && (
          <p className="text-slate-500 text-[12px] mt-1.5 max-w-[86ch] leading-snug">
            {note}
          </p>
        )}
      </div>
      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5">
        {children}
      </div>
    </section>
  );
}

/* =============================== header ================================== */

function Header({ variant }: { variant: Variant }) {
  return (
    <div>
      {/* breadcrumb */}
      <div className="text-slate-400 text-[12px] font-medium flex items-center gap-1.5 mb-3">
        <span>Albums</span>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-slate-700 font-semibold">
          After The Party - Signature Edition
        </span>
      </div>

      <div className="flex items-start gap-4">
        <Cover statusOnCover={variant === "cover"} />

        <div className="flex-1 min-w-0">
          {/* caps meta row */}
          <div className="text-slate-400 text-[11px] font-semibold uppercase tracking-wider flex items-center gap-2 flex-wrap">
            <span>LP · Leslie Mendelson</span>

            {variant === "today" && (
              <>
                <StatusPill />
                <PrimaryAction />
                <SpinPromoTag />
              </>
            )}
          </div>

          {/* title */}
          <h1 className="text-slate-900 text-[26px] font-bold tracking-tight mt-0.5 truncate">
            After The Party - Signature Edition
          </h1>

          {/* date · tracks (+ subtle secondary tags in the decluttered options) */}
          <div className="text-slate-500 text-[13px] mt-1 flex items-center gap-3 flex-wrap">
            <span>2024</span>
            <span className="inline-flex items-center gap-1">
              <Music className="w-3.5 h-3.5" />
              10 tracks
            </span>
            {(variant === "cover" || variant === "control") && (
              <SpinPromoTag subtle />
            )}
          </div>

          {/* Option B — labelled status row under the date */}
          {variant === "under-date" && (
            <div className="mt-2.5 flex items-center gap-2 flex-wrap">
              <span className="text-slate-400 text-[11px] font-semibold uppercase tracking-wider">
                Status
              </span>
              <StatusPill dot />
              <PrimaryAction />
              <span className="w-px h-4 bg-slate-200" aria-hidden="true" />
              <SpinPromoTag subtle />
            </div>
          )}
        </div>

        {/* right slot — kebab for Option A, grouped control for Option C */}
        {variant === "cover" && (
          <button
            className="mt-0.5 w-9 h-9 rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-slate-700 hover:bg-slate-50 inline-flex items-center justify-center flex-shrink-0 transition-colors"
            title="Album actions — Move to prepping, Duplicate…"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        )}
        {variant === "control" && (
          <div className="flex-shrink-0 pt-0.5">
            <StatusControl />
          </div>
        )}
      </div>
    </div>
  );
}

/* =============================== bits ==================================== */

function Cover({ statusOnCover }: { statusOnCover?: boolean }) {
  return (
    <div
      className="relative w-24 h-24 rounded-lg overflow-hidden flex-shrink-0 ring-1 ring-slate-200 shadow-sm"
      style={{ backgroundImage: COVER_GRADIENT }}
    >
      <div className="absolute inset-0 flex items-center justify-center text-white/80 text-[24px] font-black tracking-tight select-none">
        ATP
      </div>
      {statusOnCover && (
        <span className="absolute left-1.5 bottom-1.5 inline-flex items-center gap-1 pl-1 pr-1.5 py-0.5 rounded-full text-[9.5px] font-bold tracking-wide bg-black/60 text-white backdrop-blur-[2px]">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          Released
        </span>
      )}
    </div>
  );
}

// Mirrors the real LifecyclePill (mint tone). `dot` adds a status dot for the
// options where the goal is to make "this is a status" unmistakable.
function StatusPill({ dot }: { dot?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider normal-case bg-emerald-50 text-emerald-700">
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
      Released
    </span>
  );
}

// The promote/demote affordance. When Released, it reads "Move to prepping".
function PrimaryAction() {
  return (
    <button className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors">
      Move to prepping
    </button>
  );
}

function SpinPromoTag({ subtle }: { subtle?: boolean }) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-semibold normal-case tracking-normal",
        subtle ? "text-[11px]" : "text-[10.5px]",
      ].join(" ")}
      style={{ color: "var(--brand-purple)", background: "rgba(127,16,167,0.10)" }}
      title="SPIN Promo — digital-only legacy release (admin-only tag)"
    >
      <Disc3 className="w-3 h-3" />
      SPIN Promo
    </span>
  );
}

// Option C — status + promote/demote as one bordered control.
function StatusControl() {
  return (
    <button
      className="inline-flex items-center gap-2 pl-2.5 pr-2 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 shadow-sm transition-colors"
      title="Album status — Released. Click to move back to Prepping."
    >
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
      <span className="text-slate-400 text-[10px] font-semibold uppercase tracking-wider">
        Status
      </span>
      <span className="text-slate-800 text-[12.5px] font-semibold">Released</span>
      <ChevronDown className="w-4 h-4 text-slate-400" />
    </button>
  );
}
