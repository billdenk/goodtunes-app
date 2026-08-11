// handoff/press-specs — Catalog › Specs. The numbers artists press against:
// per-format audio master-file rules (Vinyl / CD / Cassette) and one set of
// art rules for all components. Presentational code is copied VERBATIM from
// handoff/press-specs/PressSpecsAudioDark.tsx + PressSpecsArtDark.tsx (main
// content only — the real OperatorShell/AdminManufacturer provides the shell);
// only the MOCK_ consts were swapped for live per-press values from
// GET /api/admin/manufacturers/:id/specs (handoff MOCK values are the
// defaults until the press edits them — resolved server-side).
//
// Apple canon: exactly one filled blue pill on the page — the Save button,
// which sits gray-outline DISABLED at idle and only fills blue after a change.

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  FileAudio,
  Clock,
  Waves,
  Image as ImageIcon,
  Ruler,
  Palette,
  Info,
} from "lucide-react";

// ─── Dark charcoal tokens (canon) — verbatim from the handoff ────────
const BLUE = "#319ED8";
const INK = "#f5f5f7";
const SUBINK = "#98989d";
const FAINT = "#6e6e73";
const HAIRLINE = "rgba(255,255,255,0.10)";
const CANVAS = "#161617";
const CARD = "#1e1e20";
const CARD_SOFT = "#26262a";
const PILL_ACTIVE = "#3a3a3e"; // raised active pill on the charcoal track (canon)
const PILL_SHADOW = "0 1px 2px rgba(0,0,0,0.4), 0 0 0 0.5px rgba(255,255,255,0.06)";

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

// ─── Spec value shapes (mirror server resolvePressSpecs) ─────────────
type VinylAudio = {
  formats: string; bitDepth: string; sampleRate: string; onePerSide: string;
  side12_33: string; side12_45: string; side10_33: string; side10_45: string; side7_45: string;
  monoBelow: string; deEss: string; cuttingMethod: string; testPressings: string;
};
type CdAudio = { masters: string; bitRate: string; maxLength: string; isrc: string; trackGap: string; pregap: string };
type CassetteAudio = { formats: string; bitDepth: string; c30: string; c45: string; c60: string };
type ArtSpecs = {
  minResolution: string; bitmapMin: string; bleedMin: string; bleedRec: string; safetyMargin: string;
  colorMode: string; pantone: string; maxSpots: string; placedImages: string; acceptedFormats: string; fonts: string;
};
type SpecsPayload = {
  audio: { vinyl: VinylAudio; cd: CdAudio; cassette: CassetteAudio };
  art: ArtSpecs;
  canEdit?: boolean;
};

