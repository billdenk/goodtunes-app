import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Search, X, Guitar, Store, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { ErrorState } from "@/components/admin/AdminErrorBoundary";
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

/**
 * Admin home · Gear (Phase 6c).
 *
 * Mirrors AdminPeople / AdminAlbums: AdminFrame chrome + search +
 * grid of cards. Each instrument has its photo, name, short category,
 * and a small vendor count chip (the connective tissue to
 * SuperCredits™ Micro-Sponsorships — see roadmap).
 *
 * Click → opens the per-instrument detail page (next phase). Today the
 * detail page also defers full vendor editing to the classic admin —
 * same staged-migration cadence Albums + People used.
 */
interface InstrumentLite {
  id: string;
  name: string;
  category: string;
  shortCategory: string | null;
  photoUrl: string | null;
  vendors: unknown[];
  // Task #174 — null when no Maker is set. Drives the "Unassigned
  // maker" filter chip and the inline warning glyph in list-mode.
  makerVendorId?: string | null;
}

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

export function AdminInstruments() {
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  // Task #174 — operator cleanup filter for the post-backfill state.
  // The maker-name → instrument-name match catches "Gibson Les Paul"
  // but not "Custom Shop '59 Reissue", so a handful of rows always
  // need a hand-pick. This toggle narrows the grid to only those
  // unassigned rows so the operator can sweep them in one sitting.
  const [onlyUnassignedMaker, setOnlyUnassignedMaker] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  // Entity token stays "instruments" to match the rest of the file's
  // testids (`grid-instruments`, `card-instrument-…`, `row-instrument-…`)
  // even though the user-facing label is "Gear". One source of truth.
  const [view, setView] = useViewMode("instruments");

  useEffect(() => {
    document.body.classList.add("gt-admin");
    return () => {
      document.body.classList.remove("gt-admin");
    };
  }, []);

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  const {
    data: instruments = [],
    isLoading,
    isError: instrumentsError,
    error: instrumentsErrorObj,
    refetch: refetchInstruments,
  } = useQuery<InstrumentLite[]>({
    queryKey: ["/api/instruments"],
    enabled: !!user?.isAdmin,
  });

  const unassignedMakerCount = useMemo(
    () => instruments.filter((i) => !i.makerVendorId).length,
    [instruments],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = q
      ? instruments.filter(
          (i) =>
            i.name.toLowerCase().includes(q) ||
            i.category.toLowerCase().includes(q),
        )
      : instruments.slice();
    if (onlyUnassignedMaker) {
      rows = rows.filter((i) => !i.makerVendorId);
    }
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return rows;
  }, [instruments, search, onlyUnassignedMaker]);

  const openInstrument = (id: string) => {
    navigate(`/admin/instruments/${id}`);
  };

  const queryClient = useQueryClient();
  const { toast } = useToast();
  // "Add Gear" opens a paste-URL dialog (restored 2026-05). Pulling the
  // product page first lets the server scraper prefill name / category /
  // photo and attach the vendor in one shot — the workflow Bill remembers
  // from the legacy /admin Gear tab. "Skip" still creates a blank "New gear"
  // for hand-entry cases where there's no public product URL.
  const [addOpen, setAddOpen] = useState(false);
  const [pasteUrl, setPasteUrl] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);

  const createInstrument = useMutation({
    mutationFn: async (opts: { url?: string }) => {
      let name = "New gear";
      let category = "Guitar";
      let photoUrl: string | null = null;
      let about: string | null = null;
      let scraped: any = null;
      let vendorAttached = false;
      const trimmedUrl = (opts.url ?? "").trim();
      if (trimmedUrl) {
        const sr = await apiRequest("POST", "/api/admin/instruments/scrape", {
          url: trimmedUrl,
        });
        scraped = await sr.json();
        if (scraped?.name) name = String(scraped.name);
        if (scraped?.category) category = String(scraped.category);
        if (scraped?.photoUrl) photoUrl = String(scraped.photoUrl);
        if (scraped?.description) about = String(scraped.description);
      }
      const res = await apiRequest("POST", "/api/admin/instruments", {
        name,
        category,
        ...(photoUrl ? { photoUrl } : {}),
        ...(about ? { about } : {}),
        // Task #461 — remember the page the operator pasted. Drives the
        // fan "View original listing" link + the admin "Refetch image"
        // recovery for missing photos.
        ...(trimmedUrl ? { sourceUrl: trimmedUrl } : {}),
      });
      const instrument = (await res.json()) as { id: string };
      if (trimmedUrl && scraped?.vendor?.affiliateUrl) {
        try {
          await apiRequest(
            "POST",
            `/api/admin/instruments/${instrument.id}/vendors`,
            {
              affiliateUrl: scraped.vendor.affiliateUrl,
              ...(scraped.vendor.name ? { name: scraped.vendor.name } : {}),
              ...(scraped.vendor.logoUrl
                ? { logoUrl: scraped.vendor.logoUrl }
                : {}),
              ...(scraped.vendor.aboutUrl
                ? { aboutUrl: scraped.vendor.aboutUrl }
                : {}),
            },
          );
          vendorAttached = true;
        } catch (err) {
          // Vendor attach failing shouldn't block the new gear row from
          // opening — the operator can re-attach on the detail page. We
          // surface the partial-success state in the toast below so the
          // operator isn't told the vendor was attached when it wasn't.
          console.error("[add-gear] vendor attach failed", err);
        }
      }
      return { instrument, scraped, vendorAttached };
    },
    onSuccess: ({ instrument, scraped, vendorAttached }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/instruments"] });
      setAddOpen(false);
      setPasteUrl("");
      setPasteError(null);
      if (scraped?.name) {
        const hasVendor = !!scraped.vendor?.affiliateUrl;
        if (hasVendor && !vendorAttached) {
          toast({
            title: `Pulled "${scraped.name}"`,
            description:
              "Vendor link didn't attach automatically — add it from the detail page.",
            variant: "destructive",
          });
        } else {
          toast({
            title: `Pulled "${scraped.name}"`,
            description:
              vendorAttached && scraped.vendor?.name
                ? `Vendor: ${scraped.vendor.name}. Review and edit on the detail page.`
                : "Review and edit on the detail page.",
          });
        }
      }
      navigate(`/admin/instruments/${instrument.id}`);
    },
    onError: (err: any) => {
      setPasteError(humanizeApiError(err));
    },
  });

  const openNewInstrument = () => {
    if (createInstrument.isPending) return;
    setPasteError(null);
    setPasteUrl("");
    setAddOpen(true);
  };

  const submitPaste = () => {
    if (createInstrument.isPending) return;
    const u = pasteUrl.trim();
    if (!u) {
      setPasteError("Paste a product URL, or click Skip to create a blank entry.");
      return;
    }
    if (!/^https?:\/\//i.test(u)) {
      setPasteError("URL must start with http:// or https://");
      return;
    }
    setPasteError(null);
    createInstrument.mutate({ url: u });
  };

  const skipPaste = () => {
    if (createInstrument.isPending) return;
    setPasteError(null);
    createInstrument.mutate({});
  };

  if (authLoading) {
    return (
      <AdminFrame active="gear">
        <div className="py-20 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-[var(--brand-blue)] border-t-transparent rounded-full animate-spin" />
        </div>
      </AdminFrame>
    );
  }

  if (!user?.isAdmin) {
    return (
      <AdminFrame active="gear">
        <div className="py-20 text-center text-slate-500">
          You need to be signed in as an admin to view this page.
        </div>
      </AdminFrame>
    );
  }

  return (
    <AdminFrame active="gear">
      <div className="space-y-5">
      <AdminPageHeader
        title="Gear"
        subtitle="Gear + per-gear vendor links — the SuperCredits™ Micro-Sponsorship surface."
        actions={(<>
          {searchOpen ? (
            <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-md px-2.5 h-9">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search gear"
                className="w-44 text-[13px] bg-transparent outline-none placeholder:text-slate-400"
                data-testid="input-search-instruments"
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
          {/* Task #174 — unassigned-maker filter. Hidden when the
              catalog is fully classified so the header doesn't carry
              dead UI; surfaces as a small pill while any rows still
              need a Maker pick. */}
          {unassignedMakerCount > 0 && (
            <button
              type="button"
              onClick={() => setOnlyUnassignedMaker((v) => !v)}
              aria-pressed={onlyUnassignedMaker}
              className={[
                "h-9 inline-flex items-center gap-1.5 rounded-md border px-2.5 text-[12.5px] font-medium transition-colors",
                onlyUnassignedMaker
                  ? "bg-amber-50 border-amber-300 text-amber-800"
                  : "bg-white border-slate-300 text-slate-600 hover:bg-slate-50",
              ].join(" ")}
              data-testid="button-filter-unassigned-maker"
              title="Show only gear without a Maker assigned"
            >
              <Guitar className="w-3.5 h-3.5" />
              {onlyUnassignedMaker ? "Unassigned only" : "Unassigned maker"}
              <span
                className={[
                  "rounded-full px-1.5 py-0.5 text-[10.5px] leading-none font-semibold tabular-nums",
                  onlyUnassignedMaker
                    ? "bg-amber-200 text-amber-900"
                    : "bg-slate-100 text-slate-600",
                ].join(" ")}
              >
                {unassignedMakerCount}
              </span>
            </button>
          )}
          <ViewModeToggle
            value={view}
            onChange={setView}
            testIdPrefix="view-mode-instruments"
          />
          {/* Matches AdminPeople's "Add Person": denser px-2.5/py-1.5 chrome,
              white-outline button so the Gear index reads as the same admin
              surface family rather than a louder blue CTA. */}
          <AddEntityButton
            label="Add Gear"
            onClick={openNewInstrument}
            disabled={createInstrument.isPending}
            testId="button-new-instrument"
          />
        </>)}
      />

      {/* Grid */}
      {isLoading ? (
        <div className="py-20 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-[var(--brand-blue)] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : instrumentsError ? (
        <ErrorState
          error={instrumentsErrorObj}
          onRetry={() => refetchInstruments()}
          title="Couldn't load gear"
          testId="admin-instruments-error"
        />
      ) : filtered.length === 0 ? (
        <EmptyState searching={search.trim().length > 0} />
      ) : view === "grid" ? (
        <div
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-4 gap-y-6"
          data-testid="grid-instruments"
        >
          {filtered.map((i) => (
            <InstrumentCard
              key={i.id}
              instrument={i}
              onOpen={() => openInstrument(i.id)}
            />
          ))}
        </div>
      ) : (
        <div
          className="rounded-lg border border-slate-200 bg-white overflow-hidden divide-y divide-slate-100"
          data-testid="list-instruments"
        >
          {filtered.map((i) => (
            <InstrumentRow
              key={i.id}
              instrument={i}
              onOpen={() => openInstrument(i.id)}
            />
          ))}
        </div>
      )}
      </div>
      <Dialog
        open={addOpen}
        onOpenChange={(o) => {
          if (createInstrument.isPending) return;
          setAddOpen(o);
          if (!o) {
            setPasteUrl("");
            setPasteError(null);
          }
        }}
      >
        <DialogContent
          className="max-w-md bg-white rounded-xl border-slate-200 shadow-xl p-6 gap-4"
          data-testid="dialog-add-gear"
        >
          <DialogHeader className="text-left space-y-1">
            <DialogTitle className="text-[17px] font-semibold text-slate-900">
              Add gear
            </DialogTitle>
            <DialogDescription className="text-[13px] text-slate-500 leading-relaxed">
              Paste a product URL — Carter Vintage, Reverb, Gibson, Martin,
              Sweetwater, etc. We'll prefill name, category, photo, and attach
              the vendor.
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
              placeholder="https://…"
              autoFocus
              disabled={createInstrument.isPending}
              className="w-full h-10 px-3 rounded-md border border-slate-300 bg-white text-[13.5px] outline-none focus:border-[var(--brand-blue)] focus:ring-2 focus:ring-[var(--brand-blue)]/20 disabled:opacity-50"
              data-testid="input-add-gear-url"
            />
            {pasteError && (
              <p
                className="text-[12px] text-red-600"
                data-testid="text-add-gear-error"
              >
                {pasteError}
              </p>
            )}
            <p className="text-[11.5px] text-slate-400">
              Reads the page's Open Graph + product metadata and rehosts the
              hero image. Most modern shops work without an account.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <button
              type="button"
              onClick={skipPaste}
              disabled={createInstrument.isPending}
              className="px-3 py-1.5 rounded-md text-[12.5px] font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              data-testid="button-add-gear-skip"
            >
              Skip — create blank
            </button>
            <Button
              type="button"
              onClick={submitPaste}
              disabled={createInstrument.isPending || !pasteUrl.trim()}
              size="sm"
              className="text-[12.5px] font-semibold"
              data-testid="button-add-gear-pull"
            >
              {createInstrument.isPending && (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              )}
              {createInstrument.isPending ? "Reading…" : "Pull from URL"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminFrame>
  );
}

function InstrumentCard({
  instrument,
  onOpen,
}: {
  instrument: InstrumentLite;
  onOpen: () => void;
}) {
  const vendorCount = instrument.vendors?.length ?? 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group text-left flex flex-col"
      data-testid={`card-instrument-${instrument.id}`}
    >
      <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-slate-100 ring-1 ring-slate-200 shadow-sm group-hover:shadow-md group-hover:ring-[var(--brand-blue)]/30 transition-all">
        {instrument.photoUrl ? (
          <img
            src={instrument.photoUrl}
            alt={instrument.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-300">
            <Guitar className="w-10 h-10" />
          </div>
        )}
        {vendorCount > 0 && (
          <div
            className="absolute top-2 right-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-white/90 backdrop-blur-sm text-slate-700 text-[10.5px] font-bold shadow"
            data-testid={`badge-vendor-count-${instrument.id}`}
          >
            <Store className="w-3 h-3" />
            {vendorCount}
          </div>
        )}
      </div>
      <div
        className="mt-2 text-slate-900 text-[13px] font-semibold leading-snug line-clamp-2"
        data-testid={`text-instrument-name-${instrument.id}`}
      >
        {instrument.name}
      </div>
      <div className="text-slate-400 text-[11.5px] truncate">
        {instrument.shortCategory || instrument.category}
      </div>
    </button>
  );
}

function InstrumentRow({
  instrument,
  onOpen,
}: {
  instrument: InstrumentLite;
  onOpen: () => void;
}) {
  const vendorCount = instrument.vendors?.length ?? 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group w-full text-left flex items-center gap-3 px-3 py-2 hover:bg-slate-50 transition-colors"
      data-testid={`row-instrument-${instrument.id}`}
    >
      <div className="w-12 h-12 rounded-md overflow-hidden bg-slate-100 ring-1 ring-slate-200 flex items-center justify-center flex-shrink-0">
        {instrument.photoUrl ? (
          <img
            src={instrument.photoUrl}
            alt={instrument.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <Guitar className="w-5 h-5 text-slate-300" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div
          className="text-slate-900 text-[13.5px] font-semibold truncate group-hover:text-[var(--brand-blue)] transition-colors"
          data-testid={`text-instrument-name-${instrument.id}`}
        >
          {instrument.name}
        </div>
        <div className="text-slate-500 text-[12px] truncate">
          {instrument.shortCategory || instrument.category}
        </div>
      </div>
      {vendorCount > 0 && (
        <div
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10.5px] font-bold flex-shrink-0"
          data-testid={`badge-vendor-count-${instrument.id}`}
        >
          <Store className="w-3 h-3" />
          {vendorCount}
        </div>
      )}
    </button>
  );
}

function EmptyState({ searching }: { searching: boolean }) {
  return (
    <div
      className="py-16 flex flex-col items-center justify-center text-center"
      data-testid="empty-instruments"
    >
      <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
        <Guitar className="w-6 h-6" />
      </div>
      <p className="text-slate-700 text-[14px] font-semibold">
        {searching ? "No gear matches that search" : "No gear yet"}
      </p>
      <p className="text-slate-400 text-[12.5px] mt-1 max-w-xs">
        {searching
          ? "Try a different name or category."
          : "Add a guitar, amp, mic, or anything else artists play on — each can carry its own vendor links."}
      </p>
    </div>
  );
}
