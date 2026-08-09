import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, apiErrorBody, apiErrorStatus } from "@/lib/queryClient";
import { Search, X, Guitar, Store, Loader2, Factory, ShoppingBag, Check } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { ErrorState } from "@/components/admin/AdminErrorBoundary";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import {
  ViewModeToggle,
  useViewMode,
} from "@/components/admin/ViewModeToggle";
import { AddEntityButton } from "@/components/admin/AddEntityButton";
import { AdminFilterPanel } from "@/components/admin/AdminFilterPanel";
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
// Task #500 — paste-a-URL scrape result. Reseller / maker each carry
// the fields the dialog renders as preview chips and the find-or-create
// path needs to upsert the vendor row before linking it to the gear.
interface VendorSlot {
  name: string;
  domain: string | null;
  affiliateUrl: string | null;
  aboutUrl: string | null;
  logoUrl: string | null;
  known: boolean;
  // Task #603 — sub-brand hints from the server. When the host owns
  // sub-brands (gibson.com → Epiphone), the scrape route emits the
  // maker slot with `parentDomain`, optionally `parentVendorId` (when
  // the parent vendor row already exists), and `existingVendorId`
  // (when the sub-brand row already exists). The client uses these to
  // skip the guaranteed-collision 409 round-trip and to avoid double-
  // creating an existing sub-brand row.
  parentDomain?: string | null;
  parentVendorId?: string | null;
  existingVendorId?: string | null;
}
interface ScrapeResult {
  name: string | null;
  brand: string | null;
  category: string | null;
  description: string | null;
  specs: Record<string, string>;
  price: string | null;
  photoUrl: string | null;
  sourceImage: string | null;
  // Task #1233 — every candidate photo the scraper found, primary first.
  // The operator picks which extras to import in the preview; each picked
  // one is rehosted to Object Storage on save.
  sourceImages?: string[];
  reseller: VendorSlot | null;
  maker: VendorSlot | null;
  notice?: string | null;
}

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
  // Task #24 — toolbar filter panel state. Category chips narrow by the
  // card's display category; the Maker link group keeps Task #174's
  // "unassigned maker" cleanup sweep (plus its inverse) — that filter
  // used to be a standalone amber toolbar pill, now folded in here.
  const [categoryFilter, setCategoryFilter] = useState<Set<string>>(
    () => new Set(),
  );
  const [makerFilter, setMakerFilter] = useState<"has" | "unassigned" | null>(
    null,
  );
  const filtersActive = categoryFilter.size > 0 || makerFilter !== null;
  const resetFilters = () => {
    setCategoryFilter(new Set());
    setMakerFilter(null);
  };
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

  // Display category = the same string the cards show (short label when
  // set, else the full category). Distinct values feed the filter panel.
  const displayCategory = (i: InstrumentLite) =>
    (i.shortCategory?.trim() || i.category.trim() || "Uncategorized");

  const categoryOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const i of instruments) {
      const label = displayCategory(i);
      const key = label.toLowerCase();
      if (!seen.has(key)) seen.set(key, label);
    }
    return Array.from(seen.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [instruments]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = q
      ? instruments.filter(
          (i) =>
            i.name.toLowerCase().includes(q) ||
            i.category.toLowerCase().includes(q),
        )
      : instruments.slice();
    if (categoryFilter.size > 0) {
      rows = rows.filter((i) =>
        categoryFilter.has(displayCategory(i).toLowerCase()),
      );
    }
    if (makerFilter === "unassigned") {
      rows = rows.filter((i) => !i.makerVendorId);
    } else if (makerFilter === "has") {
      rows = rows.filter((i) => !!i.makerVendorId);
    }
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return rows;
  }, [instruments, search, categoryFilter, makerFilter]);

  const openInstrument = (id: string) => {
    navigate(`/admin/instruments/${id}`);
  };

  const queryClient = useQueryClient();
  const { toast } = useToast();
  // "Add Gear" opens a paste-URL dialog (restored 2026-05). Pulling the
  // product page first lets the server scraper prefill name / category /
  // photo and classify the reseller + maker — task #500 introduced a
  // two-stage flow so the operator sees both vendor chips before
  // confirming. "Skip" still creates a blank "New gear" for hand-entry.
  const [addOpen, setAddOpen] = useState(false);
  const [pasteUrl, setPasteUrl] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [scraped, setScraped] = useState<ScrapeResult | null>(null);
  // Task #1233 — which extra gallery photos (raw source URLs beyond the
  // hero) the operator has checked for import. Defaults to ALL when a
  // scrape returns more than one shot. Each stays a RAW URL here; the
  // server rehosts the picked ones to Object Storage on save.
  const [selectedExtras, setSelectedExtras] = useState<Set<string>>(new Set());

  // Find-or-create a vendor row by domain, OR-promoting the maker /
  // reseller flag if the row already exists with the opposite flag.
  // Server returns 201 (created), 200 (promoted), or 409 (already
  // carries the requested flag) — all three carry the vendor in the
  // payload, just at different shapes.
  async function findOrCreateVendor(slot: VendorSlot, role: "maker" | "reseller" | "both"): Promise<{ id: string; name: string } | null> {
    if (!slot.domain) return null;
    // Task #603 — server already resolved this sub-brand to an
    // existing vendor row; skip the POST entirely so we don't double-
    // create on re-imports of a second Epiphone product off gibson.com.
    if (slot.existingVendorId) {
      return { id: slot.existingVendorId, name: slot.name };
    }
    const isMaker = role === "maker" || role === "both";
    const isReseller = role === "reseller" || role === "both";
    const basePayload: Record<string, unknown> = {
      name: slot.name,
      domain: slot.domain,
      isMaker,
      isReseller,
      ...(slot.logoUrl ? { logoUrl: slot.logoUrl } : {}),
      ...(slot.aboutUrl ? { aboutUrl: slot.aboutUrl } : {}),
    };
    // Task #603 — when the scrape gave us a parent hint up front, take
    // the sub-brand create path directly so we don't burn a round-trip
    // on a guaranteed domain-collision 409.
    if (slot.parentVendorId) {
      const r = await apiRequest("POST", "/api/admin/vendors", {
        ...basePayload,
        parentVendorId: slot.parentVendorId,
      });
      return (await r.json()) as { id: string; name: string };
    }
    try {
      const r = await apiRequest("POST", "/api/admin/vendors", basePayload);
      return (await r.json()) as { id: string; name: string };
    } catch (err) {
      // Recover from a duplicate-domain 409 (the maker/reseller already
      // exists in the catalog). The shared API client attaches the parsed
      // response body as `err.body` ({ message, vendor, parentCandidate });
      // read that structured field rather than JSON-parsing it back out of
      // `err.message`, which is intentionally kept clean (only the human
      // `message` string) and would throw here — silently dropping the
      // maker/reseller on every re-add of gear from an already-known brand.
      if (apiErrorStatus(err) === 409) {
        const body = apiErrorBody<{
          vendor?: { id: string; name: string };
          parentCandidate?: { id: string };
        }>(err);
        if (body) {
          // Task #603 — when 409 carries a `parentCandidate` and the
          // existing top-level vendor is a *different* brand than what
          // we asked for (Gibson vs requested Epiphone), re-POST as a
          // sub-brand of the parent candidate instead of mistakenly
          // returning the parent row and clobbering the maker.
          const existingName = String(body.vendor?.name ?? "").toLowerCase();
          const requestedName = slot.name.trim().toLowerCase();
          const sameName = existingName && existingName === requestedName;
          if (!sameName && body.parentCandidate?.id) {
            const r2 = await apiRequest("POST", "/api/admin/vendors", {
              ...basePayload,
              parentVendorId: body.parentCandidate.id,
            });
            return (await r2.json()) as { id: string; name: string };
          }
          if (body.vendor?.id) return body.vendor as { id: string; name: string };
        }
      }
      throw err;
    }
  }

  const scrapeUrl = useMutation({
    mutationFn: async (url: string): Promise<ScrapeResult> => {
      const r = await apiRequest("POST", "/api/admin/instruments/scrape", { url });
      return (await r.json()) as ScrapeResult;
    },
    onSuccess: (data) => {
      setScraped(data);
      setPasteError(null);
      // Default every extra photo (beyond the hero) to "import" so the
      // common case is one click; the operator unchecks any they don't want.
      const extras = (data.sourceImages ?? []).slice(1);
      setSelectedExtras(new Set(extras));
    },
    onError: (err: any) => {
      setPasteError(humanizeApiError(err));
    },
  });

  const createInstrument = useMutation({
    mutationFn: async (opts: { url?: string; scraped?: ScrapeResult | null }) => {
      const trimmedUrl = (opts.url ?? "").trim();
      const s = opts.scraped ?? null;
      let name = s?.name ? String(s.name) : "New gear";
      let category = s?.category ? String(s.category) : "Guitar";
      const photoUrl = s?.photoUrl ? String(s.photoUrl) : null;
      const about = s?.description ? String(s.description) : null;

      // Resolve vendors up front so we can stamp makerVendorId at create
      // time (PUT-after-POST would still work but races the detail page
      // navigation). Reseller + maker can collapse to the same vendor
      // row (Gibson) — dedupe by domain so we don't double-POST.
      let makerVendor: { id: string; name: string } | null = null;
      let resellerVendor: { id: string; name: string } | null = null;
      // Task #603 — same-domain maker+reseller (pure Gibson product on
      // gibson.com) collapses to one find-or-create. The Task #603
      // sub-brand override on the server keeps reseller/maker as the
      // same slot only for pure Gibson products; Epiphone-on-gibson
      // splits into different domains (gibson.com reseller + sub-brand
      // maker slot) so this branch deliberately skips it.
      const sameVendor =
        !!s?.reseller?.domain && !!s?.maker?.domain &&
        s.reseller.domain.toLowerCase() === s.maker.domain.toLowerCase() &&
        !s.maker.parentDomain && !s.maker.existingVendorId;
      let vendorError: unknown = null;
      if (sameVendor && s?.reseller) {
        // Task #603 — wrap so a vendor-upsert throw can't bubble past
        // the toast and leave the dialog half-reset with no error.
        try {
          const both = await findOrCreateVendor(s.reseller, "both");
          makerVendor = both;
          resellerVendor = both;
        } catch (err) {
          vendorError = err;
          console.error("[add-gear] same-vendor upsert failed", err);
        }
      } else {
        if (s?.maker?.domain) {
          try { makerVendor = await findOrCreateVendor(s.maker, "maker"); }
          catch (err) { vendorError = err; console.error("[add-gear] maker upsert failed", err); }
        }
        if (s?.reseller?.domain) {
          try { resellerVendor = await findOrCreateVendor(s.reseller, "reseller"); }
          catch (err) { if (!vendorError) vendorError = err; console.error("[add-gear] reseller upsert failed", err); }
        }
      }

      // Task #1986 — a genuine vendor-upsert failure (network/500/400, not a
      // recoverable duplicate 409, which findOrCreateVendor now resolves) must
      // surface an honest, visible error instead of silently creating a gear
      // row with the maker/reseller missing. Abort before the instrument POST
      // so onError can show the failure in the dialog and the operator can
      // retry — rather than landing on a maker-less detail page with only a
      // console.error to explain it.
      if (vendorError) throw vendorError;

      // Task #1233 — the extra gallery photos the operator kept checked,
      // in the scraper's original order. Raw source URLs; the server
      // rehosts each to Object Storage and drops any equal to the hero.
      const galleryImageUrls = (s?.sourceImages ?? [])
        .slice(1)
        .filter((u) => selectedExtras.has(u));

      const res = await apiRequest("POST", "/api/admin/instruments", {
        name,
        category,
        ...(photoUrl ? { photoUrl } : {}),
        ...(about ? { about } : {}),
        ...(galleryImageUrls.length > 0 ? { galleryImageUrls } : {}),
        // Task #461 — remember the page the operator pasted.
        ...(trimmedUrl ? { sourceUrl: trimmedUrl } : {}),
        // Task #500 — stamp the maker at create time so AdminInstrument
        // doesn't render an empty Maker panel during the navigate.
        ...(makerVendor ? { makerVendorId: makerVendor.id } : {}),
      });
      const instrument = (await res.json()) as { id: string };

      let resellerAttached = false;
      if (resellerVendor && s?.reseller?.affiliateUrl) {
        try {
          await apiRequest(
            "POST",
            `/api/admin/instruments/${instrument.id}/vendors`,
            {
              vendorId: resellerVendor.id,
              affiliateUrl: s.reseller.affiliateUrl,
            },
          );
          resellerAttached = true;
        } catch (err) {
          // Reseller attach failing shouldn't block the new gear row
          // from opening — the operator can re-attach on the detail
          // page. We surface the partial-success state in the toast.
          console.error("[add-gear] reseller attach failed", err);
        }
      }
      return { instrument, scraped: s, makerVendor, resellerVendor, resellerAttached, vendorError };
    },
    onSuccess: ({ instrument, scraped, makerVendor, resellerVendor, resellerAttached, vendorError }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/instruments"] });
      // A brand-new maker (or reseller) may have been minted via the
      // findOrCreateVendor upsert above. Invalidate the vendor caches so
      // the detail page we're about to navigate to recognizes it without
      // a manual refresh. Predicate-based to catch every ?role= variant.
      queryClient.invalidateQueries({
        predicate: (q) =>
          Array.isArray(q.queryKey) &&
          typeof q.queryKey[0] === "string" &&
          q.queryKey[0].startsWith("/api/vendors"),
      });
      setAddOpen(false);
      setPasteUrl("");
      setPasteError(null);
      setScraped(null);
      setSelectedExtras(new Set());
      if (scraped?.name || makerVendor || resellerVendor || vendorError) {
        const headline = scraped?.name ?? "Created blank gear";
        const parts: string[] = [];
        // A slot that had a domain but came back null means its upsert threw
        // (findOrCreateVendor only returns null when there's no domain), so
        // say so plainly instead of dropping it silently.
        const resellerFailed = !resellerVendor && !!scraped?.reseller?.domain;
        const makerFailed = !makerVendor && !!scraped?.maker?.domain;
        if (resellerVendor) {
          parts.push(
            resellerAttached
              ? `Reseller: ${resellerVendor.name}`
              : `Reseller: ${resellerVendor.name} (attach failed — re-link on detail page)`,
          );
        } else if (resellerFailed) {
          parts.push(`Reseller: ${scraped!.reseller!.name} (couldn't save — add on detail page)`);
        } else if (scraped?.reseller && !scraped.reseller.domain) {
          parts.push("Reseller skipped — no domain");
        }
        if (makerVendor) parts.push(`Maker: ${makerVendor.name}`);
        else if (makerFailed) parts.push(`Maker: ${scraped!.maker!.name} (couldn't save — add on detail page)`);
        else if (scraped?.maker && !scraped.maker.domain) parts.push(`Maker: ${scraped.maker.name} (no domain — set by hand)`);
        const hadFailure =
          !!vendorError || (!!resellerVendor && !resellerAttached) || resellerFailed || makerFailed;
        toast({
          title: `Pulled "${headline}"`,
          description: parts.length
            ? `${parts.join(" · ")}. Review and edit on the detail page.`
            : "Review and edit on the detail page.",
          ...(hadFailure ? { variant: "destructive" as const } : {}),
        });
      }
      navigate(`/admin/instruments/${instrument.id}`);
    },
    onError: (err: any) => {
      setPasteError(humanizeApiError(err));
    },
  });

  const openNewInstrument = () => {
    if (scrapeUrl.isPending || createInstrument.isPending) return;
    setPasteError(null);
    setPasteUrl("");
    setScraped(null);
    setSelectedExtras(new Set());
    setAddOpen(true);
  };

  const pullFromUrl = () => {
    if (scrapeUrl.isPending || createInstrument.isPending) return;
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
    scrapeUrl.mutate(u);
  };

  const confirmCreate = () => {
    if (scrapeUrl.isPending || createInstrument.isPending) return;
    createInstrument.mutate({ url: pasteUrl.trim(), scraped });
  };

  const skipPaste = () => {
    if (scrapeUrl.isPending || createInstrument.isPending) return;
    setPasteError(null);
    createInstrument.mutate({ url: "", scraped: null });
  };

  const resetScrape = () => {
    if (scrapeUrl.isPending || createInstrument.isPending) return;
    setScraped(null);
    setSelectedExtras(new Set());
    setPasteError(null);
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
        subtitle={<>Gear + per-gear vendor links — the SuperCredits™ Micro-Sponsorship surface.{" "}<Link href="/admin/makers" className="hover:text-[color:var(--brand-blue)] hover:underline underline-offset-2 transition-colors">Looking for Makers?</Link></>}
        actions={(<>
          {searchOpen ? (
            <div className="flex items-center gap-1.5 bg-white border border-[var(--apple-hairline)] rounded-full px-3 h-9">
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
          {/* Task #24 — shared filter panel (replaces the Task #174
              standalone "Unassigned maker" pill; that sweep now lives
              in the Maker link group inside the panel). */}
          <AdminFilterPanel
            groups={[
              {
                id: "category",
                label: "Category",
                options: categoryOptions,
              },
              {
                id: "maker",
                label: "Maker link",
                mode: "single",
                options: [
                  { value: "has", label: "Has maker" },
                  { value: "unassigned", label: "Unassigned maker" },
                ],
              },
            ]}
            selected={{
              category: Array.from(categoryFilter),
              maker: makerFilter ? [makerFilter] : [],
            }}
            onToggle={(groupId, value) => {
              if (groupId === "category") {
                setCategoryFilter((prev) => {
                  const next = new Set(prev);
                  if (next.has(value)) next.delete(value);
                  else next.add(value);
                  return next;
                });
              } else {
                setMakerFilter((prev) =>
                  prev === value ? null : (value as "has" | "unassigned"),
                );
              }
            }}
            onReset={resetFilters}
            isActive={filtersActive}
          />
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
        <EmptyState
          searching={search.trim().length > 0}
          filtering={filtersActive}
        />
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
          className="rounded-2xl border border-[var(--apple-hairline)] bg-white overflow-hidden divide-y divide-[var(--apple-hairline)]"
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
          if (scrapeUrl.isPending || createInstrument.isPending) return;
          setAddOpen(o);
          if (!o) {
            setPasteUrl("");
            setPasteError(null);
            setScraped(null);
            setSelectedExtras(new Set());
          }
        }}
      >
        <DialogContent
          className="max-w-md bg-white rounded-2xl border border-[var(--apple-hairline)] shadow-xl p-0 gap-0 flex flex-col max-h-[calc(100dvh-2rem)] overflow-hidden"
          data-testid="dialog-add-gear"
        >
          <DialogHeader className="text-left space-y-1 px-6 pt-6 pb-3 flex-shrink-0">
            <DialogTitle className="text-[17px] font-semibold text-[var(--apple-ink)]">
              Add gear
            </DialogTitle>
            <DialogDescription className="text-sm text-[var(--apple-subink)] leading-relaxed pr-6">
              Paste a product URL — Carter Vintage, Reverb, Gibson, Martin,
              Sweetwater, etc. We'll prefill name, category, photo, and
              attach the reseller + maker.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 px-6 flex-1 overflow-y-auto min-h-0">
            <input
              type="url"
              value={pasteUrl}
              onChange={(e) => {
                setPasteUrl(e.target.value);
                if (pasteError) setPasteError(null);
                // Editing the URL invalidates the prior scrape preview
                // so the chips can't get out of sync with the input.
                if (scraped) setScraped(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (scraped) confirmCreate();
                  else pullFromUrl();
                }
              }}
              placeholder="https://…"
              autoFocus
              disabled={scrapeUrl.isPending || createInstrument.isPending}
              className="w-full h-10 px-3 rounded-md border border-[var(--apple-hairline)] bg-white text-[13.5px] outline-none focus:border-[var(--brand-blue)] focus:ring-2 focus:ring-[var(--brand-blue)]/20 disabled:opacity-50"
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
            {!scraped && !pasteError && (
              <p className="text-[11.5px] text-[var(--apple-faint)]">
                Reads the page's Open Graph + product metadata and rehosts
                the hero image. Most modern shops work without an account.
              </p>
            )}
            {scraped && (
              <div className="mt-2 space-y-1.5">
                <p
                  className="text-xs font-semibold uppercase tracking-wide text-[var(--apple-subink)]"
                  data-testid="text-scrape-preview-label"
                >
                  Ready to add — confirm below
                </p>
                <div
                  className="space-y-2 rounded-md border border-[var(--apple-hairline)] bg-[var(--apple-track)] p-3"
                  data-testid="panel-scrape-preview"
                >
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-md overflow-hidden bg-white ring-1 ring-[var(--apple-hairline)] flex items-center justify-center flex-shrink-0">
                    {scraped.photoUrl ? (
                      <img
                        src={scraped.photoUrl}
                        alt={scraped.name ?? "Pulled gear"}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Guitar className="w-5 h-5 text-slate-300" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div
                      className="text-[var(--apple-ink)] text-sm font-semibold break-words"
                      data-testid="text-scrape-preview-name"
                    >
                      {scraped.name ?? "Untitled gear"}
                    </div>
                    {scraped.category && (
                      <div className="text-slate-500 text-xs truncate">
                        {scraped.category}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {scraped.reseller && (
                    <VendorChip
                      role="reseller"
                      slot={scraped.reseller}
                      testId="chip-scrape-reseller"
                    />
                  )}
                  {scraped.maker && (
                    <VendorChip
                      role="maker"
                      slot={scraped.maker}
                      testId="chip-scrape-maker"
                    />
                  )}
                  {!scraped.reseller && !scraped.maker && (
                    <span className="text-xs text-slate-400">
                      No vendor classified.
                    </span>
                  )}
                </div>
                {(() => {
                  // Task #1233 — gallery picker. Show every shot beyond the
                  // hero as a selectable thumbnail; checked ones import.
                  const extras = (scraped.sourceImages ?? []).slice(1);
                  if (extras.length === 0) return null;
                  const allOn = extras.every((u) => selectedExtras.has(u));
                  const selCount = extras.filter((u) => selectedExtras.has(u)).length;
                  return (
                    <div className="space-y-1.5 pt-1" data-testid="panel-scrape-gallery">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          {extras.length} more photo{extras.length === 1 ? "" : "s"} — {selCount} selected
                        </p>
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedExtras(allOn ? new Set() : new Set(extras))
                          }
                          className="text-xs font-semibold text-[var(--apple-subink)] hover:text-[var(--apple-ink)]"
                          data-testid="button-scrape-gallery-toggle-all"
                        >
                          {allOn ? "Clear all" : "Select all"}
                        </button>
                      </div>
                      <div className="grid grid-cols-5 gap-1.5">
                        {extras.map((u, idx) => {
                          const on = selectedExtras.has(u);
                          return (
                            <button
                              key={u}
                              type="button"
                              onClick={() =>
                                setSelectedExtras((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(u)) next.delete(u);
                                  else next.add(u);
                                  return next;
                                })
                              }
                              className={`relative aspect-square overflow-hidden rounded-md ring-1 transition ${
                                on
                                  ? "ring-2 ring-sky-500"
                                  : "ring-slate-200 opacity-60 hover:opacity-100"
                              }`}
                              aria-pressed={on}
                              data-testid={`button-scrape-gallery-photo-${idx}`}
                            >
                              <img
                                src={u}
                                alt={`Extra photo ${idx + 1}`}
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                              {on && (
                                <span className="absolute right-0.5 top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-sky-500 text-white">
                                  <Check className="h-2.5 w-2.5" />
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
                {scraped.notice && (
                  <p
                    className="text-xs text-slate-500 leading-snug"
                    data-testid="text-scrape-notice"
                  >
                    {scraped.notice}
                  </p>
                )}
                </div>
              </div>
            )}
            <div className="h-2" />
          </div>
          <DialogFooter className="flex-shrink-0 px-6 py-4 border-t border-[var(--apple-hairline)] bg-white flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-2 sm:space-x-0">
            {scraped ? (
              <>
                <button
                  type="button"
                  onClick={resetScrape}
                  disabled={createInstrument.isPending}
                  className="w-full sm:w-auto h-9 px-3 rounded-full text-xs font-semibold text-[var(--apple-subink)] hover:bg-[var(--apple-track)] disabled:opacity-50 transition-colors"
                  data-testid="button-add-gear-reset"
                >
                  Try another URL
                </button>
                <Button
                  type="button"
                  onClick={confirmCreate}
                  disabled={createInstrument.isPending}
                  className="w-full sm:w-auto h-9 px-4 text-sm font-semibold gap-1.5"
                  data-testid="button-add-gear-confirm"
                >
                  {createInstrument.isPending && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  )}
                  {createInstrument.isPending ? "Creating…" : "Create gear"}
                </Button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={skipPaste}
                  disabled={scrapeUrl.isPending || createInstrument.isPending}
                  className="w-full sm:w-auto h-9 px-3 rounded-full text-xs font-semibold text-[var(--apple-subink)] hover:bg-[var(--apple-track)] disabled:opacity-50 transition-colors"
                  data-testid="button-add-gear-skip"
                >
                  Skip — create blank
                </button>
                <Button
                  type="button"
                  onClick={pullFromUrl}
                  disabled={scrapeUrl.isPending || createInstrument.isPending || !pasteUrl.trim()}
                  className="w-full sm:w-auto h-9 px-4 text-sm font-semibold gap-1.5"
                  data-testid="button-add-gear-pull"
                >
                  {scrapeUrl.isPending && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  )}
                  {scrapeUrl.isPending ? "Reading…" : "Pull from URL"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminFrame>
  );
}

function VendorChip({
  role,
  slot,
  testId,
}: {
  role: "reseller" | "maker";
  slot: VendorSlot;
  testId: string;
}) {
  const Icon = role === "reseller" ? ShoppingBag : Factory;
  const label = role === "reseller" ? "Reseller" : "Maker";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-white border border-slate-200 pl-1.5 pr-2.5 py-1 text-xs text-slate-700 max-w-full min-w-0"
      data-testid={testId}
    >
      {slot.logoUrl ? (
        <img
          src={slot.logoUrl}
          alt=""
          className="w-4 h-4 rounded-sm object-cover flex-shrink-0"
        />
      ) : (
        <Icon className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
      )}
      <span className="font-semibold text-slate-500 flex-shrink-0">{label}:</span>
      <span className="truncate min-w-0">{slot.name}</span>
      {!slot.domain && (
        <span
          className="text-slate-400 italic flex-shrink-0"
          title="No domain — admin will need to fill this in by hand on the maker / reseller row"
        >
          (no domain)
        </span>
      )}
    </span>
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
      <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-[var(--apple-track)] ring-1 ring-[var(--apple-hairline)] shadow-sm group-hover:shadow-md group-hover:ring-[var(--brand-blue)]/30 transition-all">
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
            className="absolute top-2 right-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-white/90 backdrop-blur-sm text-[var(--apple-subink)] text-[10.5px] font-bold shadow"
            data-testid={`badge-vendor-count-${instrument.id}`}
          >
            <Store className="w-3 h-3" />
            {vendorCount}
          </div>
        )}
      </div>
      <div
        className="mt-2 text-[var(--apple-ink)] text-[13px] font-semibold leading-snug line-clamp-2"
        data-testid={`text-instrument-name-${instrument.id}`}
      >
        {instrument.name}
      </div>
      <div className="text-[var(--apple-faint)] text-[11.5px] truncate">
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
      className="group w-full text-left flex items-center gap-3 px-3 py-2 hover:bg-[var(--apple-track)] transition-colors"
      data-testid={`row-instrument-${instrument.id}`}
    >
      <div className="w-12 h-12 rounded-md overflow-hidden bg-[var(--apple-track)] ring-1 ring-[var(--apple-hairline)] flex items-center justify-center flex-shrink-0">
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
          className="text-[var(--apple-ink)] text-[13.5px] font-semibold truncate group-hover:text-[var(--brand-blue)] transition-colors"
          data-testid={`text-instrument-name-${instrument.id}`}
        >
          {instrument.name}
        </div>
        <div className="text-[var(--apple-subink)] text-[12px] truncate">
          {instrument.shortCategory || instrument.category}
        </div>
      </div>
      {vendorCount > 0 && (
        <div
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[var(--apple-track)] text-[var(--apple-subink)] text-[10.5px] font-bold flex-shrink-0"
          data-testid={`badge-vendor-count-${instrument.id}`}
        >
          <Store className="w-3 h-3" />
          {vendorCount}
        </div>
      )}
    </button>
  );
}

function EmptyState({
  searching,
  filtering,
}: {
  searching: boolean;
  filtering?: boolean;
}) {
  return (
    <AdminEmptyState testId="empty-instruments">
      {searching
        ? "No gear matches that search."
        : filtering
          ? "No gear matches these filters."
          : "No gear yet. Add a guitar, amp, mic, or anything else artists play on."}
    </AdminEmptyState>
  );
}
