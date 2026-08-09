// Press portal — "Add your vinyl" color setup (Apple-canon restyle, screen 4).
// Matches docs/design-reference/code/PressVinylColorSetup.tsx:
//   • LEFT — a large, calm vinyl DISC that live-previews the selected color,
//     with the press's own center-label branding (label logo + bg are
//     per-press inputs; no logo = plain generic label).
//   • RIGHT — (1) pick a color group via disc-preview cards, with a
//     "+ More types" popover to add a group; (2) pick a swatch from a glossy
//     ball grid, or add/edit one via a frosted popover (name + hex + photo).
//
// Real data wiring: reads GET /api/admin/manufacturers/:id/catalog and writes
// through the existing color/tier CRUD endpoints (mirroring ManageColorsPanel).
// The reference's per-swatch size chips are omitted — colors belong to a
// format-scoped group in the real model, so the format context sits above the
// group cards instead. The ONE filled blue pill is "Save color" in the editor.

import { useMemo, useState, type ReactNode, type MutableRefObject } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { postAdminImage } from "@/lib/adminUpload";
import { useToast } from "@/hooks/use-toast";
import { ALBUM_FORMAT_LABEL, type AlbumFormat } from "@shared/schema";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Check,
  UploadCloud,
  Plus,
  MoreHorizontal,
  Trash2,
  Search,
  X,
  Loader2,
} from "lucide-react";
import { useAdminDark } from "@/lib/adminAppearance";

// ─── Apple-canon tokens (shared with PressPortal dashboard) ──────────
const BLUE = "#319ED8";

// Subtle light rim that separates a dark disc silhouette from the dark page —
// a hairline of reflected light around the edge, NOT a glow (dark canon).
const DISC_RIM = "0 0 0 0.5px rgba(255,255,255,0.14), 0 1px 3px rgba(0,0,0,0.5)";
const INK = "var(--apple-ink)";
const SUBINK = "var(--apple-subink)";
const HAIRLINE = "var(--apple-hairline)";
const FAINT = "var(--apple-faint)";
const CRITICAL = "#e0245e";

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

// ─── Catalog payload (subset of GET .../catalog we render) ───────────
export interface CatalogColor {
  id: string;
  name: string;
  swatchHex: string | null;
  swatchImageUrl: string | null;
  swatchThumbUrl: string | null;
  thumbnailUrl?: string | null;
  position: number;
}
interface CatalogTier {
  id: string;
  name: string;
  position: number;
  colors: CatalogColor[];
}
interface CatalogFormat {
  format: string;
  position: number;
  hidden?: boolean;
  tiers: CatalogTier[];
}
interface Catalog {
  formats: CatalogFormat[];
  canEdit?: boolean;
}

const VINYL_FORMAT_PREFIXES = ["7", "10", "12"];
function isVinylFormat(f: string): boolean {
  return VINYL_FORMAT_PREFIXES.some((p) => f.startsWith(p));
}
function formatLabel(f: string): string {
  return (ALBUM_FORMAT_LABEL as Record<string, string>)[f] ?? f;
}

// ─── Disc rendering ──────────────────────────────────────────────────
// Real catalog colors carry a hex and/or a photo swatch. Photo swatches render
// as a circular photo disc (they ARE the disc, cropped); hex swatches render
// as a colored disc with a quiet repeating groove gradient (mirrors
// VinylPreview's disc branch). The center label carries the press's branding.
function discBackground(hex: string): string {
  return `repeating-radial-gradient(circle at 50% 50%, rgba(0,0,0,0.14) 0px, rgba(0,0,0,0) 2px, rgba(0,0,0,0.14) 4px), radial-gradient(circle at 35% 30%, rgba(255,255,255,0.16), rgba(0,0,0,0.22) 72%), ${hex}`;
}

function PressDiscLabel({
  size,
  logoUrl,
  bgColor,
}: {
  size: number;
  logoUrl: string | null;
  bgColor: string | null;
}) {
  // Blessed reference (CORRECTIONS item 27): a plain BLACK label carrying the
  // press's logo in white. The dark logo asset is rendered white with
  // `invert(1) brightness(1.7)`. bgColor is still threaded (kept in the
  // signature so call sites compile) but the fill is UNCONDITIONALLY the
  // reference's PRESS_LABEL_BG, never overridden.
  void bgColor;
  return (
    <div
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: size,
        height: size,
        borderRadius: "50%",
        backgroundColor: "#0a0a0a",
        overflow: "hidden",
      }}
    >
      {logoUrl && size >= 70 && (
        <img
          src={logoUrl}
          alt=""
          aria-hidden
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: size * 0.9,
            height: size * 0.9,
            objectFit: "contain",
            filter: "invert(1) brightness(1.7)",
          }}
        />
      )}
    </div>
  );
}

