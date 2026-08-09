import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Heart, Loader2, Search, X } from "lucide-react";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminSectionDashboard } from "@/components/admin/AdminSectionDashboard";
import { AddEntityButton } from "@/components/admin/AddEntityButton";
import { ViewModeToggle, useViewMode } from "@/components/admin/ViewModeToggle";
import { ErrorState } from "@/components/admin/AdminErrorBoundary";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";

function humanizeApiError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const m = raw.match(/^\d{3}:\s*(.*)$/);
  if (m) {
    try {
      const body = JSON.parse(m[1]);
      if (body?.message) return String(body.message);
    } catch {
      /* fall through */
    }
    return m[1];
  }
  return raw || "Something went wrong.";
}

// Task #230 — NPO directory landing page. Detail surface lives in
// AdminNonProfit. Task #283 brings this in line with the admin
// styleguide (search-toggle, ViewModeToggle, AddEntityButton, and a
// grid renderer mirroring Labels/Makers).
//
// "Add NPO" mirrors AdminVendors' paste-URL flow: scrape via the
// generic /api/admin/vendors/scrape endpoint (it's site-agnostic
// page-metadata extraction; no NPO-specific shape required).
type NonProfit = {
  id: string;
  name: string;
  logoUrl: string | null;
  websiteUrl: string | null;
};

type ScrapeResult = {
  name: string | null;
  domain: string | null;
  homeUrl: string | null;
  logoUrl: string | null;
};

function getNpoPageTab(): "dashboard" | "list" {
  const p = new URLSearchParams(window.location.search).get("tab");
  return p === "list" ? "list" : "dashboard";
}

