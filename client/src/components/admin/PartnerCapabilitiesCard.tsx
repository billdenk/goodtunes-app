import { type LucideIcon, Disc3, BadgeCheck, Truck } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

// Task #2129 — one shared capabilities card used by BOTH the operator
// surface (AdminManufacturer) and the partner's own portal (PressPortal).
// The only differences are voice (second-person for the partner, third-
// person for the operator) and who's allowed to flip the switches. The
// switch-row layout (icon + label + blurb left, Apple-style Switch right)
// replaces the old tap-the-tile ON/OFF pills.

export interface CapabilityDef {
  key: string;
  label: string;
  icon: LucideIcon;
  /** Operator (third-person) description. */
  blurb: string;
  /** Partner (second-person) description. Falls back to `blurb`. */
  partnerBlurb?: string;
}

// Press capabilities — Vinyl / GoodDeeds / Fulfillment. A single press can
// serve all three and shows up in every matching list automatically. The
// last remaining capability can't be turned off (mirrors the DB CHECK + the
// at-least-one API guard).
export const PRESS_CAPABILITIES: CapabilityDef[] = [
  {
    key: "doesVinyl",
    label: "Vinyl",
    icon: Disc3,
    blurb: "Presses records — appears on the Presses tab + RFQ broadcast.",
    partnerBlurb: "You press records — you'll appear when artists need vinyl.",
  },
  {
    key: "doesGoodDeed",
    label: "GoodDeeds",
    icon: BadgeCheck,
    blurb: "Prints & finishes GoodDeed certificates.",
    partnerBlurb: "You print & finish GoodDeed certificates.",
  },
  {
    key: "doesFulfillment",
    label: "Fulfillment",
    icon: Truck,
    blurb: "Warehouses & ships finished units — appears in the Fulfillment nav.",
    partnerBlurb: "You warehouse & ship finished units.",
  },
];

interface Props {
  viewer: "operator" | "partner";
  capabilities: CapabilityDef[];
  values: Record<string, boolean | null | undefined>;
  /** Toggle handler — only called once the at-least-one guard passes. */
  onToggle: (key: string, next: boolean) => void;
  /** When false, switches render disabled (Staff teammates). */
  canEdit?: boolean;
  saving?: boolean;
  /** Noun for the at-least-one guard toast ("capability", "service"). */
  guardNoun?: string;
  testId?: string;
}

export function PartnerCapabilitiesCard({
  viewer,
  capabilities,
  values,
  onToggle,
  canEdit = true,
  saving = false,
  guardNoun = "service",
  testId = "card-press-capabilities",
}: Props) {
  const { toast } = useToast();
  const isPartner = viewer === "partner";
  const activeCount = capabilities.filter((c) => Boolean(values[c.key])).length;

  const title = isPartner ? "Your services" : "Capabilities";
  const subtitle = isPartner
    ? "Choose what you offer. Turn a service off and you'll stop appearing in those requests — keep at least one on."
    : "What this partner does. One partner can serve all three and shows up in every matching list.";

  function handle(key: string) {
    const isOn = Boolean(values[key]);
    if (isOn && activeCount <= 1) {
      toast({
        title: `Keep at least one ${guardNoun} on`,
        description: isPartner
          ? "You need to offer Vinyl, GoodDeeds, or Fulfillment to stay listed."
          : "A press must do Vinyl, GoodDeeds, or Fulfillment.",
        variant: "destructive",
      });
      return;
    }
    onToggle(key, !isOn);
  }

  return (
    <div
      className="mb-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
      data-testid={testId}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-slate-900 text-sm font-semibold">{title}</h3>
          <p className="text-slate-500 text-xs mt-0.5">{subtitle}</p>
        </div>
        {saving && (
          <span className="text-slate-400 text-xs font-medium shrink-0" data-testid="text-capabilities-saving">
            Saving…
          </span>
        )}
      </div>

      {isPartner && !canEdit && (
        <p className="text-xs text-amber-700 mt-3" data-testid="text-capabilities-readonly">
          You have Staff access — only an Owner/Admin can change which services you offer.
        </p>
      )}

      <div className="mt-3 divide-y divide-slate-100">
        {capabilities.map((c) => {
          const on = Boolean(values[c.key]);
          const Icon = c.icon;
          const desc = isPartner ? c.partnerBlurb ?? c.blurb : c.blurb;
          return (
            <div
              key={c.key}
              className="flex items-center justify-between gap-4 py-3"
              data-testid={`row-capability-${c.key}`}
            >
              <div className="flex items-start gap-3 min-w-0">
                <Icon
                  className={`w-4 h-4 mt-0.5 shrink-0 ${on ? "text-[var(--brand-blue)]" : "text-slate-400"}`}
                />
                <div className="min-w-0">
                  <div className={`text-sm font-semibold ${on ? "text-slate-900" : "text-slate-500"}`}>
                    {c.label}
                  </div>
                  <div className="text-xs leading-snug text-slate-500">{desc}</div>
                </div>
              </div>
              <Switch
                checked={on}
                disabled={saving || !canEdit}
                onCheckedChange={() => handle(c.key)}
                data-testid={`switch-capability-${c.key}`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
