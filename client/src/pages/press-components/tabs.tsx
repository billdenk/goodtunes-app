// Press Components — thin tab containers for the press portal. Each wrapper
// owns the shared query + the save mutation for its component and renders
// the ported handoff screen as a pure component. Screen prop contract
// (authored against this exactly — trust it):
//   { payload, canEdit, save: (config) => void, saving: boolean }
import {
  usePressComponents,
  useSavePressComponent,
  useGoodDeedPrinting,
  useSaveGoodDeedPrinting,
  type PressComponentsPayload,
  type GoodDeedPrintingConfig,
} from "./usePressComponents";
import type {
  VinylComponentConfig,
  LabelsComponentConfig,
  StickersComponentConfig,
  PricingComponentConfig,
  JacketsComponentConfig,
  SleevesComponentConfig,
  InsertsComponentConfig,
} from "@shared/pressComponents";
import { PressVinylStylesComponent } from "./PressVinylStyles";
import { PressLabelsComponent } from "./PressLabelsComponent";
import { PressStickersComponent } from "./PressStickersComponent";
import { PressJacketsComponent } from "./PressJacketsComponent";
import { PressInnerSleevesComponent } from "./PressInnerSleevesComponent";
import { PressInsertsComponent } from "./PressInsertsComponent";
import { PressComponentPricing } from "./PressComponentPricing";
import { PressGoodDeedPricingComponent } from "./PressGoodDeedPricingComponent";
import { createSerialSaver } from "./saveQueue";
import { CdCatalogBody, CassetteCatalogBody, type MediaCatalogData } from "@/pages/PressMediaCatalog";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useAdminDark } from "@/lib/adminAppearance";

function LoadingRow() {
  return (
    <div className="flex items-center gap-2 py-16 justify-center text-sm text-muted-foreground" data-testid="components-loading">
      <Loader2 className="w-4 h-4 animate-spin" /> Loading…
    </div>
  );
}

export function PressVinylComponentTab({ pressId }: { pressId: string }) {
  const { data, isLoading } = usePressComponents(pressId);
  const save = useSavePressComponent(pressId, "vinyl");
  // Serialize + coalesce whole-config PUTs (same as Stickers/Pricing) so a
  // slow earlier save can never complete after — and overwrite — a newer one.
  const saveRef = useRef(save);
  saveRef.current = save;
  const serialVinylSave = useMemo(
    () => createSerialSaver<VinylComponentConfig>((config) => saveRef.current.mutateAsync(config)),
    [pressId],
  );
  if (isLoading || !data) return <LoadingRow />;
  return (
    <PressVinylStylesComponent
      payload={data}
      canEdit={data.canEdit}
      save={serialVinylSave}
      saving={save.isPending}
    />
  );
}

export function PressLabelsComponentTab({ pressId }: { pressId: string }) {
  const { data, isLoading } = usePressComponents(pressId);
  const save = useSavePressComponent(pressId, "labels");
  if (isLoading || !data) return <LoadingRow />;
  return (
    <PressLabelsComponent
      payload={data}
      canEdit={data.canEdit}
      save={(config: LabelsComponentConfig) => save.mutate(config)}
      saving={save.isPending}
    />
  );
}

export function PressStickersComponentTab({ pressId }: { pressId: string }) {
  const { data, isLoading } = usePressComponents(pressId);
  const save = useSavePressComponent(pressId, "stickers");
  // Serialize + coalesce whole-config PUTs (same as Pricing below) so a slow
  // earlier save can never complete after — and overwrite — a newer one:
  // rapid offered toggles or a toggle racing a template attach both stick.
  const saveRef = useRef(save);
  saveRef.current = save;
  const serialStickerSave = useMemo(
    () => createSerialSaver<StickersComponentConfig>((config) => saveRef.current.mutateAsync(config)),
    [pressId],
  );
  if (isLoading || !data) return <LoadingRow />;
  return (
    <PressStickersComponent
      payload={data}
      canEdit={data.canEdit}
      save={serialStickerSave}
      saving={save.isPending}
    />
  );
}

