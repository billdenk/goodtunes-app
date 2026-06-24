// Task #245 — Vendor-scoped GoodDeed pricing portal.
// Task #518 — wrapped in a dark partner-shell tabbed chrome whose
// leftmost tab is a scoped Dashboard powered by the shared
// `PartnerDashboard` primitive. The existing GoodDeed Services pricing
// surface sits one tab to the right and remains the operator's first
// real-work surface.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Redirect, useSearch } from "wouter";
import { GoodDeedServicesTab } from "@/components/admin/GoodDeedServicesTab";
import { Store, Loader2, LayoutDashboard, Wrench } from "lucide-react";
import { PartnerDashboard } from "@/components/partner/PartnerDashboard";
import { OperatorShell } from "@/components/operator/OperatorShell";
import { modulesForRole, type OperatorRole } from "@/components/operator/registry";
// Task #522 — manufacturer (is_maker / press) admins get the press
// portal shell instead of the legacy vendor shell.
import { PressPortal } from "./PressPortal";
// Task #2047 — GoodDeed quickprinter (is_quickprinter) vendors get a
// print-centric portal instead of the legacy GoodDeed-Services shell.
import { PrinterPortal } from "./PrinterPortal";

// Routes a vendor-role scope to either the new PrinterPortal (when the
// vendor is flagged `is_quickprinter`) or the legacy VendorBody shell
// (GoodDeed resellers/services vendors). Resolved off the vendor block
// of the gooddeed-services payload (cheap; cached by RQ), which every
// vendor scope can read.
function VendorScopeRouter({ vendorId, superAdminScopeKind }: { vendorId: string; superAdminScopeKind?: "vendor" }) {
  const { data, isLoading } = useQuery<{ vendor: { id: string; name: string; logoUrl: string | null; isQuickprinter?: boolean } }>({
    queryKey: ["/api/admin/vendors", vendorId, "gooddeed-services"],
  });
  if (isLoading) {
    return (
      <main className="min-h-screen bg-[color:var(--brand-bg)] flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-[color:var(--brand-blue)] animate-spin" />
      </main>
    );
  }
  if (data?.vendor?.isQuickprinter) {
    return <PrinterPortal vendorId={vendorId} isSuperAdminView={!!superAdminScopeKind} />;
  }
  return <VendorBody vendorId={vendorId} role="vendor" superAdminScopeKind={superAdminScopeKind} />;
}

// Routes a manufacturer-role scope to either the new PressPortal
// (when the vendor is flagged `is_maker`) or the legacy VendorBody
// shell (resellers, quick-printers). Resolved off /api/press/:id/me.
function ManufacturerScopeRouter({ pressId, isSuperAdminView }: { pressId: string; isSuperAdminView: boolean }) {
  const { data, isLoading } = useQuery<{ id: string; name: string; isMaker: boolean }>({
    queryKey: [`/api/press/${pressId}/me`],
  });
  if (isLoading) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-[color:var(--brand-blue)] animate-spin" />
      </main>
    );
  }
  if (data?.isMaker) {
    return <PressPortal pressId={pressId} isSuperAdminView={isSuperAdminView} />;
  }
  return <VendorBody vendorId={pressId} role="manufacturer" superAdminScopeKind={isSuperAdminView ? "manufacturer" : undefined} />;
}

interface MeRole {
  role: string;
  roleScopeId: string | null;
}

type VendorTabId = "dashboard" | "services";

export function VendorPortal() {
  const { user, isLoading: authLoading } = useAuth();
  const { data: meRole, isLoading: roleLoading } = useQuery<MeRole>({
    queryKey: ["/api/me/role"],
    enabled: !!user?.isAdmin,
  });

  if (authLoading || roleLoading) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-[color:var(--brand-blue)] animate-spin" />
      </main>
    );
  }

  if (!user?.isAdmin) {
    return (
      <main className="min-h-screen bg-slate-50 text-slate-900 flex items-center justify-center p-8">
        <p className="text-slate-500 text-sm">Sign in to your vendor account first.</p>
      </main>
    );
  }

  // Task #522 — the new press portal is ONLY for vendors flagged
  // `is_maker` (pressing plants like Hellbender). Resellers and quick-
  // printers stay on the legacy vendor shell below, even though both
  // are role='manufacturer'. We resolve isMaker via /api/press/:id/me
  // (cheap; cached by RQ) and only when we already know the scope.
  return <RoleRouter meRole={meRole} />;
}

