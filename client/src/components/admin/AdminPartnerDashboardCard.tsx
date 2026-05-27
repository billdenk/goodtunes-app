import { PartnerDashboard, type PartnerScopeKind } from "@/components/partner/PartnerDashboard";

/**
 * Task #590 — Lifts the partner-portal `PartnerDashboard` primitive
 * into a navy card so it reads as a contained surface inside the
 * light admin shell. The primitive itself bakes in dark surfaces
 * (white/* text, white/[0.04] panels) for the partner shell; instead
 * of forking it, we host it in a brand-bg panel here. Same component,
 * both shells, no divergence.
 */
export function AdminPartnerDashboardCard({
  scope,
  title,
  subtitle,
  scopeIdQs,
  scopeKindQs,
}: {
  scope: PartnerScopeKind;
  title: string;
  subtitle?: string;
  scopeIdQs?: string | null;
  scopeKindQs?: "vendor" | "manufacturer" | "fulfillment" | null;
}) {
  return (
    <div
      className="rounded-2xl bg-[color:var(--brand-bg)] text-white p-4 sm:p-6 ring-1 ring-black/5"
      data-testid={`admin-dashboard-card-${scope}`}
    >
      <PartnerDashboard
        scope={scope}
        title={title}
        subtitle={subtitle}
        scopeIdQs={scopeIdQs}
        scopeKindQs={scopeKindQs}
      />
    </div>
  );
}