export function VinylDisc({
  size,
  color,
  labelLogoUrl,
  labelBgColor,
  spin = false,
  bodyRef,
  labelRatio,
  holeRatio = 0.018,
}: {
  size: number;
  color: CatalogColor | null;
  labelLogoUrl: string | null;
  labelBgColor: string | null;
  spin?: boolean;
  // Blessed reference: when the caller wants to drive rotation imperatively
  // (JacketStage), it passes a bodyRef attached to the rotating body div. The
  // className-based `spin` prop is kept working for the add-your-vinyl stage.
  bodyRef?: MutableRefObject<HTMLDivElement | null>;
  labelRatio?: number;
  holeRatio?: number;
}) {
  const LABEL_RATIO = labelRatio ?? 368 / 1104;
  const photo = color?.swatchImageUrl || color?.swatchThumbUrl || color?.thumbnailUrl || null;
  const hex = color?.swatchHex || "#111114";
  const dark = useAdminDark();
  // A ref-driven body is spin-capable (willChange transform) just like the
  // className spin path.
  const spinning = spin || !!bodyRef;
  return (
    <div
      className={spin ? "gt-vinyl" : undefined}
      style={{
        position: "relative",
        width: size,
        height: size,
        borderRadius: "50%",
        backgroundColor: "#000",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      <div
        ref={bodyRef}
        className={spin ? "gt-vinyl-body" : undefined}
        style={{ position: "absolute", inset: 0, borderRadius: "50%", willChange: spinning ? "transform" : undefined }}
      >
        {photo ? (
          <img
            src={photo}
            alt=""
            aria-hidden
            className="w-full h-full object-cover"
            style={{ position: "absolute", inset: 0, transform: "scale(1.04)", borderRadius: "50%" }}
          />
        ) : (
          <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: discBackground(hex) }} />
        )}
        <PressDiscLabel size={size * LABEL_RATIO} logoUrl={labelLogoUrl} bgColor={labelBgColor} />
      </div>

      {/* Gloss overlay — blessed reference: a fixed white fill masked by the
          vinyl-highlights PNG. Sits OUTSIDE the rotating body so the light
          stays put while grooves/label rotate. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: "#ffffff",
          opacity: 0.6,
          mixBlendMode: "normal",
          maskImage: "url(/vinyl-highlights.png)",
          WebkitMaskImage: "url(/vinyl-highlights.png)",
          maskSize: "100% 100%",
          WebkitMaskSize: "100% 100%",
          maskRepeat: "no-repeat",
          WebkitMaskRepeat: "no-repeat",
          pointerEvents: "none",
          zIndex: 1,
        }}
      />

      {/* Dark canon (apple-canon.md) — a hairline of reflected light around the
          edge so a dark disc silhouette separates from the near-black page.
          Inset ring (clipped by overflow:hidden), brighter up top, NOT a glow.
          Light mode is untouched. */}
      {dark && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            pointerEvents: "none",
            zIndex: 2,
            boxShadow:
              "inset 0 0 0 1px rgba(255,255,255,0.16), inset 0 1px 1.5px rgba(255,255,255,0.22)",
          }}
        />
      )}

      {/* Spindle hole — a hole, so it shows the page canvas behind it. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: Math.max(3, size * holeRatio),
          height: Math.max(3, size * holeRatio),
          borderRadius: "50%",
          zIndex: 3,
          backgroundColor: "var(--apple-canvas, #f5f5f7)",
          boxShadow: "inset 0 0.5px 1px rgba(0,0,0,0.5)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

export const DISC_SPIN_CSS = `
@keyframes gt-vinyl-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.gt-vinyl { transition: transform 600ms cubic-bezier(0.22, 1, 0.36, 1); }
.gt-vinyl .gt-vinyl-body { animation: gt-vinyl-spin 8s linear infinite; animation-play-state: paused; }
.gt-vinyl:hover { transform: translateY(-2px); }
.gt-vinyl:hover .gt-vinyl-body { animation-play-state: running; }
@media (prefers-reduced-motion: reduce) {
  .gt-vinyl:hover { transform: none; }
  .gt-vinyl .gt-vinyl-body { animation: none; }
}
`;

function DiscStage({
  color,
  labelLogoUrl,
  labelBgColor,
}: {
  color: CatalogColor | null;
  labelLogoUrl: string | null;
  labelBgColor: string | null;
}) {
  const SIZE = 340;
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <style dangerouslySetInnerHTML={{ __html: DISC_SPIN_CSS }} />
      <VinylDisc size={SIZE} color={color} labelLogoUrl={labelLogoUrl} labelBgColor={labelBgColor} spin />
      <div
        aria-hidden
        style={{
          position: "absolute",
          bottom: -16,
          left: "50%",
          transform: "translateX(-50%)",
          width: Math.round(SIZE * 0.43),
          height: 12,
          borderRadius: "50%",
          background: "rgba(0,0,0,0.32)",
          filter: "blur(7px)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

// Glossy round color ball — photo swatches show the photo, hex a gradient ball.
export function ColorBall({ color, size = 40 }: { color: CatalogColor; size?: number }) {
  const photo = color.swatchThumbUrl || color.swatchImageUrl;
  const dark = useAdminDark();
  return (
    <span
      className="relative block rounded-full overflow-hidden"
      style={{ width: size, height: size, boxShadow: dark ? DISC_RIM : "0 0 0 1px rgba(15,23,42,0.10)" }}
    >
      {photo ? (
        <img src={photo} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover rounded-full" />
      ) : (
        <span
          className="absolute inset-0 rounded-full"
          style={{
            background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.55), ${color.swatchHex ?? "#888"} 70%)`,
            opacity: 0.94,
          }}
        />
      )}
    </span>
  );
}

// ─── Two-tone headings ───────────────────────────────────────────────
export function PageHeading({ lead, rest }: { lead: string; rest: string }) {
  return (
    <h1 className="tracking-tight" style={{ fontSize: 40, fontWeight: 700, lineHeight: 1.05, marginTop: 10 }}>
      <span style={{ color: INK }}>{lead} </span>
      <span style={{ color: FAINT, fontWeight: 600 }}>{rest}</span>
    </h1>
  );
}
export function StepHeading({ lead, rest }: { lead: string; rest: string }) {
  return (
    <h2 className="tracking-tight" style={{ fontSize: 24, lineHeight: 1.15, fontWeight: 600 }}>
      <span style={{ color: INK }}>{lead} </span>
      <span style={{ color: FAINT }}>{rest}</span>
    </h2>
  );
}

// ─── Hex color field with live swatch ────────────────────────────────
function ColorField({
  label,
  value,
  onChange,
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  testId: string;
}) {
  const [text, setText] = useState(value.toUpperCase());
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: SUBINK }}>
        {label}
      </label>
      <div className="flex items-center gap-2.5">
        <input
          type="color"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setText(e.target.value.toUpperCase());
          }}
          className="cursor-pointer"
          style={{ width: 38, height: 38, border: "none", padding: 2, borderRadius: 10, background: "none" }}
          aria-label={`${label} picker`}
          data-testid={`${testId}-picker`}
        />
        <input
          type="text"
          value={text}
          onChange={(e) => {
            const v = e.target.value.trim();
            setText(v.toUpperCase());
            if (/^#[0-9A-Fa-f]{6}$/.test(v)) onChange(v);
          }}
          className="font-mono text-[13px] bg-white focus:outline-none"
          style={{ width: 100, height: 38, border: `1px solid ${HAIRLINE}`, borderRadius: 10, padding: "0 12px", color: INK }}
          aria-label={`${label} hex`}
          data-testid={`${testId}-hex`}
        />
        <span className="rounded-lg flex-shrink-0" style={{ width: 26, height: 26, backgroundColor: value, border: `1px solid ${HAIRLINE}` }} />
      </div>
    </div>
  );
}

// ─── Frosted color editor (add + edit) ───────────────────────────────
export function SwatchEditorPopover({
  open,
  onOpenChange,
  trigger,
  edit,
  saving,
  onSave,
  onRemove,
  labelLogoUrl,
  labelBgColor,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  trigger: ReactNode;
  edit?: CatalogColor;
  saving: boolean;
  onSave: (v: { name: string; swatchHex: string | null; swatchImageUrl: string | null }) => void;
  onRemove?: () => void;
  labelLogoUrl: string | null;
  labelBgColor: string | null;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(edit?.name ?? "");
  const [hex, setHex] = useState(edit?.swatchHex ?? "#C81E38");
  const [photoUrl, setPhotoUrl] = useState<string | null>(edit?.swatchImageUrl ?? null);
  const [uploading, setUploading] = useState(false);

  const seed = () => {
    setName(edit?.name ?? "");
    setHex(edit?.swatchHex ?? "#C81E38");
    setPhotoUrl(edit?.swatchImageUrl ?? null);
    setUploading(false);
  };

  const canSave = name.trim().length > 0 && !uploading && !saving;

  const pickPhoto = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setUploading(true);
      try {
        const r = await postAdminImage(file, { mask: "disc", noun: "swatch" });
        setPhotoUrl(r.url);
      } catch (err: any) {
        toast({ title: "Upload failed", description: err?.message, variant: "destructive" });
      } finally {
        setUploading(false);
      }
    };
    input.click();
  };

  const previewColor: CatalogColor = {
    id: "preview",
    name: name || (edit ? edit.name : "New color"),
    swatchHex: hex,
    swatchImageUrl: photoUrl,
    swatchThumbUrl: null,
    position: 0,
  };

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        if (v) seed();
        onOpenChange(v);
      }}
    >
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={10}
        avoidCollisions
        collisionPadding={16}
        className="w-[360px] p-0 rounded-2xl overflow-hidden flex flex-col"
        style={{
          border: `1px solid ${HAIRLINE}`,
          backgroundColor: "var(--apple-frost, rgba(255,255,255,0.82))",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          boxShadow: "0 24px 56px rgba(0,0,0,0.18)",
          maxHeight: "min(640px, calc(100vh - 32px))",
        }}
        data-testid={edit ? "popover-edit-color" : "popover-add-color"}
      >
        {/* Pinned header */}
        <div className="flex items-center gap-3 flex-shrink-0" style={{ padding: "18px 18px 14px 18px" }}>
          <VinylDisc size={44} color={previewColor} labelLogoUrl={labelLogoUrl} labelBgColor={labelBgColor} />
          <div>
            <div className="text-[15px] font-semibold tracking-tight" style={{ color: INK }}>
              {edit ? (
                <>
                  Edit color. <span style={{ color: FAINT, fontWeight: 600 }}>{edit.name}.</span>
                </>
              ) : (
                "New color"
              )}
            </div>
            <div className="text-[12px]" style={{ color: SUBINK }}>
              Define, then save to your catalog.
            </div>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 min-h-0 overflow-y-auto" style={{ padding: "0 18px 18px 18px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: SUBINK }}>
                Color name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Cosmic Splatter"
                className="text-[13.5px] bg-white focus:outline-none focus:border-slate-400 transition-colors"
                style={{ height: 40, border: `1px solid ${HAIRLINE}`, borderRadius: 10, padding: "0 12px", color: INK }}
                data-testid="input-color-name"
              />
            </div>

            <div className="rounded-xl bg-white" style={{ border: `1px solid ${HAIRLINE}`, padding: 14 }}>
              <ColorField label="Vinyl color" value={hex} onChange={setHex} testId="color-base" />
            </div>

            {/* photo swatch upload */}
            <button
              type="button"
              onClick={pickPhoto}
              disabled={uploading}
              data-testid="button-upload-swatch"
              className="w-full rounded-xl flex flex-col items-center justify-center text-center transition-colors hover:bg-slate-50 focus:outline-none bg-white"
              style={{ padding: "16px 12px", border: `1px dashed ${photoUrl ? BLUE : "var(--apple-faint)"}` }}
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" style={{ color: BLUE }} />
                  <span className="text-[12.5px] font-semibold" style={{ color: SUBINK, marginTop: 6 }}>
                    Uploading…
                  </span>
                </>
              ) : photoUrl ? (
                <>
                  <Check className="w-4 h-4" style={{ color: BLUE }} strokeWidth={2.5} />
                  <span className="text-[12.5px] font-semibold" style={{ color: BLUE, marginTop: 6 }}>
                    Photo swatch attached
                  </span>
                  <span className="text-[11.5px]" style={{ color: SUBINK, marginTop: 1 }}>
                    Tap to replace — the photo wins over the hex
                  </span>
                </>
              ) : (
                <>
                  <UploadCloud className="w-4 h-4" style={{ color: FAINT }} />
                  <span className="text-[12.5px] font-semibold" style={{ color: INK, marginTop: 6 }}>
                    Upload a swatch
                  </span>
                  <span className="text-[11.5px]" style={{ color: SUBINK, marginTop: 1 }}>
                    PNG or JPG reference
                  </span>
                </>
              )}
            </button>
            {photoUrl && (
              <button
                type="button"
                onClick={() => setPhotoUrl(null)}
                className="self-start text-[12px] font-semibold rounded-full px-2.5 py-1 transition-colors hover:bg-slate-100"
                style={{ color: SUBINK }}
                data-testid="button-clear-photo"
              >
                Remove photo — use the hex instead
              </button>
            )}

            {edit && onRemove && (
              <div style={{ paddingTop: 2 }}>
                <button
                  type="button"
                  onClick={() => {
                    onRemove();
                    onOpenChange(false);
                  }}
                  className="inline-flex items-center gap-1.5 text-[13px] font-semibold rounded-full px-2.5 py-1.5 transition-colors hover:bg-rose-50"
                  style={{ color: CRITICAL }}
                  data-testid="button-remove-color"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remove color
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Pinned footer — THE one filled blue pill on the screen */}
        <div className="flex items-center justify-end gap-3 flex-shrink-0" style={{ padding: "12px 18px", borderTop: `1px solid ${HAIRLINE}` }}>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="text-[13px] font-semibold rounded-full px-3 py-1.5 transition-colors hover:bg-slate-100"
            style={{ color: SUBINK }}
            data-testid="button-color-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={() =>
              onSave({
                name: name.trim(),
                swatchHex: hex,
                swatchImageUrl: photoUrl,
              })
            }
            className="inline-flex items-center h-8 rounded-full text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            style={{ backgroundColor: BLUE, paddingLeft: 18, paddingRight: 18 }}
            data-testid="button-save-color"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : edit ? "Save" : "Save color"}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── "+ More types" popover — add a color group ──────────────────────
