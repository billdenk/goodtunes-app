import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Search, X, Store, Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  ViewModeToggle,
  useViewMode,
} from "@/components/admin/ViewModeToggle";
import { AddEntityButton } from "@/components/admin/AddEntityButton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// apiRequest throws errors shaped like `"502: {\"message\":\"…\"}"` — strip
// the status prefix and unwrap the JSON `message` so inline dialog errors
// read like English instead of like a stack trace.
function humanizeApiError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  if (!raw) {
    return "Couldn't read that page. Try the URL again, or Skip to create a blank entry.";
  }
  const m = raw.match(/^\d{3}:\s*(.*)$/);
  const body = m ? m[1] : raw;
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed.message === "string" && parsed.message.trim()) {
      return parsed.message;
    }
  } catch {
    /* not JSON — fall through */
  }
  return body.trim() || raw;
}

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
  const [view, setView] = useViewMode("vendors");
  const { toast } = useToast();

  // "Add Vendor" opens a paste-URL dialog — paste the vendor's home or
  // About page and the server scraper prefills name / domain / logo /
  // cover / bio. Mirrors AdminInstruments. "Skip" still creates a blank
  // placeholder so hand-entry isn't blocked.
  const [addOpen, setAddOpen] = useState(false);
  const [pasteUrl, setPasteUrl] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);

  const createVendor = useMutation({
    mutationFn: async (opts: { url?: string }) => {
      let payload: Record<string, unknown> = {
        name: "New vendor",
        domain: `new-vendor-${Date.now()}.example`,
      };
      let scrapedName: string | null = null;
      const trimmedUrl = (opts.url ?? "").trim();
      if (trimmedUrl) {
        const sr = await apiRequest("POST", "/api/admin/vendors/scrape", {
          url: trimmedUrl,
        });
        const scraped = (await sr.json()) as {
          name: string | null;
          domain: string | null;
          homeUrl: string | null;
          aboutUrl: string | null;
          logoUrl: string | null;
          coverUrl: string | null;
          bio: string | null;
          tagline: string | null;
        };
        scrapedName = scraped.name;
        payload = {
          name: scraped.name || "New vendor",
          // Fall back to a unique placeholder so the unique-domain
          // constraint never blocks the create when scrape returns null.
          domain: scraped.domain || `new-vendor-${Date.now()}.example`,
          ...(scraped.homeUrl ? { homeUrl: scraped.homeUrl } : {}),
          ...(scraped.aboutUrl ? { aboutUrl: scraped.aboutUrl } : {}),
          ...(scraped.logoUrl ? { logoUrl: scraped.logoUrl } : {}),
          ...(scraped.coverUrl ? { coverUrl: scraped.coverUrl } : {}),
          ...(scraped.bio ? { bio: scraped.bio } : {}),
          ...(scraped.tagline ? { tagline: scraped.tagline } : {}),
        };
      }
      const res = await apiRequest("POST", "/api/admin/vendors", payload);
      const vendor = (await res.json()) as VendorLite;
      return { vendor, scrapedName };
    },
    onSuccess: ({ vendor, scrapedName }) => {
      queryClient.setQueryData<VendorLite[]>(["/api/vendors"], (old) =>
        old ? (old.some((x) => x.id === vendor.id) ? old : [...old, vendor]) : [vendor],
      );
      queryClient.invalidateQueries({ queryKey: ["/api/vendors"] });
      setAddOpen(false);
      setPasteUrl("");
      setPasteError(null);
      if (scrapedName) {
        toast({
          title: `Pulled "${scrapedName}"`,
          description: "Review and edit on the detail page.",
        });
      }
      navigate(`/admin/vendors/${vendor.id}`);
    },
    onError: (err: any) => {
      setPasteError(humanizeApiError(err));
    },
  });

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
    if (createVendor.isPending) return;
    setPasteError(null);
    setPasteUrl("");
    setAddOpen(true);
  };

  const submitPaste = () => {
    if (createVendor.isPending) return;
    const u = pasteUrl.trim();
    if (!u) {
      setPasteError("Paste a vendor URL, or click Skip to create a blank entry.");
      return;
    }
    if (!/^https?:\/\//i.test(u)) {
      setPasteError("URL must start with http:// or https://");
      return;
    }
    setPasteError(null);
    createVendor.mutate({ url: u });
  };

  const skipPaste = () => {
    if (createVendor.isPending) return;
    setPasteError(null);
    createVendor.mutate({});
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
      <div className="space-y-5">
      <AdminPageHeader
        title="Vendors"
        subtitle="One row per real-world shop. Edit here once and it propagates everywhere that vendor is attached."
        actions={(<>
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
          <ViewModeToggle
            value={view}
            onChange={setView}
            testIdPrefix="view-mode-vendors"
          />
          <AddEntityButton
            label="Add Vendor"
            onClick={openNewVendor}
            disabled={createVendor.isPending}
            testId="button-new-vendor"
          />
        </>)}
      />

      {isLoading ? (
        <div className="py-20 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-[#319ED8] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState searching={search.trim().length > 0} />
      ) : view === "grid" ? (
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
      ) : (
        <div
          className="rounded-lg border border-slate-200 bg-white overflow-hidden divide-y divide-slate-100"
          data-testid="list-vendors"
        >
          {filtered.map((v) => (
            <VendorRow
              key={v.id}
              vendor={v}
              onOpen={() => openVendor(v.id)}
            />
          ))}
        </div>
      )}
      </div>
      <Dialog
        open={addOpen}
        onOpenChange={(o) => {
          if (createVendor.isPending) return;
          setAddOpen(o);
          if (!o) {
            setPasteUrl("");
            setPasteError(null);
          }
        }}
      >
        <DialogContent
          className="max-w-md bg-white rounded-xl border-slate-200 shadow-xl p-6 gap-4"
          data-testid="dialog-add-vendor"
        >
          <DialogHeader className="text-left space-y-1">
            <DialogTitle className="text-[17px] font-semibold text-slate-900">
              Add vendor
            </DialogTitle>
            <DialogDescription className="text-[13px] text-slate-500 leading-relaxed">
              Paste a URL from the vendor's site — the About page works best,
              but the home page is fine too. We'll prefill name, domain, logo,
              cover, and bio.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 pt-1">
            <input
              type="url"
              value={pasteUrl}
              onChange={(e) => {
                setPasteUrl(e.target.value);
                if (pasteError) setPasteError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitPaste();
                }
              }}
              placeholder="https://…/about"
              autoFocus
              disabled={createVendor.isPending}
              className="w-full h-10 px-3 rounded-md border border-slate-300 bg-white text-[13.5px] outline-none focus:border-[#319ED8] focus:ring-2 focus:ring-[#319ED8]/20 disabled:opacity-50"
              data-testid="input-add-vendor-url"
            />
            {pasteError && (
              <p
                className="text-[12px] text-red-600"
                data-testid="text-add-vendor-error"
              >
                {pasteError}
              </p>
            )}
            <p className="text-[11.5px] text-slate-400">
              Reads the page's Open Graph metadata and rehosts the logo + cover
              image. Instagram and Facebook pages aren't supported — paste the
              vendor's own website instead.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <button
              type="button"
              onClick={skipPaste}
              disabled={createVendor.isPending}
              className="px-3 py-1.5 rounded-md text-[12.5px] font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              data-testid="button-add-vendor-skip"
            >
              Skip — create blank
            </button>
            <Button
              type="button"
              onClick={submitPaste}
              disabled={createVendor.isPending || !pasteUrl.trim()}
              size="sm"
              className="text-[12.5px] font-semibold"
              data-testid="button-add-vendor-pull"
            >
              {createVendor.isPending && (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              )}
              {createVendor.isPending ? "Reading…" : "Pull from URL"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
      <div className="w-14 h-14 rounded-xl overflow-hidden bg-white ring-1 ring-slate-200 flex items-center justify-center flex-shrink-0">
        {vendor.logoUrl ? (
          <img
            src={vendor.logoUrl}
            alt={vendor.name}
            className="w-full h-full object-cover"
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

function VendorRow({
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
      className="group w-full text-left flex items-center gap-3 px-3 py-2 hover:bg-slate-50 transition-colors"
      data-testid={`row-vendor-${vendor.id}`}
    >
      <div className="w-10 h-10 rounded-md overflow-hidden bg-white ring-1 ring-slate-200 flex items-center justify-center flex-shrink-0">
        {vendor.logoUrl ? (
          <img
            src={vendor.logoUrl}
            alt={vendor.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <Store className="w-4 h-4 text-slate-300" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div
          className="text-slate-900 text-[13.5px] font-semibold truncate group-hover:text-[#319ED8] transition-colors"
          data-testid={`text-vendor-name-${vendor.id}`}
        >
          {vendor.name}
        </div>
        <div className="text-slate-400 text-[11.5px] truncate">
          {vendor.domain}
        </div>
      </div>
      {vendor.tagline && (
        <div className="text-slate-500 text-[12px] truncate flex-shrink-0 max-w-[40%] hidden md:block">
          {vendor.tagline}
        </div>
      )}
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
