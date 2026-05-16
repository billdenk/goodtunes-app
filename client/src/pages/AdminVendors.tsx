import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search, X, Store } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { AdminFrame } from "@/components/admin/AdminFrame";

/**
 * Admin home · Vendors (Phase 6e).
 *
 * Each vendor is one real-world shop (Carter Vintage, Reverb,
 * Sweetwater, …). Editing here propagates to every instrument
 * attachment via the join table — that's the whole point of the
 * separate entity.
 *
 * Grid card: logo (or Store icon fallback), name, domain, tagline.
 * Click → per-vendor detail page (Overview · Logo · Cover · Instruments).
 * New vendor still goes through classic admin — easier paste-a-URL UX.
 */
interface VendorLite {
  id: string;
  name: string;
  domain: string;
  logoUrl: string | null;
  tagline: string | null;
}

export function AdminVendors() {
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.body.classList.add("gt-admin");
    return () => {
      document.body.classList.remove("gt-admin");
    };
  }, []);

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  const { data: vendors = [], isLoading } = useQuery<VendorLite[]>({
    queryKey: ["/api/vendors"],
    enabled: !!user?.isAdmin,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = q
      ? vendors.filter(
          (v) =>
            v.name.toLowerCase().includes(q) ||
            v.domain.toLowerCase().includes(q) ||
            (v.tagline ?? "").toLowerCase().includes(q),
        )
      : vendors.slice();
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return rows;
  }, [vendors, search]);

  const openVendor = (id: string) => navigate(`/admin/vendors/${id}`);

  const openNewVendor = () => {
    try {
      localStorage.setItem("gt:admin:entity", "vendors");
      localStorage.setItem("gt:admin:new", "vendor");
    } catch {}
    navigate("/admin");
  };

  if (authLoading) {
    return (
      <AdminFrame active="vendors">
        <div className="py-20 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-[#319ED8] border-t-transparent rounded-full animate-spin" />
        </div>
      </AdminFrame>
    );
  }

  if (!user?.isAdmin) {
    return (
      <AdminFrame active="vendors">
        <div className="py-20 text-center text-slate-500">
          You need to be signed in as an admin to view this page.
        </div>
      </AdminFrame>
    );
  }

  return (
    <AdminFrame active="vendors">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1
            className="text-slate-900 text-2xl font-bold tracking-tight"
            data-testid="text-page-title"
          >
            Vendors
          </h1>
          <p className="text-slate-500 text-[13px] mt-0.5">
            One row per real-world shop. Edit here once and it
            propagates everywhere that vendor is attached.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {searchOpen ? (
            <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-md px-2.5 h-9">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search vendors"
                className="w-44 text-[13px] bg-transparent outline-none placeholder:text-slate-400"
                data-testid="input-search-vendors"
              />
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setSearchOpen(false);
                }}
                className="text-slate-400 hover:text-slate-700"
                aria-label="Close search"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="h-9 w-9 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 inline-flex items-center justify-center transition-colors"
              aria-label="Search"
              data-testid="button-open-search"
            >
              <Search className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={openNewVendor}
            className="h-9 px-3 rounded-md bg-[#319ED8] text-white text-[12.5px] font-semibold hover:bg-[#2890c8] inline-flex items-center gap-1.5"
            data-testid="button-new-vendor"
          >
            <Plus className="w-4 h-4" />
            New vendor
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="py-20 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-[#319ED8] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState searching={search.trim().length > 0} />
      ) : (
        <div
          className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
          data-testid="grid-vendors"
        >
          {filtered.map((v) => (
            <VendorCard
              key={v.id}
              vendor={v}
              onOpen={() => openVendor(v.id)}
            />
          ))}
        </div>
      )}
    </AdminFrame>
  );
}

function VendorCard({
  vendor,
  onOpen,
}: {
  vendor: VendorLite;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group text-left rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md hover:border-[#319ED8]/30 transition-all p-4 flex items-center gap-3.5"
      data-testid={`card-vendor-${vendor.id}`}
    >
      <div className="w-14 h-14 rounded-xl overflow-hidden bg-slate-50 ring-1 ring-slate-200 flex items-center justify-center flex-shrink-0">
        {vendor.logoUrl ? (
          <img
            src={vendor.logoUrl}
            alt={vendor.name}
            className="w-full h-full object-contain p-1.5"
          />
        ) : (
          <Store className="w-6 h-6 text-slate-300" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div
          className="text-slate-900 text-[14px] font-semibold leading-tight truncate"
          data-testid={`text-vendor-name-${vendor.id}`}
        >
          {vendor.name}
        </div>
        <div className="text-slate-400 text-[11.5px] truncate mt-0.5">
          {vendor.domain}
        </div>
        {vendor.tagline && (
          <div className="text-slate-500 text-[12px] line-clamp-1 mt-0.5">
            {vendor.tagline}
          </div>
        )}
      </div>
    </button>
  );
}

function EmptyState({ searching }: { searching: boolean }) {
  return (
    <div
      className="py-16 flex flex-col items-center justify-center text-center"
      data-testid="empty-vendors"
    >
      <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
        <Store className="w-6 h-6" />
      </div>
      <p className="text-slate-700 text-[14px] font-semibold">
        {searching ? "No vendors match that search" : "No vendors yet"}
      </p>
      <p className="text-slate-400 text-[12.5px] mt-1 max-w-xs">
        {searching
          ? "Try a different name or domain."
          : "Add a shop the first time you attach one of their products to an instrument."}
      </p>
    </div>
  );
}