export function MoreTypesPopover({ onAdd, adding }: { onAdd: (name: string) => void; adding: boolean }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const submit = () => {
    if (!name.trim()) return;
    onAdd(name.trim());
    setName("");
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="button-more-types"
          className="flex items-center gap-1.5 text-[12.5px] font-semibold rounded-full px-3 h-8 transition-colors"
          style={{ color: BLUE, marginTop: 10 }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f0f7fc")}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
        >
          <Plus className="w-3.5 h-3.5" />
          More types
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={10}
        className="w-80 p-0 rounded-2xl overflow-hidden"
        style={{
          border: `1px solid ${HAIRLINE}`,
          backgroundColor: "var(--apple-frost, rgba(255,255,255,0.82))",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          boxShadow: "0 20px 48px rgba(0,0,0,0.16)",
        }}
        data-testid="popover-more-types"
      >
        <div style={{ padding: 18 }}>
          <div className="text-[15px] font-semibold" style={{ color: INK }}>
            New pressing type
          </div>
          <p className="text-[12.5px]" style={{ color: SUBINK, marginTop: 2, lineHeight: 1.4 }}>
            Add a color group you press that isn&rsquo;t listed.
          </p>
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 6 }}>
            <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: SUBINK }}>
              Type name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="e.g. Picture disc"
              className="text-[13.5px] bg-white focus:outline-none focus:border-slate-400 transition-colors"
              style={{ height: 40, border: `1px solid ${HAIRLINE}`, borderRadius: 10, padding: "0 12px", color: INK }}
              data-testid="input-type-name"
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-1" style={{ padding: "12px 18px", borderTop: `1px solid ${HAIRLINE}` }}>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-[13px] font-semibold rounded-full px-3 py-1.5 transition-colors hover:bg-slate-100"
            style={{ color: SUBINK }}
            data-testid="button-type-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!name.trim() || adding}
            className="text-[13px] font-semibold rounded-full px-3 py-1.5 transition-colors hover:bg-slate-100 disabled:opacity-40"
            style={{ color: BLUE }}
            data-testid="button-type-add"
          >
            Add
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Catalog search popover ──────────────────────────────────────────
type CatalogEntry = { color: CatalogColor; tierId: string; tierName: string; format: string };

