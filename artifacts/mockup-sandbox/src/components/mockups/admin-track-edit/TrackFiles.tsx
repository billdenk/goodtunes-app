import {
  ChevronRight,
  ChevronLeft,
  Upload,
  Check,
  FileAudio,
  FileImage,
  FileBox,
  AlertCircle,
  MoreHorizontal,
  Replace,
  Trash2,
  Download,
} from "lucide-react";

/**
 * Track · Files tab.
 *
 * Audio masters, stems, cover override. Each slot is a drag-target with the
 * uploaded file (if any) shown inline with its format, sample rate and
 * checksum. Stems are a single zip slot for now — expand later if we want
 * per-stem uploads.
 *
 * Files are uploaded direct by the artist / admin. Muso doesn't host audio
 * (credits only) and we're not pulling masters from streaming services, so
 * the only bulk path is "drop a folder" or link a cloud storage folder.
 */
export function TrackFiles() {
  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans antialiased">
      <div className="max-w-[720px] mx-auto space-y-3">
        {/* HEADER */}
        <div className="space-y-2 pb-1">
          <div className="text-slate-400 text-[11px] font-medium flex items-center gap-1.5">
            <span>Albums</span>
            <ChevronRight className="w-3 h-3" />
            <span>Love Life Tragedy</span>
            <ChevronRight className="w-3 h-3" />
            <span>Tracks</span>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-slate-400 text-[11px] font-semibold uppercase tracking-wider">
                Track 1 of 17 · Love Life Tragedy · Nick Carter
              </div>
              <h2 className="text-slate-900 text-[20px] font-bold truncate">
                Made for Us
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-4 border-b border-slate-200 pt-1">
            <Tab label="Details" />
            <Tab label="Credits" badge="7 to fill" />
            <Tab label="Lyrics" />
            <Tab label="Files" active />
          </div>
        </div>

        {/* STREAMING MASTER */}
        <Section
          title="Streaming master"
          subtitle="The file the player streams. Required to publish."
          required
        >
          <FilledSlot
            icon={<FileAudio className="w-5 h-5 text-[#319ED8]" />}
            name="made-for-us-master-v3.flac"
            meta="FLAC · 44.1 kHz · 24-bit · 38.2 MB"
            checksum="sha-256 a1d8f4…b3e9"
            badges={[
              { label: "Lossless", tone: "ok" },
              { label: "−14 LUFS", tone: "neutral" },
            ]}
          />
        </Section>

        {/* DOWNLOADABLE MASTER */}
        <Section
          title="High-res downloadable"
          subtitle="Optional · for the deferred 'download to device' flow (Transfer Rights). Skipped on web build."
        >
          <EmptyDropZone
            label="Drop a hi-res FLAC or WAV"
            hint="≥ 96 kHz / 24-bit recommended · max 200 MB"
          />
        </Section>

        {/* STEMS */}
        <Section
          title="Stems"
          subtitle="Optional · powers future remix / karaoke / 'isolate vocal' features"
        >
          <FilledSlot
            icon={<FileBox className="w-5 h-5 text-[#7F10A7]" />}
            name="made-for-us-stems.zip"
            meta="ZIP · 5 stems · 412 MB"
            checksum="vocals · drums · bass · guitar · keys"
            badges={[{ label: "5 stems", tone: "purple" }]}
          />
        </Section>

        {/* TRACK COVER OVERRIDE */}
        <Section
          title="Track cover override"
          subtitle="Optional · most tracks use the album cover. Use this for single-art or visualizer art."
        >
          <EmptyDropZone
            label="Drop a square cover image"
            hint="3000×3000 RGB JPG or PNG · uses album cover when empty"
            icon={<FileImage className="w-6 h-6" />}
          />
        </Section>

        {/* SUMMARY */}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 px-3 py-2.5 flex items-start gap-2">
          <Check className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div className="text-[12px] text-emerald-900">
            <span className="font-semibold">Ready to stream.</span>{" "}
            Streaming master + checksum present. Hi-res / stems are optional
            and don't gate publication.
          </div>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2.5 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-[12px] text-amber-900">
            <span className="font-semibold">
              13 of 17 tracks still missing a master.
            </span>{" "}
            <button className="underline font-medium">
              Drop a folder of files
            </button>{" "}
            (we'll match by filename) ·{" "}
            <button className="underline font-medium">
              Link a Dropbox / Drive folder
            </button>
          </div>
        </div>

        {/* ACTION BAR */}
        <div className="sticky bottom-0 -mx-1 mt-2">
          <div className="flex items-center justify-between gap-3 rounded-xl bg-white border border-slate-200 shadow-md px-3 py-2.5">
            <button className="px-2.5 py-1.5 rounded-md text-slate-600 text-[12px] hover:bg-slate-50 inline-flex items-center gap-1">
              <ChevronLeft className="w-3.5 h-3.5" /> Lyrics
            </button>
            <div className="flex items-center gap-1.5">
              <button className="px-3 py-1.5 rounded-md bg-slate-100 text-slate-700 text-[12px] font-medium hover:bg-slate-200">
                Save
              </button>
              <button className="px-3 py-1.5 rounded-md bg-[#319ED8] text-white text-[12px] font-semibold hover:bg-[#2890c8] inline-flex items-center gap-1">
                Open Track 2 <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =============================== bits ===================================== */

function Section({
  title,
  subtitle,
  required,
  children,
}: {
  title: string;
  subtitle: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
      <header className="px-4 py-3 border-b border-slate-100 bg-gradient-to-b from-white to-slate-50/40">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-slate-900 text-[14px] font-bold">{title}</h3>
          {required ? (
            <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 text-[10px] font-bold uppercase tracking-wide">
              Required
            </span>
          ) : (
            <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px] font-bold uppercase tracking-wide">
              Optional
            </span>
          )}
        </div>
        <p className="text-slate-500 text-[11.5px] mt-0.5">{subtitle}</p>
      </header>
      <div className="px-3 py-3">{children}</div>
    </section>
  );
}

function FilledSlot({
  icon,
  name,
  meta,
  checksum,
  badges,
}: {
  icon: React.ReactNode;
  name: string;
  meta: string;
  checksum: string;
  badges: { label: string; tone: "ok" | "neutral" | "purple" }[];
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 flex items-center gap-3">
      <span className="w-10 h-10 rounded-md bg-slate-50 border border-slate-200 flex items-center justify-center flex-shrink-0">
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-slate-900 text-[12.5px] font-semibold truncate font-mono">
          {name}
        </div>
        <div className="text-slate-500 text-[11px] truncate">{meta}</div>
        <div className="text-slate-400 text-[10.5px] truncate font-mono">
          {checksum}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <div className="flex items-center gap-1">
          {badges.map((b) => (
            <span
              key={b.label}
              className={[
                "px-1.5 py-px rounded text-[9.5px] font-bold uppercase tracking-wide",
                b.tone === "ok"
                  ? "bg-emerald-50 text-emerald-700"
                  : b.tone === "purple"
                    ? "bg-[#7F10A7]/10 text-[#7F10A7]"
                    : "bg-slate-100 text-slate-600",
              ].join(" ")}
            >
              {b.label}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-1 text-slate-400">
          <button
            className="hover:text-slate-700 p-1"
            title="Replace"
          >
            <Replace className="w-3.5 h-3.5" />
          </button>
          <button className="hover:text-slate-700 p-1" title="Download">
            <Download className="w-3.5 h-3.5" />
          </button>
          <button className="hover:text-rose-600 p-1" title="Remove">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button className="hover:text-slate-700 p-1">
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyDropZone({
  label,
  hint,
  icon,
}: {
  label: string;
  hint: string;
  icon?: React.ReactNode;
}) {
  return (
    <button className="w-full rounded-lg border-2 border-dashed border-slate-200 bg-slate-50/40 px-4 py-6 flex flex-col items-center justify-center gap-1.5 text-center hover:border-[#319ED8] hover:bg-[#319ED8]/[0.04]">
      <span className="text-slate-300">
        {icon ?? <Upload className="w-6 h-6" />}
      </span>
      <span className="text-slate-700 text-[12.5px] font-semibold">{label}</span>
      <span className="text-slate-400 text-[10.5px]">{hint}</span>
    </button>
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
        <span className="px-1.5 py-px rounded bg-amber-100 text-amber-700 text-[10px] font-bold">
          {badge}
        </span>
      )}
    </button>
  );
}
