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
import { Store, Loader2 } from "lucide-react";
import { DashboardTabs } from "@/components/partner/dashboard-controls";
import { PartnerDashboard } from "@/components/partner/PartnerDashboard";

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
      <main className="min-h-screen bg-[color:var(--brand-bg)] flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-[color:var(--brand-blue)] animate-spin" />
      </main>
    );
  }

  if (!user?.isAdmin) {
    return (
      <main className="min-h-screen bg-[color:var(--brand-bg)] text-white flex items-center justify-center p-8">
        <p className="text-white/60 text-sm">Sign in to your vendor account first.</p>
      </main>
    );
  }

  // Super-admins viewing /vendor can either inspect a specific scope
  // (via ?scopeId=…&scopeKind=vendor|manufacturer|fulfillment, which
  // the partner-dashboard endpoint honors for super_admin only) or fall
  // back to the admin vendors index if no scope is pinned.
  const search = useSearch();
  if (meRole?.role === "super_admin") {
    const sp = new URLSearchParams(search);
    const sid = sp.get("scopeId");
    const skRaw = sp.get("scopeKind");
    const sk = skRaw === "manufacturer" || skRaw === "fulfillment" ? skRaw : "vendor";
    if (sid) return <VendorBody vendorId={sid} role={sk} superAdminScopeKind={sk} />;
    return <Redirect to="/admin/vendors" />;
  }

  const isVendorRole = meRole?.role === "vendor" || meRole?.role === "manufacturer" || meRole?.role === "fulfillment";
  if (!isVendorRole || !meRole?.roleScopeId) {
    return (
      <main className="min-h-screen bg-[color:var(--brand-bg)] text-white flex items-center justify-center p-8">
        <div className="text-center space-y-2">
          <p className="text-white/85 text-sm font-semibold">This account isn't linked to a vendor.</p>
          <p className="text-white/55 text-xs">Ask GoodTunes to send a fresh vendor invite.</p>
        </div>
      </main>
    );
  }

  return <VendorBody vendorId={meRole.roleScopeId} role={meRole.role} />;
}

function VendorBody({ vendorId, role, superAdminScopeKind }: { vendorId: string; role: string; superAdminScopeKind?: "vendor" | "manufacturer" | "fulfillment" }) {
  const [tab, setTab] = useState<VendorTabId>("dashboard");
  // GoodDeed Services is vendor-only server-side (gateVendorAccess in
  // server/routes.ts admits role==='vendor' only). For manufacturer +
  // fulfillment users the dashboard is still useful, but we hide the
  // Services tab they'd get a 403 from rather than expose a tab that
  // fails on click.
  const canSeeServices = role === "vendor";
  const tabs = canSeeServices
    ? ([{ id: "dashboard", label: "Dashboard" }, { id: "services", label: "GoodDeed Services" }] as const)
    : ([{ id: "dashboard", label: "Dashboard" }] as const);
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
    <main className="min-h-screen bg-[color:var(--brand-bg)] text-white pb-20">
      <header className="border-b border-white/10 bg-gradient-to-b from-[color:var(--brand-header-gradient-top)] to-[color:var(--brand-bg)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex items-center gap-4" data-testid="vendor-portal-header">
            <div className="w-14 h-14 rounded-2xl bg-white/5 ring-1 ring-white/15 overflow-hidden flex items-center justify-center">
              {vendor?.logoUrl ? (
                <img src={vendor.logoUrl} alt="" className="w-full h-full object-cover" data-testid="img-vendor-logo" />
              ) : (
                <Store className="w-5 h-5 text-white/45" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-white/55 text-[12px] uppercase tracking-wider font-semibold">{portalLabel}</p>
              <h1 className="text-2xl sm:text-3xl font-bold truncate" data-testid="heading-vendor-name">
                {vendor?.name ?? "Your dashboard"}
              </h1>
            </div>
          </div>
        </div>
      </header>

      <DashboardTabs tabs={tabs} value={tab} onChange={setTab} />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 mt-6">
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
          <div className="bg-white text-slate-900 rounded-2xl p-4 sm:p-6 ring-1 ring-white/10" data-testid="vendor-services-panel">
            <GoodDeedServicesTab vendorId={vendorId} />
          </div>
        )}
      </div>
    </main>
  );
}