export function PressJacketsComponentTab({ pressId }: { pressId: string }) {
  const { data, isLoading } = usePressComponents(pressId);
  const save = useSavePressComponent(pressId, "jackets");
  // Serialize + coalesce whole-config PUTs (same as Pricing) so a slow earlier
  // save can never complete after — and overwrite — a newer rapid ••• toggle.
  const saveRef = useRef(save);
  saveRef.current = save;
  const serialSave = useMemo(
    () => createSerialSaver<JacketsComponentConfig>((config) => saveRef.current.mutateAsync(config)),
    [pressId],
  );
  if (isLoading || !data) return <LoadingRow />;
  return (
    <PressJacketsComponent
      payload={data}
      canEdit={data.canEdit}
      save={serialSave}
      saving={save.isPending}
    />
  );
}
export function PressComponentPricingTab({ pressId }: { pressId: string }) {
  const { data, isLoading } = usePressComponents(pressId);
  const save = useSavePressComponent(pressId, "pricing");
  // Serialize + coalesce whole-config PUTs so a slow earlier save can never
  // complete after (and overwrite) a newer one — two rapid blurs both stick.
  const saveRef = useRef(save);
  saveRef.current = save;
  const serialSave = useMemo(
    () => createSerialSaver<PricingComponentConfig>((config) => saveRef.current.mutateAsync(config)),
    [pressId],
  );
  if (isLoading || !data) return <LoadingRow />;
  return (
    <PressComponentPricing
      payload={data}
      canEdit={data.canEdit}
      save={serialSave}
      saving={save.isPending}
    />
  );
}

// GoodDeed Certificates ladder (Ruby handoff) — the ladder rides its own
// gooddeed_printing_json store, but canEdit comes off the shared components
// payload (pressUserCanEdit, same gate as every other components surface).
export function PressGoodDeedPricingTab({ pressId }: { pressId: string }) {
  const { data: components, isLoading: componentsLoading } = usePressComponents(pressId);
  const { data: ladder, isLoading: ladderLoading } = useGoodDeedPrinting(pressId);
  const save = useSaveGoodDeedPrinting(pressId);
  // Serialize + coalesce whole-ladder PUTs (same as Pricing) so a slow
  // earlier save can never complete after — and overwrite — a newer one.
  const saveRef = useRef(save);
  saveRef.current = save;
  const serialSave = useMemo(
    () => createSerialSaver<GoodDeedPrintingConfig>((config) => saveRef.current.mutateAsync(config)),
    [pressId],
  );
  if (componentsLoading || ladderLoading || !components || !ladder) return <LoadingRow />;
  return (
    <PressGoodDeedPricingComponent
      payload={ladder}
      canEdit={components.canEdit}
      save={serialSave}
      saving={save.isPending}
    />
  );
}

export type { PressComponentsPayload };

export function PressInsertsComponentTab({ pressId }: { pressId: string }) {
  const { data, isLoading } = usePressComponents(pressId);
  const save = useSavePressComponent(pressId, "inserts");
  // Serialize + coalesce whole-config PUTs (same as Pricing) so a slow earlier
  // save can never complete after — and overwrite — a newer rapid ••• toggle.
  const saveRef = useRef(save);
  saveRef.current = save;
  const serialSave = useMemo(
    () => createSerialSaver<InsertsComponentConfig>((config) => saveRef.current.mutateAsync(config)),
    [pressId],
  );
  if (isLoading || !data) return <LoadingRow />;
  return (
    <PressInsertsComponent
      payload={data}
      canEdit={data.canEdit}
      save={serialSave}
      saving={save.isPending}
    />
  );
}

export function PressInnerSleevesComponentTab({ pressId }: { pressId: string }) {
  const { data, isLoading } = usePressComponents(pressId);
  const save = useSavePressComponent(pressId, "sleeves");
  // Serialize + coalesce whole-config PUTs (same as Pricing) so a slow earlier
  // save can never complete after — and overwrite — a newer rapid ••• toggle.
  const saveRef = useRef(save);
  saveRef.current = save;
  const serialSave = useMemo(
    () => createSerialSaver<SleevesComponentConfig>((config) => saveRef.current.mutateAsync(config)),
    [pressId],
  );
  if (isLoading || !data) return <LoadingRow />;
  return (
    <PressInnerSleevesComponent
      payload={data}
      canEdit={data.canEdit}
      save={serialSave}
      saving={save.isPending}
    />
  );
}