export function AdminNonProfits() {
  useEffect(() => {
    document.body.classList.add("gt-admin");
    return () => document.body.classList.remove("gt-admin");
  }, []);
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [pageTab, setPageTabRaw] = useState<"dashboard" | "list">(getNpoPageTab);
  const setPageTab = (t: "dashboard" | "list") => {
    setPageTabRaw(t);
    const params = new URLSearchParams(window.location.search);
    params.set("tab", t);
    history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  };
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useViewMode("nonprofits");

  const {
    data: rows = [],
    isLoading,
    isError: rowsError,
    error: rowsErrorObj,
    refetch: refetchRows,
  } = useQuery<NonProfit[]>({
    queryKey: ["/api/non-profits"],
    enabled: !!user?.isAdmin,
  });

  const [addOpen, setAddOpen] = useState(false);
  const [pasteUrl, setPasteUrl] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);

  const createNpo = useMutation({
    mutationFn: async (opts: { url?: string }) => {
      let payload: Record<string, unknown> = { name: "New NPO" };
      let scrapedName: string | null = null;
      const trimmed = (opts.url ?? "").trim();
      if (trimmed) {
        const sr = await apiRequest("POST", "/api/admin/vendors/scrape", { url: trimmed });
        const scraped = (await sr.json()) as ScrapeResult;
        scrapedName = scraped.name;
        payload = {
          name: scraped.name || "New NPO",
          ...(scraped.homeUrl ? { websiteUrl: scraped.homeUrl } : {}),
          ...(scraped.logoUrl ? { logoUrl: scraped.logoUrl } : {}),
        };
      }
      const res = await apiRequest("POST", "/api/non-profits", payload);
      const npo = (await res.json()) as NonProfit;
      return { npo, scrapedName };
    },
    onSuccess: ({ npo, scrapedName }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/non-profits"] });
      setAddOpen(false);
      setPasteUrl("");
      setPasteError(null);
      if (scrapedName) {
        toast({
          title: `Pulled "${scrapedName}"`,
          description: "Review and add contacts on the detail page.",
        });
      }
      navigate(`/admin/non-profits/${npo.id}`);
    },
    onError: (err) => setPasteError(humanizeApiError(err)),
  });

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? rows.filter(
          (n) =>
            n.name.toLowerCase().includes(q) ||
            (n.websiteUrl ?? "").toLowerCase().includes(q),
        )
      : rows.slice();
    list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [rows, search]);

  const submitPaste = (e: React.FormEvent) => {
    e.preventDefault();
    if (createNpo.isPending) return;
    setPasteError(null);
    const url = pasteUrl.trim();
    if (url && !/^https?:\/\//i.test(url)) {
      setPasteError("Paste a full https:// URL.");
      return;
    }
    createNpo.mutate({ url: url || undefined });
  };

  if (authLoading) {
    return (
      <AdminFrame active="nonprofits">
        <div className="py-20 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-[var(--brand-blue)] border-t-transparent rounded-full animate-spin" />
        </div>
      </AdminFrame>
    );
  }
  if (!user?.isAdmin) {
    return (
      <AdminFrame active="nonprofits">
        <div className="py-20 text-center text-slate-500">
          You need to be signed in as an admin to view this page.
        </div>
      </AdminFrame>
    );
  }

  return (
    <AdminFrame active="nonprofits">
      <div className="space-y-5" data-testid="page-admin-nonprofits">
        <div
          className="inline-flex items-center bg-[var(--apple-track)] rounded-full p-0.5"
          role="tablist"
          data-testid="tabs-section-nonprofits"
        >
          <button
            type="button"
            onClick={() => setPageTab("dashboard")}
            aria-pressed={pageTab === "dashboard"}
            className={[
              "h-8 px-3 inline-flex items-center justify-center rounded-full text-xs font-semibold transition-colors",
              pageTab === "dashboard"
                ? "bg-white text-[var(--apple-ink)] shadow-sm"
                : "text-[var(--apple-subink)]",
            ].join(" ")}
            data-testid="tab-section-dashboard"
          >
            Dashboard
          </button>
          <button
            type="button"
            onClick={() => setPageTab("list")}
            aria-pressed={pageTab === "list"}
            className={[
              "h-8 px-3 inline-flex items-center justify-center rounded-full text-xs font-semibold transition-colors",
              pageTab === "list"
                ? "bg-white text-[var(--apple-ink)] shadow-sm"
                : "text-[var(--apple-subink)]",
            ].join(" ")}
            data-testid="tab-section-list"
          >
            NPOs
          </button>
        </div>

        {pageTab === "dashboard" && <AdminSectionDashboard section="npos" />}

        {pageTab === "list" && (<>
        <AdminPageHeader
          title="NPOs"
          subtitle="Non-profit partners. Each referrer earns $1 per paid unit attributed to them."
          actions={
            <>
              {searchOpen ? (
                <div className="flex items-center gap-1.5 bg-white border border-[var(--apple-hairline)] rounded-full px-3 h-9">
                  <Search className="w-4 h-4 text-slate-400" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search NPOs"
                    className="w-44 text-sm bg-transparent outline-none placeholder:text-slate-400"
                    data-testid="input-search-nonprofits"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setSearch("");
                      setSearchOpen(false);
                    }}
                    className="text-[var(--apple-faint)] hover:text-[var(--apple-subink)]"
                    aria-label="Close search"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setSearchOpen(true)}
                  className="h-9 w-9 rounded-full text-[var(--apple-subink)] hover:bg-[var(--apple-track)] inline-flex items-center justify-center transition-colors"
                  aria-label="Search"
                  data-testid="button-open-search"
                >
                  <Search className="w-4 h-4" />
                </button>
              )}
              <ViewModeToggle
                value={view}
                onChange={setView}
                testIdPrefix="view-mode-nonprofits"
              />
              <AddEntityButton
                label="Add NPO"
                onClick={() => {
                  setPasteUrl("");
                  setPasteError(null);
                  setAddOpen(true);
                }}
                disabled={createNpo.isPending}
                testId="button-open-add-npo"
              />
            </>
          }
        />

        {isLoading ? (
          <div className="py-20 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-[var(--brand-blue)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : rowsError ? (
          <ErrorState
            error={rowsErrorObj}
            onRetry={() => refetchRows()}
            title="Couldn't load NPOs"
            testId="admin-nonprofits-error"
          />
        ) : filtered.length === 0 ? (
          <AdminEmptyState testId="empty-nonprofits">
            {search.trim()
              ? "No NPO partners match that search."
              : "No NPO partners yet. Add one with the org's main website."}
          </AdminEmptyState>
        ) : view === "grid" ? (
          <div
            className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
            data-testid="grid-nonprofits"
          >
            {filtered.map((npo) => (
              <NpoCard key={npo.id} npo={npo} />
            ))}
          </div>
        ) : (
          <div
            className="rounded-2xl border border-[var(--apple-hairline)] bg-white overflow-hidden divide-y divide-[var(--apple-hairline)]"
            data-testid="list-nonprofits"
          >
            {filtered.map((npo) => (
              <NpoRow key={npo.id} npo={npo} />
            ))}
          </div>
        )}
        </>)}
      </div>

      <Dialog
        open={addOpen}
        onOpenChange={(o) => {
          if (createNpo.isPending) return;
          setAddOpen(o);
          if (!o) {
            setPasteUrl("");
            setPasteError(null);
          }
        }}
      >
        <DialogContent
          className="max-w-md bg-white rounded-2xl overflow-hidden border border-[var(--apple-hairline)] shadow-xl p-6 gap-4"
          data-testid="dialog-add-npo"
        >
          <DialogHeader className="text-left space-y-1">
            <DialogTitle className="text-[17px] font-semibold text-[var(--apple-ink)]">
              Add NPO
            </DialogTitle>
            <DialogDescription className="text-sm text-[var(--apple-subink)] leading-relaxed">
              Paste the org's main website — we'll pull the name, logo, and
              homepage from the page. You can attach contacts on the detail
              page.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitPaste} className="space-y-2 pt-1">
            <input
              type="url"
              placeholder="https://example.org"
              value={pasteUrl}
              onChange={(e) => {
                setPasteUrl(e.target.value);
                if (pasteError) setPasteError(null);
              }}
              disabled={createNpo.isPending}
              autoFocus
              className="w-full h-10 px-3 rounded-md border border-[var(--apple-hairline)] bg-white text-sm outline-none focus:border-[var(--brand-blue)] focus:ring-2 focus:ring-[var(--brand-blue)]/20 disabled:opacity-50"
              data-testid="input-add-npo-url"
            />
            {pasteError && (
              <p className="text-xs text-red-600" data-testid="text-add-npo-error">
                {pasteError}
              </p>
            )}
            <p className="text-xs text-[var(--apple-faint)]">
              Reads the page's Open Graph metadata and rehosts the logo.
              Instagram and Facebook pages aren't supported — use the NPO's
              own site instead.
            </p>
            <DialogFooter className="gap-2 sm:gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  if (!createNpo.isPending) createNpo.mutate({});
                }}
                disabled={createNpo.isPending}
                className="px-3 py-1.5 rounded-full text-xs font-semibold text-[var(--apple-subink)] hover:bg-[var(--apple-track)] disabled:opacity-50 transition-colors"
                data-testid="button-add-npo-skip"
              >
                Skip — create blank
              </button>
              <Button
                type="submit"
                disabled={createNpo.isPending || !pasteUrl.trim()}
                size="sm"
                className="text-xs font-semibold"
                data-testid="button-add-npo-pull"
              >
                {createNpo.isPending && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                )}
                {createNpo.isPending ? "Reading…" : "Pull from URL"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AdminFrame>
  );
}

