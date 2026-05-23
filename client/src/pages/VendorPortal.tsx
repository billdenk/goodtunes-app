// Task #245 — Vendor-scoped GoodDeed pricing portal.
//
// A printer / holographer / press partner lands here after sign-in.
// Their `role=vendor` + `role_scope_id=<vendorId>` is read off
// /api/me/role and used to fetch their own vendor row + pricing.
// Page chrome is intentionally light — one card per leg, same edit
// surface a super-admin sees in /admin/vendors/:id → GoodDeed Services.

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Link, Redirect } from "wouter";
import { GoodDeedServicesTab } from "@/components/admin/GoodDeedServicesTab";
import { Store } from "lucide-react";

interface MeRole {
  role: string;
  roleScopeId: string | null;
}

export function VendorPortal() {
  const { user, isLoading: authLoading } = useAuth();
  const { data: meRole, isLoading: roleLoading } = useQuery<MeRole>({
    queryKey: ["/api/me/role"],
    enabled: !!user?.isAdmin,
  });

  if (authLoading || roleLoading) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[var(--brand-blue)] border-t-transparent rounded-full animate-spin" />
      </main>
    );
  }

  if (!user?.isAdmin) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-8">
        <p className="text-slate-500 text-sm">Sign in to your vendor account first.</p>
      </main>
    );
  }

  // Super-admins viewing /vendor bounce to the admin vendors index —
  // they shouldn't be locked to a single vendor page.
  if (meRole?.role === "super_admin") return <Redirect to="/admin/vendors" />;

  if (meRole?.role !== "vendor" || !meRole.roleScopeId) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-8">
        <div className="text-center space-y-2">
          <p className="text-slate-700 text-sm font-semibold">This account isn't linked to a vendor.</p>
          <p className="text-slate-500 text-xs">Ask GoodTunes to send a fresh vendor invite.</p>
        </div>
      </main>
    );
  }

  return <VendorBody vendorId={meRole.roleScopeId} />;
}

function VendorBody({ vendorId }: { vendorId: string }) {
  const { data } = useQuery<{ vendor: { id: string; name: string; logoUrl: string | null } }>({
    queryKey: ["/api/admin/vendors", vendorId, "gooddeed-services"],
  });
  const vendor = data?.vendor;

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-5 py-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-slate-100 ring-1 ring-slate-200 overflow-hidden flex items-center justify-center">
            {vendor?.logoUrl ? (
              <img src={vendor.logoUrl} alt="" className="w-full h-full object-cover" data-testid="img-vendor-logo" />
            ) : (
              <Store className="w-5 h-5 text-slate-400" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Vendor portal</div>
            <h1 className="text-slate-900 text-xl font-bold truncate" data-testid="heading-vendor-name">
              {vendor?.name ?? "Loading…"}
            </h1>
          </div>
          <Link href="/api/logout" className="text-[12px] text-slate-500 hover:text-slate-900">
            Sign out
          </Link>
        </div>
      </header>
      <div className="max-w-3xl mx-auto px-5 py-6">
        <GoodDeedServicesTab vendorId={vendorId} />
      </div>
    </main>
  );
}