// ─── Format-first Components (Ruby handoff PRESS_NAV, Aug 19 2026) ─────────
// Formats are the rail items; the per-component pages (Jackets, Inner
// Sleeves, Center Labels, Inserts, Stickers) live as an in-page segmented
// control on the Vinyl page. Legacy ?tab=comp-jackets|… deep links land here
// with the matching segment pre-selected. The segment mirrors into ?comp=
// (portal tab-in-URL rule) so feedback links deep-link the right sub-page.

const VINYL_SEGMENTS = [
  { id: "vinyl", label: "Vinyl" },
  { id: "labels", label: "Center Labels" },
  { id: "jackets", label: "Jackets" },
  { id: "sleeves", label: "Inner Sleeves" },
  { id: "inserts", label: "Inserts" },
  { id: "stickers", label: "Stickers" },
] as const;
type VinylSegmentId = (typeof VINYL_SEGMENTS)[number]["id"];

function readCompParam(): VinylSegmentId | null {
  const sp = new URLSearchParams(window.location.search);
  const raw = sp.get("comp");
  if (VINYL_SEGMENTS.some((s) => s.id === raw)) return raw as VinylSegmentId;
  // Legacy ?tab=comp-jackets|… deep link, read before the nav hook's
  // canonicalizing replaceState has landed (mount-order safety).
  const legacy = (sp.get("tab") ?? "").replace(/^comp-/, "");
  return VINYL_SEGMENTS.some((s) => s.id === legacy && legacy !== "vinyl") ? (legacy as VinylSegmentId) : null;
}

function writeCompParam(next: VinylSegmentId) {
  const url = new URL(window.location.href);
  if (next === "vinyl") url.searchParams.delete("comp");
  else url.searchParams.set("comp", next);
  window.history.replaceState(window.history.state, "", url.toString());
}

export function PressVinylFormatTab({ pressId, initial }: { pressId: string; initial?: VinylSegmentId }) {
  const dark = useAdminDark();
  // Segmented-control tokens (mirrors PressTemplatesIndex's format switcher).
  const segTheme = dark
    ? { track: "rgba(255,255,255,0.06)", ink: "#f5f5f7", faint: "rgba(245,245,247,0.55)", pillActive: "rgba(255,255,255,0.12)", segShadow: "0 1px 2px rgba(0,0,0,0.4)" }
    : { track: "#eef1f4", ink: "#0f172a", faint: "#64748b", pillActive: "#ffffff", segShadow: "0 1px 2px rgba(15,23,42,0.10)" };
  const [seg, setSeg] = useState<VinylSegmentId>(() => readCompParam() ?? initial ?? "vinyl");
  // Per Bill (2026-08-10, catalog media pills) — switching segments must never
  // reset a sub-page's build state: visited panels stay mounted and toggle
  // visibility.
  const [visited, setVisited] = useState<Record<string, boolean>>(() => ({ [seg]: true }));
  const switchSeg = (next: VinylSegmentId) => {
    if (next === seg) return;
    setVisited((v) => ({ ...v, [next]: true }));
    setSeg(next);
    writeCompParam(next);
  };
  return (
    <div className="min-w-0" data-testid="press-vinyl-format-tab">
      {/* ONE segmented control (Templates' Vinyl/CD/Cassette device) — chrome
          only; the per-segment pages are untouched. The wrapper mirrors the
          component bodies' content column (mx-auto, maxWidth 1240, 40px inset)
          so the control's left edge lines up with the breadcrumb/heading at
          every width (gogoods, Aug 21 2026); overflow-x-auto keeps narrow
          panes from scrolling the whole page. */}
      <div className="mx-auto w-full overflow-x-auto" style={{ maxWidth: 1240, paddingLeft: 40, paddingRight: 40 }}>
      <div
        className="inline-flex items-center rounded-full flex-shrink-0 mb-5"
        style={{ padding: 3, backgroundColor: segTheme.track }}
        role="tablist"
        aria-label="Vinyl components"
      >
        {VINYL_SEGMENTS.map((s) => {
          const active = s.id === seg;
          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => switchSeg(s.id)}
              data-testid={`vinyl-segment-${s.id}`}
              className="rounded-full transition-colors"
              style={{
                padding: "6px 18px",
                fontSize: 13.5,
                fontWeight: active ? 600 : 500,
                color: active ? segTheme.ink : segTheme.faint,
                backgroundColor: active ? segTheme.pillActive : "transparent",
                boxShadow: active ? segTheme.segShadow : "none",
                cursor: "pointer",
              }}
            >
              {s.label}
            </button>
          );
        })}
      </div>
      </div>
      {visited["vinyl"] && <div hidden={seg !== "vinyl"}><PressVinylComponentTab pressId={pressId} /></div>}
      {visited["jackets"] && <div hidden={seg !== "jackets"}><PressJacketsComponentTab pressId={pressId} /></div>}
      {visited["sleeves"] && <div hidden={seg !== "sleeves"}><PressInnerSleevesComponentTab pressId={pressId} /></div>}
      {visited["labels"] && <div hidden={seg !== "labels"}><PressLabelsComponentTab pressId={pressId} /></div>}
      {visited["inserts"] && <div hidden={seg !== "inserts"}><PressInsertsComponentTab pressId={pressId} /></div>}
      {visited["stickers"] && <div hidden={seg !== "stickers"}><PressStickersComponentTab pressId={pressId} /></div>}
    </div>
  );
}

