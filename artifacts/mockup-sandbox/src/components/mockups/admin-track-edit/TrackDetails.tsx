import {
  ChevronRight,
  Check,
  ChevronLeft,
  Sparkles,
  Hash,
  Globe2,
  Music2,
  Clock,
  Tag,
  AlertCircle,
  Disc3,
  Mic,
} from "lucide-react";

/**
 * Track · Details tab.
 *
 * First tab when an admin opens a track from TracksList. Captures the
 * track-level metadata that's distinct from the album-level metadata living
 * on TitleOverview (genre, language inherit by default, but can be
 * overridden per track for, e.g., a Spanish-language bonus).
 */
export function TrackDetails() {
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
            <span className="text-slate-700 font-semibold">Tracks</span>
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
            <button className="px-3 py-1.5 rounded-md border border-slate-200 bg-white text-slate-600 text-[12px] font-medium hover:bg-slate-50 inline-flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#319ED8]" />
              Re-import from Muso
            </button>
          </div>

          {/* tabs */}
          <div className="flex items-center gap-4 border-b border-slate-200 pt-1">
            <Tab label="Details" active />
            <Tab label="Credits" badge="7 to fill" />
            <Tab label="Lyrics" />
            <Tab label="Files" />
          </div>
        </div>

        {/* TRACK CHIP STEPPER */}
        <ChipStepper />

        {/* CORE METADATA */}
        <Section title="Core" subtitle="Title, duration, identifiers">
          <div className="grid grid-cols-2 gap-3 px-4 py-3">
            <FieldInput label="Track title" value="Made for Us" required />
            <FieldInput label="Alt title" value="—" placeholder="e.g. radio edit" />
            <FieldInput
              label="Duration"
              value="3:28"
              icon={<Clock className="w-3 h-3" />}
              suffix="208s"
            />
            <FieldInput
              label="ISRC"
              value="USBMG2200001"
              icon={<Hash className="w-3 h-3" />}
              hint="Required for streaming royalty matching"
              required
            />
            <FieldInput
              label="Track #"
              value="1"
              suffix="of 17"
            />
            <FieldInput
              label="Disc #"
              value="1"
              suffix="of 1"
            />
          </div>
        </Section>

        {/* LISTENER METADATA */}
        <Section title="Listener metadata" subtitle="Inherits from the album unless overridden">
          <div className="grid grid-cols-2 gap-3 px-4 py-3">
            <Inherited
              label="Primary Genre"
              value="Rock"
              icon={<Tag className="w-3 h-3" />}
            />
            <Inherited
              label="Subgenre"
              value="Album Rock"
              icon={<Tag className="w-3 h-3" />}
            />
            <Inherited
              label="Language"
              value="English"
              icon={<Globe2 className="w-3 h-3" />}
            />
            <Inherited
              label="Mood / Style"
              value="Featuring guitar"
              icon={<Music2 className="w-3 h-3" />}
            />
            <Toggle
              label="Explicit"
              value={false}
              hint="Players show the [E] badge"
            />
            <Toggle
              label="Instrumental"
              value={false}
              hint="Skips the lyrics tab in the player"
            />
          </div>
        </Section>

        {/* PERFORMANCE METADATA */}
        <Section title="Performance details" subtitle="Optional — powers 'tempo radio' and SuperCredits™ filters">
          <div className="grid grid-cols-2 gap-3 px-4 py-3">
            <FieldInput
              label="Tempo (BPM)"
              value="118"
              icon={<Disc3 className="w-3 h-3" />}
              hint="Imported from Muso"
            />
            <FieldInput
              label="Key"
              value="G major"
              icon={<Music2 className="w-3 h-3" />}
            />
            <FieldInput
              label="Time signature"
              value="4/4"
            />
            <FieldInput
              label="Recorded at"
              value="Home studio, Nashville TN"
              icon={<Mic className="w-3 h-3" />}
            />
          </div>
        </Section>

        {/* RELATIONSHIPS */}
        <Section
          title="Relationships"
          subtitle="Versions, samples and links to other tracks"
        >
          <div className="px-4 py-3 space-y-2">
            <RelRow
              kind="Alternate version of"
              target="Made for Us (Acoustic) · Track 15"
            />
            <button className="text-[#319ED8] text-[11.5px] font-medium hover:underline inline-flex items-center gap-1">
              + Add relationship (sample, cover, remix, alternate)
            </button>
          </div>
        </Section>

        {/* CALLOUT */}
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2.5 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-[12px] text-amber-900">
            <span className="font-semibold">ISRC missing on 16 of 17 tracks.</span>{" "}
            <button className="underline font-medium">Auto-generate from album UPC</button>{" "}
            (USBMG2200001 → USBMG2200017) or paste your own per track.
          </div>
        </div>

        {/* ACTION BAR */}
        <div className="sticky bottom-0 -mx-1 mt-2">
          <div className="flex items-center justify-between gap-3 rounded-xl bg-white border border-slate-200 shadow-md px-3 py-2.5">
            <button className="px-2.5 py-1.5 rounded-md text-slate-600 text-[12px] hover:bg-slate-50 inline-flex items-center gap-1">
              <ChevronLeft className="w-3.5 h-3.5" /> Back to tracklist
            </button>
            <div className="flex items-center gap-1.5">
              <button className="px-3 py-1.5 rounded-md bg-slate-100 text-slate-700 text-[12px] font-medium hover:bg-slate-200">
                Save
              </button>
              <button className="px-3 py-1.5 rounded-md bg-[#319ED8] text-white text-[12px] font-semibold hover:bg-[#2890c8] inline-flex items-center gap-1">
                Next: Credits <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =============================== bits ===================================== */

function ChipStepper() {
  return (
    <div className="rounded-xl bg-white border border-slate-200 shadow-sm px-2.5 py-2 flex items-center gap-1.5 overflow-x-auto">
      <button className="w-7 h-7 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center flex-shrink-0">
        <ChevronLeft className="w-4 h-4" />
      </button>
      {Array.from({ length: 17 }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          className={[
            "w-8 h-7 rounded-md text-[11.5px] font-bold tabular-nums flex-shrink-0",
            n === 1
              ? "bg-slate-900 text-white"
              : n <= 4 || n === 7
                ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                : n === 5 || n === 8
                  ? "bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200"
                  : "bg-white text-slate-500 hover:bg-slate-50 border border-slate-200",
          ].join(" ")}
        >
          {n}
        </button>
      ))}
      <button className="w-7 h-7 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center flex-shrink-0">
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
      <header className="px-4 py-3 border-b border-slate-100 bg-gradient-to-b from-white to-slate-50/40">
        <h3 className="text-slate-900 text-[14px] font-bold">{title}</h3>
        <p className="text-slate-500 text-[11.5px] mt-0.5">{subtitle}</p>
      </header>
      {children}
    </section>
  );
}

