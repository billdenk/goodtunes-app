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
import { PressVinylComponent } from "./PressVinylComponent";
import { PressLabelsComponent } from "./PressLabelsComponent";
import { PressStickersComponent } from "./PressStickersComponent";
import { PressJacketsComponent } from "./PressJacketsComponent";
import { PressInnerSleevesComponent } from "./PressInnerSleevesComponent";
import { PressInsertsComponent } from "./PressInsertsComponent";
import { PressComponentPricing } from "./PressComponentPricing";
import { PressGoodDeedPricingComponent } from "./PressGoodDeedPricingComponent";
import { createSerialSaver } from "./saveQueue";
import { Loader2 } from "lucide-react";
import { useMemo, useRef } from "react";

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
  if (isLoading || !data) return <LoadingRow />;
  return (
    <PressVinylComponent
      payload={data}
      canEdit={data.canEdit}
      save={(config: VinylComponentConfig) => save.mutate(config)}
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