function RoleRouter({ meRole }: { meRole: MeRole | null | undefined }) {
  // ?scopeId=…&scopeKind=vendor|manufacturer|fulfillment lets super-
  // admins inspect any scope; the partner-dashboard endpoint honors
  // these only for super_admin. Falls back to the vendors index if no
  // scope is pinned.
  const search = useSearch();
  if (meRole?.role === "super_admin") {
    const sp = new URLSearchParams(search);
    const sid = sp.get("scopeId");
    const skRaw = sp.get("scopeKind");
    const sk = skRaw === "manufacturer" || skRaw === "fulfillment" ? skRaw : "vendor";
    if (sid) {
      if (sk === "manufacturer") return <ManufacturerScopeRouter pressId={sid} isSuperAdminView={true} />;
      if (sk === "vendor") return <VendorScopeRouter vendorId={sid} superAdminScopeKind="vendor" />;
      return <VendorBody vendorId={sid} role={sk} superAdminScopeKind={sk} />;
    }
    return <Redirect to="/admin/vendors" />;
  }

  // manufacturer-role admins: route to PressPortal only if their press
  // is flagged `is_maker`. Resellers / quick-printers (is_maker=false)
  // stay on the legacy vendor shell since the press lifecycle (masters
  // prep, pressing-order pipeline, etc.) doesn't apply to them.
  if (meRole?.role === "manufacturer" && meRole.roleScopeId) {
    return <ManufacturerScopeRouter pressId={meRole.roleScopeId} isSuperAdminView={false} />;
  }

  const isVendorRole = meRole?.role === "vendor" || meRole?.role === "manufacturer" || meRole?.role === "fulfillment";
  if (!isVendorRole || !meRole?.roleScopeId) {
    return (
      <main className="min-h-screen bg-slate-50 text-slate-900 flex items-center justify-center p-8">
        <div className="text-center space-y-2">
          <p className="text-slate-700 text-sm font-semibold">This account isn't linked to a vendor.</p>
          <p className="text-slate-500 text-xs">Ask GoodTunes to send a fresh vendor invite.</p>
        </div>
      </main>
    );
  }

  // A plain vendor scope may be a GoodDeed quickprinter — route through
  // VendorScopeRouter, which flips to PrinterPortal when is_quickprinter.
  if (meRole.role === "vendor") {
    return <VendorScopeRouter vendorId={meRole.roleScopeId} />;
  }

  return <VendorBody vendorId={meRole.roleScopeId} role={meRole.role} />;
}

function VendorBody({ vendorId, role, superAdminScopeKind }: { vendorId: string; role: string; superAdminScopeKind?: "vendor" | "manufacturer" | "fulfillment" }) {
  const [tab, setTab] = useState<VendorTabId>("dashboard");
  // GoodDeed Services is vendor-only server-side (gateVendorAccess in
  // server/routes.ts admits role==='vendor' only). The shared module
  // registry encodes this — manufacturer + fulfillment scopes get the
  // dashboard tab only and never see Services.
  const operatorRole = (role as OperatorRole) || "vendor";
  const tabs = modulesForRole(operatorRole) as ReadonlyArray<{ id: VendorTabId; label: string }>;
  const canSeeServices = tabs.some((t) => t.id === "services");
  // Header lookup currently goes through the gooddeed-services endpoint
  // (vendor-only). For manufacturer/fulfillment we fall back to a
  // header without the logo + name lookup — the dashboard payload
  // itself carries the partner's name in its scope block.
  const { data } = useQuery<{ vendor: { id: string; name: string; logoUrl: string | null } }>({
    queryKey: ["/api/admin/vendors", vendorId, "gooddeed-services"],
    enabled: canSeeServices,
  });
  const vendor = data?.vendor;
  const portalLabel =
    role === "manufacturer" ? "Manufacturer portal" :
    role === "fulfillment" ? "Fulfillment portal" :
    "Vendor portal";

  return (
    <OperatorShell
      testId="vendor-shell"
      roleLabel={portalLabel}
      name={vendor?.name ?? "Your dashboard"}
      logoUrl={vendor?.logoUrl ?? null}
      fallbackIcon={Store}
      tabs={tabs}
      activeTab={tab}
      onTabChange={setTab}
      layout="leftnav"
      navIcons={{
        dashboard: LayoutDashboard,
        services: Wrench,
      }}
    >
      {tab === "dashboard" && (
        <PartnerDashboard
          scope="vendor"
          title={vendor?.name ?? "Your dashboard"}
          subtitle="Jobs, units, and turn-time across your GoodTunes pipeline"
          scopeIdQs={superAdminScopeKind ? vendorId : null}
          scopeKindQs={superAdminScopeKind ?? null}
        />
      )}
      {tab === "services" && (
        <div className="bg-white text-slate-900 rounded-2xl p-4 sm:p-6 ring-1 ring-slate-200" data-testid="vendor-services-panel">
          <GoodDeedServicesTab vendorId={vendorId} />
        </div>
      )}
    </OperatorShell>
  );
}