function CatalogSearchPopover({
  entries,
  selectedId,
  onPick,
  labelLogoUrl,
  labelBgColor,
}: {
  entries: CatalogEntry[];
  selectedId: string;
  onPick: (e: CatalogEntry) => void;
  labelLogoUrl: string | null;
  labelBgColor: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      ({ color, tierName }) => color.name.toLowerCase().includes(q) || tierName.toLowerCase().includes(q),
    );
  }, [entries, query]);

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Search catalog colors"
          data-testid="button-catalog-search"
          className="inline-flex items-center justify-center rounded-full flex-shrink-0 bg-white transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
          style={{ width: 34, height: 34, color: SUBINK, border: `1px solid ${HAIRLINE}` }}
        >
          <Search className="w-4 h-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={10}
        avoidCollisions
        collisionPadding={16}
        className="w-[480px] max-w-[calc(100vw-32px)] p-0 rounded-2xl overflow-hidden flex flex-col"
        style={{
          border: `1px solid ${HAIRLINE}`,
          backgroundColor: "var(--apple-frost, rgba(255,255,255,0.85))",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          boxShadow: "0 24px 56px rgba(0,0,0,0.18)",
          maxHeight: "min(560px, calc(100vh - 32px), var(--radix-popover-content-available-height))",
        }}
        data-testid="popover-catalog-search"
      >
        <div className="flex-shrink-0" style={{ padding: "14px 18px", borderBottom: `1px solid ${HAIRLINE}` }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: SUBINK }}>
              Colors in your catalog
            </span>
            <span className="text-[12px] tabular-nums" style={{ color: FAINT }}>
              {entries.length}
            </span>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: FAINT }} />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full h-8 pl-9 pr-8 rounded-full text-[12.5px] bg-white placeholder:text-slate-400 focus:outline-none focus:border-slate-400 transition-colors"
              style={{ border: `1px solid ${HAIRLINE}`, color: INK }}
              placeholder="Find a color…"
              data-testid="input-catalog-search"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                data-testid="button-catalog-clear"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 inline-flex items-center justify-center rounded-full transition-colors hover:bg-slate-100"
                style={{ width: 18, height: 18, color: SUBINK }}
              >
                <X className="w-3 h-3" strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          {filtered.length === 0 ? (
            <div style={{ padding: 18 }}>
              <p className="text-[12.5px]" style={{ color: FAINT }}>
                No colors match.
              </p>
            </div>
          ) : (
            <ul>
              {filtered.map((entry) => {
                const on = entry.color.id === selectedId;
                return (
                  <li key={`${entry.tierId}-${entry.color.id}`}>
                    <button
                      type="button"
                      onClick={() => {
                        onPick(entry);
                        setQuery("");
                        setOpen(false);
                      }}
                      data-testid={`catalog-item-${entry.color.id}`}
                      className={cn("w-full flex items-center gap-3 text-left transition-colors hover:bg-slate-50 focus:outline-none", on && "bg-sky-50")}
                      style={{ padding: "11px 18px", borderBottom: `1px solid ${HAIRLINE}` }}
                    >
                      <VinylDisc size={40} color={entry.color} labelLogoUrl={labelLogoUrl} labelBgColor={labelBgColor} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-semibold truncate" style={{ color: on ? BLUE : INK }}>
                          {entry.color.name}
                        </div>
                        <div className="text-[11.5px]" style={{ color: SUBINK }}>
                          {entry.tierName} · {formatLabel(entry.format)}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Page ────────────────────────────────────────────────────────────
export function PressVinylColors({
  pressId,
  labelLogoUrl,
  labelBgColor,
  pressName,
  onBack,
}: {
  pressId: string;
  labelLogoUrl: string | null;
  labelBgColor: string | null;
  pressName: string;
  onBack: () => void;
}) {
  const { toast } = useToast();
  const catalogKey = [`/api/admin/manufacturers/${pressId}/catalog`];
  const { data: catalog, isLoading } = useQuery<Catalog>({ queryKey: catalogKey });
  const canEdit = catalog?.canEdit !== false;

  // Vinyl formats only (7"/10"/12"), unhidden first; the format chips give the
  // real model's format context (the reference's per-swatch size chips don't
  // exist per-color — groups are format-scoped).
  const vinylFormats = useMemo(
    () => (catalog?.formats ?? []).filter((f) => isVinylFormat(f.format) && !f.hidden),
    [catalog],
  );
  const [formatId, setFormatId] = useState<string | null>(null);
  const activeFormat = useMemo(() => {
    const want = formatId ?? "12_lp";
    return vinylFormats.find((f) => f.format === want) ?? vinylFormats[0] ?? null;
  }, [vinylFormats, formatId]);

  const tiers = activeFormat?.tiers ?? [];
  const [tierId, setTierId] = useState<string | null>(null);
  const activeTier = useMemo(() => tiers.find((t) => t.id === tierId) ?? tiers[0] ?? null, [tiers, tierId]);

  const [colorId, setColorId] = useState<string | null>(null);
  const activeColor = useMemo(
    () => activeTier?.colors.find((c) => c.id === colorId) ?? activeTier?.colors[0] ?? null,
    [activeTier, colorId],
  );

  const catalogList: CatalogEntry[] = useMemo(
    () =>
      vinylFormats.flatMap((f) =>
        f.tiers.flatMap((t) => t.colors.map((color) => ({ color, tierId: t.id, tierName: t.name, format: f.format }))),
      ),
    [vinylFormats],
  );

  const invalidate = () => queryClient.invalidateQueries({ queryKey: catalogKey });
  const onErr = (err: any) =>
    toast({ title: "Couldn't save", description: err?.message ?? "Try again.", variant: "destructive" });

  const addColor = useMutation({
    mutationFn: async (v: { name: string; swatchHex: string | null; swatchImageUrl: string | null }) => {
      if (!activeTier) throw new Error("Pick a type first.");
      const r = await apiRequest("POST", `/api/admin/manufacturers/${pressId}/catalog/tiers/${activeTier.id}/colors`, v);
      return r.json();
    },
    onSuccess: (row: any) => {
      invalidate();
      if (row?.id) setColorId(row.id);
      setAddOpen(false);
    },
    onError: onErr,
  });

  const patchColor = useMutation({
    mutationFn: async (v: { id: string; name: string; swatchHex: string | null; swatchImageUrl: string | null }) => {
      const { id, ...body } = v;
      const r = await apiRequest("PATCH", `/api/admin/manufacturers/${pressId}/catalog/colors/${id}`, body);
      return r.json();
    },
    onSuccess: () => {
      invalidate();
      setEditOpenId(null);
    },
    onError: onErr,
  });

  const removeColor = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/manufacturers/${pressId}/catalog/colors/${id}`);
    },
    onSuccess: () => invalidate(),
    onError: onErr,
  });

  const addTier = useMutation({
    mutationFn: async (name: string) => {
      if (!activeFormat) throw new Error("No vinyl format enabled yet.");
      const r = await apiRequest("POST", `/api/admin/manufacturers/${pressId}/catalog/formats/${activeFormat.format}/tiers`, { name });
      return r.json();
    },
    onSuccess: () => invalidate(),
    onError: onErr,
  });

  const [addOpen, setAddOpen] = useState(false);
  const [editOpenId, setEditOpenId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: BLUE }} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full" style={{ maxWidth: 1240, paddingBottom: 96 }} data-testid="press-vinyl-colors">
      {/* Quiet opening header */}
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: FAINT }}>
          <button type="button" onClick={onBack} className="uppercase tracking-wider hover:text-slate-500 transition-colors" data-testid="crumb-catalog">
            Catalog
          </button>
          <span style={{ color: FAINT }}>›</span>
          <span style={{ color: SUBINK }}>Vinyl colors</span>
        </div>
        <PageHeading lead="Add your vinyl." rest="The colors you can press." />
        <p style={{ fontSize: 16, marginTop: 10, maxWidth: 560, color: SUBINK }}>
          Pick a type, then pick or add a color. Artists choose from these when they design a record with {pressName}.
        </p>
      </div>

      {vinylFormats.length === 0 ? (
        <p className="text-[13.5px]" style={{ marginTop: 32, color: SUBINK }}>
          No vinyl formats are enabled yet — turn one on in your catalog first.
        </p>
      ) : (
        <div
          className="grid items-start"
          style={{ marginTop: 40, gridTemplateColumns: "minmax(0, 1fr) minmax(0, 520px)", gap: 56 }}
        >
          {/* LEFT — the calm disc stage (sticky) */}
          <div className="sticky hidden lg:block" style={{ top: 88 }}>
            <div className="flex flex-col items-center">
              <DiscStage color={activeColor} labelLogoUrl={labelLogoUrl} labelBgColor={labelBgColor} />
              {activeColor && (
                <div className="flex items-center justify-center gap-2 text-[13px]" style={{ marginTop: 28, color: SUBINK }}>
                  <ColorBall color={activeColor} size={16} />
                  <span className="font-semibold" style={{ color: INK }}>
                    {activeColor.name}
                  </span>
                  <span style={{ color: FAINT }}>·</span>
                  <span>{activeTier?.name}</span>
                </div>
              )}
              <p className="text-[12px] text-center" style={{ marginTop: 6, color: FAINT }}>
                {activeFormat ? `Presses as ${formatLabel(activeFormat.format)}` : ""}
              </p>
              <p className="text-[12px] text-center tabular-nums" style={{ marginTop: 14, color: FAINT }}>
                {catalogList.length} {catalogList.length === 1 ? "color" : "colors"} in your catalog
              </p>
            </div>
          </div>

          {/* RIGHT — pick a type → pick or add a color */}
          <div className="min-w-0 flex flex-col" style={{ gap: 48 }}>
            <section>
              <div className="flex items-start justify-between gap-3">
                <StepHeading lead="Pick a type." rest="What kind of vinyl?" />
                <div className="flex items-center gap-2.5 flex-shrink-0">
                  <span className="text-[12px] tabular-nums" style={{ color: FAINT }}>
                    {catalogList.length} colors
                  </span>
                  <CatalogSearchPopover
                    entries={catalogList}
                    selectedId={activeColor?.id ?? ""}
                    onPick={(e) => {
                      setFormatId(e.format);
                      setTierId(e.tierId);
                      setColorId(e.color.id);
                    }}
                    labelLogoUrl={labelLogoUrl}
                    labelBgColor={labelBgColor}
                  />
                </div>
              </div>

              {/* Format context chips (real model: color groups are per-format) */}
              {vinylFormats.length > 1 && (
                <div className="flex items-center gap-2" style={{ marginTop: 14 }}>
                  {vinylFormats.map((f) => {
                    const on = f.format === activeFormat?.format;
                    return (
                      <button
                        key={f.format}
                        type="button"
                        onClick={() => {
                          setFormatId(f.format);
                          setTierId(null);
                          setColorId(null);
                        }}
                        aria-pressed={on}
                        data-testid={`format-${f.format}`}
                        className="rounded-full transition-colors focus:outline-none tabular-nums bg-white"
                        style={{
                          padding: "6px 14px",
                          fontSize: 12.5,
                          fontWeight: 600,
                          color: on ? "#fff" : INK,
                          backgroundColor: on ? BLUE : undefined,
                          border: on ? `1px solid ${BLUE}` : `1px solid ${HAIRLINE}`,
                        }}
                      >
                        {formatLabel(f.format)}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="grid" style={{ marginTop: 18, gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
                {tiers.map((t) => {
                  const on = t.id === activeTier?.id;
                  const preview = t.colors[0] ?? null;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setTierId(t.id);
                        setColorId(t.colors[0]?.id ?? null);
                      }}
                      aria-pressed={on}
                      data-testid={`category-${t.id}`}
                      className="rounded-2xl bg-white text-left transition-all hover:-translate-y-px focus:outline-none"
                      style={{ padding: 14, border: on ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}` }}
                    >
                      <div className="flex justify-center" style={{ marginBottom: 10 }}>
                        <VinylDisc size={90} color={preview} labelLogoUrl={labelLogoUrl} labelBgColor={labelBgColor} />
                      </div>
                      <div className="text-[13.5px] font-semibold leading-tight" style={{ color: on ? BLUE : INK }}>
                        {t.name}
                      </div>
                      <div className="text-[11.5px]" style={{ marginTop: 2, color: FAINT }}>
                        {t.colors.length} {t.colors.length === 1 ? "color" : "colors"}
                      </div>
                    </button>
                  );
                })}
              </div>
              {canEdit && (
                <div style={{ marginTop: 14 }}>
                  <MoreTypesPopover onAdd={(name) => addTier.mutate(name)} adding={addTier.isPending} />
                </div>
              )}
            </section>

            {activeTier && (
              <section>
                <StepHeading lead="Pick a color." rest={canEdit ? "Or add a new one." : "Your catalog."} />
                <p className="text-[12.5px]" style={{ marginTop: 10, color: SUBINK }}>
                  <span className="font-semibold" style={{ color: INK }}>
                    {activeTier.name}
                  </span>{" "}
                  · {activeTier.colors.length} {activeTier.colors.length === 1 ? "color" : "colors"}
                </p>
                <div className="grid" style={{ marginTop: 16, gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
                  {activeTier.colors.map((c) => {
                    const on = c.id === activeColor?.id;
                    return (
                      <div key={c.id} className="group relative">
                        <button
                          type="button"
                          onClick={() => setColorId(c.id)}
                          aria-pressed={on}
                          data-testid={`swatch-${c.id}`}
                          className="w-full rounded-2xl bg-white flex flex-col items-center gap-2 transition-all hover:-translate-y-px focus:outline-none"
                          style={{ padding: 12, minHeight: 108, border: on ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}` }}
                        >
                          <span className="relative">
                            <ColorBall color={c} size={40} />
                            {on && <Check className="absolute inset-0 m-auto w-4 h-4 text-white drop-shadow" strokeWidth={3} />}
                          </span>
                          <span className="text-[11.5px] font-semibold text-center leading-tight" style={{ color: on ? BLUE : INK }}>
                            {c.name}
                          </span>
                        </button>
                        {canEdit && (
                          <div
                            className="absolute opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
                            style={{ top: 8, right: 8 }}
                          >
                            <SwatchEditorPopover
                              edit={c}
                              open={editOpenId === c.id}
                              onOpenChange={(v) => setEditOpenId(v ? c.id : null)}
                              saving={patchColor.isPending}
                              onSave={(v) => patchColor.mutate({ id: c.id, ...v })}
                              onRemove={() => removeColor.mutate(c.id)}
                              labelLogoUrl={labelLogoUrl}
                              labelBgColor={labelBgColor}
                              trigger={
                                <button
                                  type="button"
                                  onClick={(e) => e.stopPropagation()}
                                  aria-label={`Edit ${c.name}`}
                                  data-testid={`swatch-menu-${c.id}`}
                                  className="inline-flex items-center justify-center rounded-full transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                                  style={{
                                    width: 26,
                                    height: 26,
                                    backgroundColor: "var(--apple-frost, rgba(255,255,255,0.88))",
                                    backdropFilter: "blur(8px)",
                                    WebkitBackdropFilter: "blur(8px)",
                                    border: `1px solid ${HAIRLINE}`,
                                    boxShadow: "0 1px 3px rgba(0,0,0,0.10)",
                                    color: SUBINK,
                                  }}
                                >
                                  <MoreHorizontal className="w-4 h-4" />
                                </button>
                              }
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {canEdit && (
                    <SwatchEditorPopover
                      open={addOpen}
                      onOpenChange={setAddOpen}
                      saving={addColor.isPending}
                      onSave={(v) => addColor.mutate(v)}
                      labelLogoUrl={labelLogoUrl}
                      labelBgColor={labelBgColor}
                      trigger={
                        <button
                          type="button"
                          data-testid="tile-add-color"
                          className="rounded-2xl flex flex-col items-center justify-center gap-2 transition-colors hover:bg-slate-50 focus:outline-none bg-white"
                          style={{ padding: 12, minHeight: 108, border: `1px dashed var(--apple-faint)` }}
                        >
                          <span
                            className="inline-flex items-center justify-center rounded-full border"
                            style={{ width: 30, height: 30, borderColor: BLUE, color: BLUE }}
                          >
                            <Plus className="w-4 h-4" strokeWidth={2.5} />
                          </span>
                          <span className="text-[11.5px] font-semibold" style={{ color: SUBINK }}>
                            Add color
                          </span>
                        </button>
                      }
                    />
                  )}
                </div>
              </section>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default PressVinylColors;