// ─── Small form atoms — verbatim from the handoff, wired for edit ────
function Field({ label, value, suffix, wide, onChange, disabled }: { label: string; value: string; suffix?: string; wide?: boolean; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <label className={cn("block", wide && "col-span-2")}>
      <span className="block text-[12px] font-medium mb-1.5" style={{ color: SUBINK }}>
        {label}
      </span>
      <span className="flex items-center h-9 rounded-lg px-3" style={{ backgroundColor: CARD_SOFT, border: `1px solid ${HAIRLINE}` }}>
        <input
          className="flex-1 bg-transparent text-[13.5px] focus:outline-none"
          style={{ color: INK, minWidth: 0, width: "100%" }}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          readOnly={disabled}
          data-testid={`input-spec-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
        />
        {suffix && (
          <span className="text-[12px] flex-shrink-0 pl-2" style={{ color: FAINT }}>
            {suffix}
          </span>
        )}
      </span>
    </label>
  );
}

function ChoiceRow({ label, options, selected, onSelect, disabled }: { label: string; options: string[]; selected: string; onSelect: (v: string) => void; disabled?: boolean }) {
  return (
    <div>
      <span className="block text-[12px] font-medium mb-1.5" style={{ color: SUBINK }}>
        {label}
      </span>
      <div className="inline-flex items-center p-0.5 rounded-full" style={{ backgroundColor: CARD_SOFT, border: `1px solid ${HAIRLINE}` }}>
        {options.map((o) => {
          const on = o === selected;
          return (
            <button
              key={o}
              type="button"
              onClick={() => { if (!disabled) onSelect(o); }}
              className="h-7 px-3.5 rounded-full text-[12.5px] font-semibold transition-colors"
              style={{ color: on ? INK : SUBINK, backgroundColor: on ? PILL_ACTIVE : undefined, boxShadow: on ? PILL_SHADOW : undefined }}
              data-testid={`choice-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${o.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
            >
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SpecCard({ icon: Icon, title, sub, children }: { icon: typeof FileAudio; title: string; sub: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl p-6" style={{ backgroundColor: CARD, border: `1px solid ${HAIRLINE}` }}>
      <div className="flex items-center gap-3">
        <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: CARD_SOFT, border: `1px solid ${HAIRLINE}` }}>
          <Icon className="w-4 h-4" style={{ color: SUBINK }} />
        </span>
        <div>
          <h2 className="text-[15px] font-semibold" style={{ color: INK }}>
            {title}
          </h2>
          <p className="text-[12px]" style={{ color: FAINT }}>
            {sub}
          </p>
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

// ─── Per-format field sets — verbatim structure, live values ─────────
function VinylFields({ v, set, disabled }: { v: VinylAudio; set: (k: keyof VinylAudio, val: string) => void; disabled?: boolean }) {
  return (
    <div className="space-y-4">
      <SpecCard icon={FileAudio} title="Master files" sub="What you accept from artists — the digital inputs for a physical run.">
        <div className="grid gap-4" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
          <Field label="Accepted formats" value={v.formats} onChange={(x) => set("formats", x)} disabled={disabled} />
          <Field label="Bit depth (minimum)" value={v.bitDepth} suffix="bit" onChange={(x) => set("bitDepth", x)} disabled={disabled} />
          <Field label="Sample rate" value={v.sampleRate} suffix="kHz" onChange={(x) => set("sampleRate", x)} disabled={disabled} />
          <Field label="One file per side" value={v.onePerSide} onChange={(x) => set("onePerSide", x)} disabled={disabled} />
        </div>
      </SpecCard>

      <SpecCard icon={Clock} title="Side lengths" sub="Longer sides press quieter. These are your cutting limits per size and speed.">
        <div className="grid gap-4" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)" }}>
          <Field label={"12″ · 33⅓ RPM"} value={v.side12_33} suffix="min/side" onChange={(x) => set("side12_33", x)} disabled={disabled} />
          <Field label={"12″ · 45 RPM"} value={v.side12_45} suffix="min/side" onChange={(x) => set("side12_45", x)} disabled={disabled} />
          <Field label={"10″ · 33⅓ RPM"} value={v.side10_33} suffix="min/side" onChange={(x) => set("side10_33", x)} disabled={disabled} />
          <Field label={"10″ · 45 RPM"} value={v.side10_45} suffix="min/side" onChange={(x) => set("side10_45", x)} disabled={disabled} />
          <Field label={"7″ · 45 RPM"} value={v.side7_45} suffix="min/side" onChange={(x) => set("side7_45", x)} disabled={disabled} />
        </div>
        <p className="mt-3 text-[12px] flex items-start gap-1.5" style={{ color: FAINT }}>
          <Info className="w-3.5 h-3.5 mt-[1px] flex-shrink-0" />
          Sides past these lengths get a heads-up at upload — artists can proceed, but we flag the level trade-off.
        </p>
      </SpecCard>

      <SpecCard icon={Waves} title="Cutting guidance" sub="Advisories shown to artists before they submit.">
        <div className="grid gap-4" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
          <Field label="Low end mono below" value={v.monoBelow} suffix="Hz" onChange={(x) => set("monoBelow", x)} disabled={disabled} />
          <Field label="Sibilance / de-ess advisory" value={v.deEss} onChange={(x) => set("deEss", x)} disabled={disabled} />
          <ChoiceRow label="Cutting method" options={["Lacquer", "DMM"]} selected={v.cuttingMethod} onSelect={(x) => set("cuttingMethod", x)} disabled={disabled} />
          <ChoiceRow label="Test pressings" options={["Included", "Optional add-on"]} selected={v.testPressings} onSelect={(x) => set("testPressings", x)} disabled={disabled} />
        </div>
      </SpecCard>
    </div>
  );
}

function CDFields({ v, set, disabled }: { v: CdAudio; set: (k: keyof CdAudio, val: string) => void; disabled?: boolean }) {
  return (
    <div className="space-y-4">
      <SpecCard icon={FileAudio} title="Master files" sub="Red Book is the spec — CDs are less forgiving than vinyl about formats.">
        <div className="grid gap-4" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
          <Field label="Accepted masters" value={v.masters} onChange={(x) => set("masters", x)} disabled={disabled} />
          <Field label="Bit depth / sample rate" value={v.bitRate} suffix="Red Book" onChange={(x) => set("bitRate", x)} disabled={disabled} />
          <Field label="Max disc length" value={v.maxLength} suffix="min" onChange={(x) => set("maxLength", x)} disabled={disabled} />
          <Field label="ISRC / CD-Text" value={v.isrc} onChange={(x) => set("isrc", x)} disabled={disabled} />
        </div>
      </SpecCard>
      <SpecCard icon={Waves} title="Guidance" sub="Advisories shown to artists before they submit.">
        <div className="grid gap-4" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
          <Field label="Gap between tracks" value={v.trackGap} onChange={(x) => set("trackGap", x)} disabled={disabled} />
          <ChoiceRow label="Hidden / pregap tracks" options={["Allowed", "Not supported"]} selected={v.pregap} onSelect={(x) => set("pregap", x)} disabled={disabled} />
        </div>
      </SpecCard>
    </div>
  );
}

function CassetteFields({ v, set, disabled }: { v: CassetteAudio; set: (k: keyof CassetteAudio, val: string) => void; disabled?: boolean }) {
  return (
    <div className="space-y-4">
      <SpecCard icon={FileAudio} title="Master files" sub="Same digital inputs — the shell length is the constraint.">
        <div className="grid gap-4" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
          <Field label="Accepted formats" value={v.formats} onChange={(x) => set("formats", x)} disabled={disabled} />
          <Field label="Bit depth (minimum)" value={v.bitDepth} suffix="bit" onChange={(x) => set("bitDepth", x)} disabled={disabled} />
        </div>
      </SpecCard>
      <SpecCard icon={Clock} title="Side lengths" sub="Program must balance across Side A and Side B of the shell.">
        <div className="grid gap-4" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)" }}>
          <Field label="C-30" value={v.c30} suffix="min/side" onChange={(x) => set("c30", x)} disabled={disabled} />
          <Field label="C-45" value={v.c45} suffix="min/side" onChange={(x) => set("c45", x)} disabled={disabled} />
          <Field label="C-60" value={v.c60} suffix="min/side" onChange={(x) => set("c60", x)} disabled={disabled} />
        </div>
        <p className="mt-3 text-[12px] flex items-start gap-1.5" style={{ color: FAINT }}>
          <Info className="w-3.5 h-3.5 mt-[1px] flex-shrink-0" />
          Sides more than 3 minutes apart get an advisory — the longer side sets the tape length.
        </p>
      </SpecCard>
    </div>
  );
}

function ArtFields({ v, set, disabled }: { v: ArtSpecs; set: (k: keyof ArtSpecs, val: string) => void; disabled?: boolean }) {
  return (
    <div className="mt-8 space-y-4">
      <SpecCard icon={ImageIcon} title="Resolution" sub="Floors, not targets — anything below gets flagged at upload.">
        <div className="grid gap-4" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
          <Field label="Minimum resolution" value={v.minResolution} suffix="PPI" onChange={(x) => set("minResolution", x)} disabled={disabled} />
          <Field label="Bitmap / line art minimum" value={v.bitmapMin} suffix="PPI" onChange={(x) => set("bitmapMin", x)} disabled={disabled} />
        </div>
      </SpecCard>

      <SpecCard icon={Ruler} title="Geometry" sub="Measured against the template uploaded with each component.">
        <div className="grid gap-4" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)" }}>
          <Field label="Bleed (minimum)" value={v.bleedMin} suffix="in" onChange={(x) => set("bleedMin", x)} disabled={disabled} />
          <Field label="Bleed (recommended)" value={v.bleedRec} suffix="in" onChange={(x) => set("bleedRec", x)} disabled={disabled} />
          <Field label="Safety margin" value={v.safetyMargin} suffix="in" onChange={(x) => set("safetyMargin", x)} disabled={disabled} />
        </div>
        <p className="mt-3 text-[12px] flex items-start gap-1.5" style={{ color: FAINT }}>
          <Info className="w-3.5 h-3.5 mt-[1px] flex-shrink-0" />
          Keep type and logos inside the safety margin — spine folds wander up to 1/16″ on press.
        </p>
      </SpecCard>

      <SpecCard icon={Palette} title="Color" sub="What your print line accepts.">
        <div className="grid gap-4" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
          <ChoiceRow label="Color mode" options={["CMYK", "CMYK + PMS", "Grayscale"]} selected={v.colorMode} onSelect={(x) => set("colorMode", x)} disabled={disabled} />
          <ChoiceRow label="Pantone names required" options={["Official only", "Any"]} selected={v.pantone} onSelect={(x) => set("pantone", x)} disabled={disabled} />
          <Field label="Max spot colors" value={v.maxSpots} suffix="PMS" onChange={(x) => set("maxSpots", x)} disabled={disabled} />
          <Field label="Placed images" value={v.placedImages} onChange={(x) => set("placedImages", x)} disabled={disabled} />
          <Field label="Accepted formats" value={v.acceptedFormats} onChange={(x) => set("acceptedFormats", x)} disabled={disabled} />
          <Field label="Fonts" value={v.fonts} onChange={(x) => set("fonts", x)} disabled={disabled} />
        </div>
      </SpecCard>
    </div>
  );
}

// Shallow diff — the keys of `next` whose values differ from `base`.
function diff<T extends Record<string, string>>(base: T, next: T): Partial<T> {
  const out: Partial<T> = {};
  for (const k of Object.keys(next) as (keyof T)[]) {
    if (next[k] !== base[k]) out[k] = next[k];
  }
  return out;
}

// ─── The page ────────────────────────────────────────────────────────
export function PressSpecs({
  pressId,
  variant = "press",
}: {
  pressId: string;
  /** "press" = press portal (copy says "your numbers"); "admin" = super-admin
   *  view inside AdminManufacturer (copy says "this press's numbers"). */
  variant?: "press" | "admin";
}) {
  const { toast } = useToast();
  const specsKey = ["/api/admin/manufacturers", pressId, "specs"] as const;
  const { data } = useQuery<SpecsPayload>({ queryKey: specsKey as unknown as unknown[] });

  const [view, setView] = useState<"audio" | "art">("audio");
  const [format, setFormat] = useState<"vinyl" | "cd" | "cassette">("vinyl");

  // Local edit state, seeded from the server payload. Re-seed only when the
  // press changes or nothing is dirty (local-edit-vs-shared-query-reseed).
  const [audio, setAudio] = useState<SpecsPayload["audio"] | null>(null);
  const [art, setArt] = useState<ArtSpecs | null>(null);

  const audioDirty = useMemo(() => {
    if (!data || !audio) return false;
    return (
      Object.keys(diff(data.audio.vinyl, audio.vinyl)).length > 0 ||
      Object.keys(diff(data.audio.cd, audio.cd)).length > 0 ||
      Object.keys(diff(data.audio.cassette, audio.cassette)).length > 0
    );
  }, [data, audio]);
  const artDirty = useMemo(() => {
    if (!data || !art) return false;
    return Object.keys(diff(data.art, art)).length > 0;
  }, [data, art]);

  useEffect(() => {
    if (!data) return;
    setAudio((prev) => (prev && audioDirty ? prev : data.audio));
    setArt((prev) => (prev && artDirty ? prev : data.art));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, pressId]);

  const canEdit = data?.canEdit !== false;
  const dirty = view === "audio" ? audioDirty : artDirty;

  const save = useMutation({
    mutationFn: async () => {
      if (!data) return;
      if (view === "audio" && audio) {
        for (const f of ["vinyl", "cd", "cassette"] as const) {
          const patch = diff(data.audio[f] as Record<string, string>, audio[f] as Record<string, string>);
          if (Object.keys(patch).length === 0) continue;
          const r = await apiRequest("PUT", `/api/admin/manufacturers/${pressId}/specs/audio/${f}`, patch);
          if (!r.ok) throw new Error(await r.text());
        }
      } else if (view === "art" && art) {
        const patch = diff(data.art as Record<string, string>, art as Record<string, string>);
        if (Object.keys(patch).length > 0) {
          const r = await apiRequest("PUT", `/api/admin/manufacturers/${pressId}/specs/art`, patch);
          if (!r.ok) throw new Error(await r.text());
        }
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: specsKey as unknown as unknown[] });
      toast({ title: view === "audio" ? "Audio specs saved" : "Art specs saved" });
    },
    onError: () => toast({ title: "Couldn't save specs", variant: "destructive" }),
  });

  const a = audio ?? data?.audio ?? null;
  const ar = art ?? data?.art ?? null;
  if (!a || !ar) {
    return (
      <div className="w-full" style={{ backgroundColor: CANVAS, minHeight: 400 }} data-testid="panel-press-specs" />
    );
  }

  const setVinyl = (k: keyof VinylAudio, val: string) => setAudio((p) => (p ? { ...p, vinyl: { ...p.vinyl, [k]: val } } : p));
  const setCd = (k: keyof CdAudio, val: string) => setAudio((p) => (p ? { ...p, cd: { ...p.cd, [k]: val } } : p));
  const setCassette = (k: keyof CassetteAudio, val: string) => setAudio((p) => (p ? { ...p, cassette: { ...p.cassette, [k]: val } } : p));
  const setArtField = (k: keyof ArtSpecs, val: string) => setArt((p) => (p ? { ...p, [k]: val } : p));

  const saveEnabled = canEdit && dirty && !save.isPending;

  return (
    <div className="w-full font-sans" style={{ backgroundColor: CANVAS, color: INK }} data-testid="panel-press-specs">
      <div className="max-w-3xl mx-auto px-10 pt-12 pb-16">
        {/* Audio / Art left · Save (idle until changes) right — consistent header on both views */}
        <div className="flex items-center justify-between gap-4">
          <div className="inline-flex items-center p-1 rounded-full" style={{ backgroundColor: CARD_SOFT, border: `1px solid ${HAIRLINE}` }} role="tablist" aria-label="Spec type">
            <button
              type="button"
              role="tab"
              aria-selected={view === "audio"}
              onClick={() => setView("audio")}
              className="h-8 px-5 rounded-full text-[13px] font-semibold"
              style={view === "audio" ? { color: INK, backgroundColor: PILL_ACTIVE, boxShadow: PILL_SHADOW } : { color: SUBINK }}
              data-testid="tab-specs-audio"
            >
              Audio
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "art"}
              onClick={() => setView("art")}
              className="h-8 px-5 rounded-full text-[13px] font-semibold"
              style={view === "art" ? { color: INK, backgroundColor: PILL_ACTIVE, boxShadow: PILL_SHADOW } : { color: SUBINK }}
              data-testid="tab-specs-art"
            >
              Art
            </button>
          </div>
          <button
            type="button"
            disabled={!saveEnabled}
            onClick={() => { if (saveEnabled) save.mutate(); }}
            className="h-9 px-4 rounded-full text-[13px] font-semibold flex-shrink-0"
            style={
              saveEnabled
                ? { backgroundColor: BLUE, color: "#fff", border: "1px solid transparent", cursor: "pointer" }
                : { backgroundColor: "transparent", color: FAINT, border: `1px solid ${HAIRLINE}`, cursor: "default" }
            }
            title={saveEnabled ? undefined : "Enabled once you change something"}
            data-testid={view === "audio" ? "button-save-audio-specs" : "button-save-art-specs"}
          >{save.isPending ? "Saving…" : "Save"}</button>
        </div>

        <h1 className="mt-6 text-[30px] font-semibold" style={{ color: INK, letterSpacing: "-0.02em" }}>
          Specs. <span style={{ color: SUBINK }}>The numbers artists press against.</span>
        </h1>
        <p className="mt-2 text-[13.5px]" style={{ color: SUBINK }}>
          {variant === "admin"
            ? "Artists see these at upload. Anything outside this press's numbers gets flagged before it reaches them."
            : "Artists see these at upload. Anything outside your numbers gets flagged before it reaches you."}
        </p>

        {view === "audio" ? (
          <>
            {/* Format switcher — sits with the content it controls, below the shared header */}
            <div className="mt-8">
              <div className="inline-flex items-center p-0.5 rounded-full" style={{ backgroundColor: CARD_SOFT, border: `1px solid ${HAIRLINE}` }} role="tablist" aria-label="Format">
                {(["vinyl", "cd", "cassette"] as const).map((f) => {
                  const on = format === f;
                  return (
                    <button
                      key={f}
                      type="button"
                      role="tab"
                      aria-selected={on}
                      onClick={() => setFormat(f)}
                      className="h-7 px-3.5 rounded-full text-[12.5px] font-medium transition-colors"
                      style={{ color: on ? INK : SUBINK, backgroundColor: on ? PILL_ACTIVE : undefined, boxShadow: on ? PILL_SHADOW : undefined }}
                      data-testid={`tab-format-${f}`}
                    >
                      {f === "vinyl" ? "Vinyl" : f === "cd" ? "CD" : "Cassette"}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-4">
              {format === "vinyl" && <VinylFields v={a.vinyl} set={setVinyl} disabled={!canEdit} />}
              {format === "cd" && <CDFields v={a.cd} set={setCd} disabled={!canEdit} />}
              {format === "cassette" && <CassetteFields v={a.cassette} set={setCassette} disabled={!canEdit} />}
            </div>
          </>
        ) : (
          <ArtFields v={ar} set={setArtField} disabled={!canEdit} />
        )}
      </div>
    </div>
  );
}

export default PressSpecs;