function NpoCard({ npo }: { npo: NonProfit }) {
  return (
    <Link href={`/admin/non-profits/${npo.id}`} className="group text-left rounded-2xl bg-white border border-[var(--apple-hairline)] hover:shadow-md hover:border-[var(--brand-blue)]/30 transition-all p-4 flex items-center gap-3.5 underline-offset-2" data-testid={`card-npo-${npo.id}`}>
      <div className="w-14 h-14 rounded-xl overflow-hidden bg-white ring-1 ring-[var(--apple-hairline)] flex items-center justify-center flex-shrink-0">
        {npo.logoUrl ? (
          <img src={npo.logoUrl} alt={npo.name} className="w-full h-full object-cover" />
        ) : (
          <Heart className="w-6 h-6 text-slate-300" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div
          className="text-slate-900 text-sm font-semibold leading-tight truncate"
          data-testid={`text-npo-name-${npo.id}`}
        >
          {npo.name}
        </div>
        {npo.websiteUrl && (
          <div className="text-slate-400 text-xs truncate mt-0.5">
            {npo.websiteUrl.replace(/^https?:\/\//, "")}
          </div>
        )}
      </div>
    </Link>
  );
}

function NpoRow({ npo }: { npo: NonProfit }) {
  return (
    <Link href={`/admin/non-profits/${npo.id}`} className="group w-full text-left flex items-center gap-3 px-3 py-2 hover:bg-[var(--apple-track)] transition-colors underline-offset-2" data-testid={`row-npo-${npo.id}`}>
      <div className="w-10 h-10 rounded-md overflow-hidden bg-white ring-1 ring-[var(--apple-hairline)] flex items-center justify-center flex-shrink-0">
        {npo.logoUrl ? (
          <img src={npo.logoUrl} alt={npo.name} className="w-full h-full object-cover" />
        ) : (
          <Heart className="w-4 h-4 text-slate-300" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div
          className="text-slate-900 text-sm font-semibold truncate group-hover:text-[var(--brand-blue)] transition-colors"
          data-testid={`text-npo-name-${npo.id}`}
        >
          {npo.name}
        </div>
        {npo.websiteUrl && (
          <div className="text-slate-400 text-xs truncate">
            {npo.websiteUrl.replace(/^https?:\/\//, "")}
          </div>
        )}
      </div>
    </Link>
  );
}