// CD / Cassette format pages — the per-press media catalog build surfaces
// (same bodies the GoodTunes-packages catalog mounts behind its media pills),
// now first-class rail destinations. A press with no catalog for the format
// gets an honest empty state, never a blank page.
function useMediaFormatCatalog(pressId: string) {
  const { data: catalogRaw, isLoading } = useQuery<
    | { canEdit?: boolean; cdCatalog?: MediaCatalogData; cassetteCatalog?: MediaCatalogData }
    | { data: { canEdit?: boolean; cdCatalog?: MediaCatalogData; cassetteCatalog?: MediaCatalogData } }
  >({
    queryKey: ["/api/admin/manufacturers", pressId, "catalog"],
    enabled: !!pressId,
  });
  const catalog = ((catalogRaw as { data?: unknown } | undefined)?.data ?? catalogRaw) as
    | { canEdit?: boolean; cdCatalog?: MediaCatalogData; cassetteCatalog?: MediaCatalogData }
    | undefined;
  const { data: pressRow } = useQuery<{ labelLogoUrl?: string | null; logoUrl?: string | null }>({
    queryKey: ["/api/manufacturers", pressId],
    enabled: !!pressId,
  });
  return {
    catalog,
    isLoading,
    canEdit: catalog?.canEdit !== false,
    logoUrl: pressRow?.labelLogoUrl ?? pressRow?.logoUrl ?? null,
  };
}

function MediaFormatEmpty({ format }: { format: "CD" | "Cassette" }) {
  return (
    <div className="py-16 text-center text-[13.5px] text-muted-foreground" data-testid={`no-${format.toLowerCase()}-catalog`}>
      No {format} catalog yet. Build one from Product Specs to offer {format === "CD" ? "discs" : "tapes"} here.
    </div>
  );
}

export function PressCdFormatTab({ pressId }: { pressId: string }) {
  const { catalog, isLoading, canEdit, logoUrl } = useMediaFormatCatalog(pressId);
  if (isLoading || !catalog) return <LoadingRow />;
  if (!catalog.cdCatalog) return <MediaFormatEmpty format="CD" />;
  return <CdCatalogBody pressId={pressId} canEdit={canEdit} logoUrl={logoUrl} data={catalog.cdCatalog} />;
}

export function PressCassetteFormatTab({ pressId }: { pressId: string }) {
  const { catalog, isLoading, canEdit, logoUrl } = useMediaFormatCatalog(pressId);
  if (isLoading || !catalog) return <LoadingRow />;
  if (!catalog.cassetteCatalog) return <MediaFormatEmpty format="Cassette" />;
  return <CassetteCatalogBody pressId={pressId} canEdit={canEdit} logoUrl={logoUrl} data={catalog.cassetteCatalog} />;
}