function FieldInput({
  label,
  value,
  placeholder,
  required,
  icon,
  suffix,
  hint,
}: {
  label: string;
  value: string;
  placeholder?: string;
  required?: boolean;
  icon?: React.ReactNode;
  suffix?: string;
  hint?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="text-slate-400 text-[10px] font-semibold uppercase tracking-wider inline-flex items-center gap-1">
        {icon}
        {label}
        {required && (
          <span className="text-[#319ED8] text-[10px]">·</span>
        )}
      </div>
      <div className="mt-1 flex items-center gap-1.5">
        <input
          defaultValue={value === "—" ? "" : value}
          placeholder={placeholder || value}
          className="flex-1 min-w-0 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[12.5px] text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#319ED8]"
        />
        {suffix && (
          <span className="text-slate-400 text-[11px] tabular-nums flex-shrink-0">
            {suffix}
          </span>
        )}
      </div>
      {hint && (
        <div className="text-slate-400 text-[10.5px] mt-1 italic">{hint}</div>
      )}
    </div>
  );
}

function Inherited({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="text-slate-400 text-[10px] font-semibold uppercase tracking-wider inline-flex items-center gap-1">
        {icon}
        {label}
      </div>
      <div className="mt-1 flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-100 text-slate-800 text-[12px] font-medium">
          <Check className="w-3 h-3 text-emerald-500" />
          {value}
        </span>
        <button className="text-slate-400 text-[10.5px] hover:text-[#319ED8] hover:underline">
          Override
        </button>
      </div>
      <div className="text-slate-400 text-[10.5px] mt-0.5">
        Inherited from album
      </div>
    </div>
  );
}

function Toggle({
  label,
  value,
  hint,
}: {
  label: string;
  value: boolean;
  hint?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="text-slate-400 text-[10px] font-semibold uppercase tracking-wider">
        {label}
      </div>
      <div className="mt-1 flex items-center gap-2">
        <button
          className={[
            "w-9 h-5 rounded-full p-0.5 flex items-center transition-colors",
            value ? "bg-[#319ED8] justify-end" : "bg-slate-200 justify-start",
          ].join(" ")}
        >
          <span className="w-4 h-4 rounded-full bg-white shadow" />
        </button>
        <span className="text-slate-700 text-[12px] font-medium">
          {value ? "On" : "Off"}
        </span>
      </div>
      {hint && (
        <div className="text-slate-400 text-[10.5px] mt-0.5">{hint}</div>
      )}
    </div>
  );
}

function RelRow({ kind, target }: { kind: string; target: string }) {
  return (
    <div className="flex items-center gap-2 px-2.5 py-2 rounded-md border border-slate-200 bg-slate-50/40">
      <span className="text-slate-400 text-[10px] font-semibold uppercase tracking-wider">
        {kind}
      </span>
      <span className="text-slate-900 text-[12.5px] font-semibold flex-1 truncate">
        {target}
      </span>
      <button className="text-slate-400 hover:text-rose-600 text-[11px]">
        Remove
      </button>
    </div>
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
