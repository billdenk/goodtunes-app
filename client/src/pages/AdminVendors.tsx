import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { useLocation, useRoute } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Search, X, Store, Hammer, Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
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

// Task #292 — derive a sensible sub-brand name from the pasted URL's path.
// Pastes like `https://www.gibson.com/pages/epiphone` collide on the apex
// domain (`gibson.com`) and the scraper returns the parent's name
// ("Gibson"); the path itself ("epiphone") is the real signal for what the
// operator was trying to add. Returns null when the URL has no meaningful
// path segment, so callers can fall back to the scraped name.
function deriveNameFromUrl(rawUrl: string): string | null {
  const trimmed = (rawUrl ?? "").trim();
  if (!trimmed) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  const skip = new Set(["pages", "page", "brand", "brands", "collections", "collection", "shop", "store", "category", "categories"]);
  const segments = parsed.pathname
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/\.[a-z0-9]{1,5}$/i, ""))
    .filter((s) => s.length > 0 && !skip.has(s.toLowerCase()));
  if (segments.length === 0) return null;
  const last = segments[segments.length - 1];
  const words = last
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  if (words.length === 0) return null;
  return words
    .map((w) =>
      /^[A-Z0-9]+$/.test(w)
        ? w
        : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
    )
    .join(" ");
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
  // Task #174 — same component serves both /admin/vendors (resellers,
  // the default) and /admin/makers (gear builders). The DB row is the
  // same vendor entity; mode just narrows which flag we filter on,
  // which sidebar key activates, and which label appears in the page
  // chrome. Detect mode from the URL so deep links stay shareable.
  const [matchMakers] = useRoute("/admin/makers");
  const mode: "maker" | "reseller" = matchMakers ? "maker" : "reseller";
  const copy = mode === "maker"
    ? {
        active: "makers" as const,
        title: "Makers",
        subtitle:
          "Brands that build the gear — guitar makers, amp builders, microphone manufacturers. A row can also sell direct; flip Reseller on its detail page.",
        addLabel: "Add maker",
        addDialogTitle: "Add maker",
        listRoute: "/admin/makers",
        Icon: Hammer,
        searchPlaceholder: "Search makers",
        emptyTitle: "No makers yet",
        emptyHint:
          "Add a builder the first time you attach them to a piece of gear.",
        emptySearchHint: "Try a different name or domain.",
      }
    : {
        active: "vendors" as const,
        title: "Resellers",
        subtitle:
          "Shops that sell the gear — Reverb, Sweetwater, Carter Vintage. Edit here once and it propagates to every instrument attachment.",
        addLabel: "Add reseller",
        addDialogTitle: "Add reseller",
        listRoute: "/admin/vendors",
        Icon: Store,
        searchPlaceholder: "Search resellers",
        emptyTitle: "No resellers yet",
        emptyHint:
          "Add a shop the first time you attach one of their listings to a piece of gear.",
        emptySearchHint: "Try a different name or domain.",
      };
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
  // Task #237 — when a top-level domain collision comes back from the
  // server as a 409 with a `parentCandidate`, we stash the prefilled
  // payload + the candidate parent so the operator can confirm
  // "create as sub-brand of {Parent}" with one click. Re-submits the
  // same payload plus `parentVendorId`.
  const [subBrandPrompt, setSubBrandPrompt] = useState<
    | {
        // Auto-detected candidate the server returned with the 409 —
        // shown as the default selection but the operator can swap to
        // any other top-level vendor via the picker below.
        parent: { id: string; name: string; domain: string; logoUrl: string | null };
        payload: Record<string, unknown>;
        scrapedName: string | null;
      }
    | null
  >(null);
  // Task #280 — currently-selected parent for the sub-brand prompt.
  // Defaults to subBrandPrompt.parent but the operator can swap it for
  // any other top-level vendor (same list AdminVendor's Parent picker
  // uses) before confirming.
  const [subBrandParent, setSubBrandParent] = useState<{
    id: string;
    name: string;
    domain: string;
    logoUrl: string | null;
  } | null>(null);
  const [subBrandPickerOpen, setSubBrandPickerOpen] = useState(false);
  const [subBrandPickerQuery, setSubBrandPickerQuery] = useState("");
  // Task #292 — editable name for the new sub-brand. Seeded from the
  // pasted URL's path (best signal — `/pages/epiphone` → "Epiphone"),
  // falling back to the scraped name (parent's name on apex collisions),
  // then blank. Lets the operator confirm with the right name in one go
  // instead of renaming on the detail page after creation.
  const [subBrandName, setSubBrandName] = useState("");
  useEffect(() => {
    if (subBrandPrompt) {
      setSubBrandParent(subBrandPrompt.parent);
      setSubBrandPickerOpen(false);
      setSubBrandPickerQuery("");
      const fromUrl = deriveNameFromUrl(pasteUrl);
      setSubBrandName(fromUrl || subBrandPrompt.scrapedName || "");
    } else {
      setSubBrandParent(null);
      setSubBrandPickerOpen(false);
      setSubBrandPickerQuery("");
      setSubBrandName("");
    }
    // pasteUrl intentionally omitted — we seed once on prompt open, then
    // let the operator freely edit the name without it snapping back if
    // they later edit the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subBrandPrompt]);

  // Top-level vendors used as candidate parents in the sub-brand prompt.
  // Mirrors AdminVendor's LineagePanel: pull /api/vendors, exclude
  // sub-brands (parentVendorId set). Only fetched while the prompt is
  // open so the index page itself isn't slowed down.
  const { data: parentCandidatesAll = [] } = useQuery<
    Array<{
      id: string;
      name: string;
      domain: string;
      logoUrl: string | null;
      parentVendorId?: string | null;
    }>
  >({
    queryKey: ["/api/vendors"],
    enabled: !!subBrandPrompt,
  });
  const parentCandidates = useMemo(() => {
    const q = subBrandPickerQuery.trim().toLowerCase();
    const rows = parentCandidatesAll.filter((v) => !v.parentVendorId);
    const filtered = q
      ? rows.filter(
          (v) =>
            v.name.toLowerCase().includes(q) ||
            v.domain.toLowerCase().includes(q),
        )
      : rows;
    return filtered
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 50);
  }, [parentCandidatesAll, subBrandPickerQuery]);

  const createVendor = useMutation({
    mutationFn: async (opts: {
      url?: string;
      // Task #237 — sub-brand confirm path. When the operator clicks
      // "Add as sub-brand of {Parent}" we re-POST the same payload
      // captured from the first attempt + a parentVendorId, which
      // bypasses the domain-collision check on the server.
      payload?: Record<string, unknown>;
      scrapedName?: string | null;
    }) => {
      if (opts.payload) {
        const res = await apiRequest("POST", "/api/admin/vendors", opts.payload);
        const vendor = (await res.json()) as VendorLite;
        return { vendor, scrapedName: opts.scrapedName ?? null, payload: opts.payload };
      }
      let payload: Record<string, unknown> = {
        name: "New vendor",
        domain: `new-vendor-${Date.now()}.example`,
        // Task #174 — POST role flags reflect which surface the operator
        // created the row from. The Maker surface defaults isReseller
        // false (most builders don't sell direct); the Resellers surface
        // keeps the legacy default (isReseller=true). The server's
        // domain-collision branch promotes existing rows by OR'ing the
        // requested flag on, so adding a Maker for an existing reseller
        // domain (Gibson, Steinway) lights up both flags on the same row.
        isMaker: mode === "maker",
        isReseller: mode !== "maker",
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
          ...payload,
          name: scraped.name || "New vendor",
          // Fall back to a unique placeholder so the partial-unique
          // index never blocks the create when scrape returns null.
          domain: scraped.domain || `new-vendor-${Date.now()}.example`,
          ...(scraped.homeUrl ? { homeUrl: scraped.homeUrl } : {}),
          ...(scraped.aboutUrl ? { aboutUrl: scraped.aboutUrl } : {}),
          ...(scraped.logoUrl ? { logoUrl: scraped.logoUrl } : {}),
          ...(scraped.coverUrl ? { coverUrl: scraped.coverUrl } : {}),
          ...(scraped.bio ? { bio: scraped.bio } : {}),
          ...(scraped.tagline ? { tagline: scraped.tagline } : {}),
        };
      }
      try {
        const res = await apiRequest("POST", "/api/admin/vendors", payload);
        const vendor = (await res.json()) as VendorLite;
        return { vendor, scrapedName, payload };
      } catch (e) {
        // Task #280 — attach the built payload + scrapedName to the
        // thrown error so onError can open the sub-brand prompt on the
        // FIRST attempt of the URL-scrape and Skip-create-blank paths
        // (vars.payload is undefined for those entry points because the
        // payload is built inside the mutationFn, not by the caller).
        (e as any).__payload = payload;
        (e as any).__scrapedName = scrapedName;
        throw e;
      }
    },
    onSuccess: ({ vendor, scrapedName }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors"] });
      setAddOpen(false);
      setPasteUrl("");
      setPasteError(null);
      setSubBrandPrompt(null);
      if (scrapedName) {
        toast({
          title: `Pulled "${scrapedName}"`,
          description: "Review and edit on the detail page.",
        });
      }
      navigate(`${copy.listRoute}/${vendor.id}`);
    },
    onError: (err: any, vars) => {
      // Task #237 — domain-collision 409 with a `parentCandidate` is the
      // "add as sub-brand?" prompt. Surface it inline instead of as a
      // raw error message; the operator clicks once to re-submit with
      // parentVendorId attached.
      //
      // Task #280 — the URL-scrape and Skip-create-blank paths build
      // their payload inside mutationFn, so vars.payload is undefined
      // on the first attempt. Fall back to the payload the mutationFn
      // stashed on the error so the prompt fires on the FIRST try, not
      // only on re-confirm.
      const payloadForPrompt =
        vars?.payload ?? (err && (err as any).__payload) ?? null;
      const scrapedNameForPrompt =
        vars?.scrapedName ?? (err && (err as any).__scrapedName) ?? null;
      const raw = err instanceof Error ? err.message : String(err ?? "");
      const m = raw.match(/^(\d{3}):\s*(.*)$/);
      if (m && m[1] === "409") {
        try {
          const body = JSON.parse(m[2]);
          if (body?.parentCandidate?.id && payloadForPrompt) {
            setSubBrandPrompt({
              parent: body.parentCandidate,
              payload: payloadForPrompt,
              scrapedName: scrapedNameForPrompt,
            });
            setPasteError(null);
            return;
          }
        } catch {
          /* fall through to humanized message */
        }
      }
      setPasteError(humanizeApiError(err));
    },
  });

  const confirmSubBrand = () => {
    if (!subBrandPrompt || !subBrandParent || createVendor.isPending) return;
    const trimmedName = subBrandName.trim();
    if (!trimmedName) return;
    // Task #280 — use whichever parent the operator currently has
    // selected, not necessarily the auto-detected one from the 409
    // response. Lets the operator correct a wrong domain guess (e.g.
    // domain collides with Acme but the real parent is Globex).
    // Task #292 — merge the operator's edited name in last so it wins
    // over the (often parent-flavored) scraped name in the payload.
    createVendor.mutate({
      payload: {
        ...subBrandPrompt.payload,
        name: trimmedName,
        parentVendorId: subBrandParent.id,
      },
      scrapedName: subBrandPrompt.scrapedName,
    });
  };

  useEffect(() => {
    document.body.classList.add("gt-admin");
    return () => {
      document.body.classList.remove("gt-admin");
    };
  }, []);

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  // Task #174 — server filters with ?role=maker | reseller on the same
  // GET /api/vendors endpoint. The default queryFn does queryKey.join("/")
  // so the role lives in the URL string (not a separate key segment),
  // which also keeps the Maker list and Reseller list in separate caches.
  const vendorsUrl = `/api/vendors?role=${mode}`;
  const {
    data: vendors = [],
    isLoading,
    isError: vendorsError,
    error: vendorsErrorObj,
    refetch: refetchVendors,
  } = useQuery<VendorLite[]>({
    queryKey: [vendorsUrl],
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

  const openVendor = (id: string) => navigate(`${copy.listRoute}/${id}`);

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
      <AdminFrame active={copy.active}>
        <div className="py-20 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-[var(--brand-blue)] border-t-transparent rounded-full animate-spin" />
        </div>
      </AdminFrame>
    );
  }

  if (!user?.isAdmin) {
    return (
      <AdminFrame active={copy.active}>
        <div className="py-20 text-center text-slate-500">
          You need to be signed in as an admin to view this page.
        </div>
      </AdminFrame>
    );
  }

  return (
    <AdminFrame active={copy.active}>
      <div className="space-y-5">
      <AdminPageHeader
        title={copy.title}
        subtitle={copy.subtitle}
        actions={(<>
          {searchOpen ? (
            <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-md px-2.5 h-9">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={copy.searchPlaceholder}
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
            label={copy.addLabel}
            onClick={openNewVendor}
            disabled={createVendor.isPending}
            testId="button-new-vendor"
          />
        </>)}
      />

      {isLoading ? (
        <div className="py-20 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-[var(--brand-blue)] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : vendorsError ? (
        <ErrorState
          error={vendorsErrorObj}
          onRetry={() => refetchVendors()}
          title={`Couldn't load ${copy.title.toLowerCase()}`}
          testId="admin-vendors-error"
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          searching={search.trim().length > 0}
          title={copy.emptyTitle}
          hint={copy.emptyHint}
          searchHint={copy.emptySearchHint}
          Icon={copy.Icon}
        />
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
          // Task #280 — if the sub-brand prompt is active, any close
          // gesture (X, overlay click, Esc) should behave like Back:
          // dismiss the prompt and return to the paste step with the
          // pasted URL still in place, instead of nuking the whole
          // Add flow and forcing the operator to re-type the URL.
          if (!o && subBrandPrompt) {
            setSubBrandPrompt(null);
            return;
          }
          setAddOpen(o);
          if (!o) {
            setPasteUrl("");
            setPasteError(null);
            setSubBrandPrompt(null);
          }
        }}
      >
        <DialogContent
          className="max-w-md bg-white rounded-xl border-slate-200 shadow-xl p-6 gap-4"
          data-testid="dialog-add-vendor"
        >
          <DialogHeader className="text-left space-y-1">
            <DialogTitle className="text-[17px] font-semibold text-slate-900">
              {subBrandPrompt ? "Add as a sub-brand?" : copy.addDialogTitle}
            </DialogTitle>
            <DialogDescription className="text-[13px] text-slate-500 leading-relaxed">
              {subBrandPrompt ? (
                <>
                  A vendor with that domain already exists. Add this as a
                  sub-brand of{" "}
                  <span className="font-semibold text-slate-700">
                    {(subBrandParent ?? subBrandPrompt.parent).name}
                  </span>{" "}
                  — like Epiphone under Gibson — instead of as a duplicate
                  top-level row. Pick a different parent below if the
                  detected one isn't right.
                </>
              ) : (
                <>
                  Paste a URL from the {mode === "maker" ? "maker's" : "shop's"}{" "}
                  site — the About page works best, but the home page is fine
                  too. We'll prefill name, domain, logo, cover, and bio.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {subBrandPrompt ? (
            <div className="pt-1 space-y-3" data-testid="prompt-sub-brand">
              <div className="space-y-1.5">
                <label
                  htmlFor="input-sub-brand-name"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Name
                </label>
                <input
                  id="input-sub-brand-name"
                  type="text"
                  value={subBrandName}
                  onChange={(e) => setSubBrandName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && subBrandName.trim() && subBrandParent && !createVendor.isPending) {
                      e.preventDefault();
                      confirmSubBrand();
                    }
                  }}
                  placeholder="e.g. Epiphone"
                  disabled={createVendor.isPending}
                  autoFocus
                  className="w-full h-10 px-3 rounded-md border border-slate-300 bg-white text-[13.5px] outline-none focus:border-[var(--brand-blue)] focus:ring-2 focus:ring-[var(--brand-blue)]/20 disabled:opacity-50"
                  data-testid="input-sub-brand-name"
                />
                <p className="text-[11.5px] text-slate-400">
                  Suggested from the URL — edit before confirming so the new
                  row saves with the sub-brand's name, not the parent's.
                </p>
              </div>
              <div
                className="flex items-center gap-3 rounded-xl border border-slate-200 p-3"
                data-testid="sub-brand-current-parent"
              >
                <div className="w-10 h-10 rounded-md bg-white ring-1 ring-slate-200 overflow-hidden flex items-center justify-center flex-shrink-0">
                  {(subBrandParent ?? subBrandPrompt.parent).logoUrl ? (
                    <img
                      src={(subBrandParent ?? subBrandPrompt.parent).logoUrl!}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <copy.Icon className="w-5 h-5 text-slate-300" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-slate-900 text-[13.5px] font-semibold truncate">
                    {(subBrandParent ?? subBrandPrompt.parent).name}
                  </div>
                  <div className="text-slate-400 text-[11.5px] truncate">
                    {(subBrandParent ?? subBrandPrompt.parent).domain}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSubBrandPickerOpen((o) => !o)}
                  disabled={createVendor.isPending}
                  className="px-2.5 py-1 rounded-md text-xs font-semibold bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  data-testid="button-sub-brand-change-parent"
                >
                  {subBrandPickerOpen ? "Cancel" : "Change"}
                </button>
              </div>
              {subBrandPickerOpen && (
                <div
                  className="rounded-xl border border-slate-200 p-2 space-y-2"
                  data-testid="sub-brand-parent-picker"
                >
                  <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-md px-2.5 h-8">
                    <Search className="w-3.5 h-3.5 text-slate-400" />
                    <input
                      type="text"
                      value={subBrandPickerQuery}
                      onChange={(e) => setSubBrandPickerQuery(e.target.value)}
                      placeholder="Search top-level vendors…"
                      autoFocus
                      className="flex-1 text-xs bg-transparent outline-none placeholder:text-slate-400"
                      data-testid="input-sub-brand-parent-search"
                    />
                  </div>
                  <div className="max-h-48 overflow-y-auto divide-y divide-slate-100">
                    {parentCandidates.length === 0 ? (
                      <p className="text-xs text-slate-400 py-3 text-center">
                        No matches.
                      </p>
                    ) : (
                      parentCandidates.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setSubBrandParent({
                              id: c.id,
                              name: c.name,
                              domain: c.domain,
                              logoUrl: c.logoUrl,
                            });
                            setSubBrandPickerOpen(false);
                            setSubBrandPickerQuery("");
                          }}
                          className="w-full text-left flex items-center gap-2.5 px-1.5 py-1.5 hover:bg-slate-50 rounded-md"
                          data-testid={`button-sub-brand-pick-${c.id}`}
                        >
                          <div className="w-7 h-7 rounded-md bg-white ring-1 ring-slate-200 overflow-hidden flex items-center justify-center flex-shrink-0">
                            {c.logoUrl ? (
                              <img
                                src={c.logoUrl}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <copy.Icon className="w-3.5 h-3.5 text-slate-300" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-slate-800 text-xs font-semibold truncate">
                              {c.name}
                            </div>
                            <div className="text-slate-400 text-xs truncate">
                              {c.domain}
                            </div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
              <DialogFooter className="gap-2 sm:gap-2">
                <button
                  type="button"
                  onClick={() => setSubBrandPrompt(null)}
                  disabled={createVendor.isPending}
                  className="px-3 py-1.5 rounded-md text-[12.5px] font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  data-testid="button-sub-brand-cancel"
                >
                  Back
                </button>
                <Button
                  type="button"
                  onClick={confirmSubBrand}
                  disabled={createVendor.isPending || !subBrandName.trim()}
                  size="sm"
                  className="text-[12.5px] font-semibold"
                  data-testid="button-sub-brand-confirm"
                >
                  {createVendor.isPending && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  )}
                  Add as sub-brand
                </Button>
              </DialogFooter>
            </div>
          ) : (
          <>
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
              className="w-full h-10 px-3 rounded-md border border-slate-300 bg-white text-[13.5px] outline-none focus:border-[var(--brand-blue)] focus:ring-2 focus:ring-[var(--brand-blue)]/20 disabled:opacity-50"
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
          </>
          )}
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
      className="group text-left rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md hover:border-[var(--brand-blue)]/30 transition-all p-4 flex items-center gap-3.5"
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
          className="text-slate-900 text-[13.5px] font-semibold truncate group-hover:text-[var(--brand-blue)] transition-colors"
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

function EmptyState({
  searching,
  title,
  hint,
  searchHint,
  Icon,
}: {
  searching: boolean;
  title: string;
  hint: string;
  searchHint: string;
  Icon: ComponentType<{ className?: string }>;
}) {
  return (
    <div
      className="py-16 flex flex-col items-center justify-center text-center"
      data-testid="empty-vendors"
    >
      <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
        <Icon className="w-6 h-6" />
      </div>
      <p className="text-slate-700 text-[14px] font-semibold">
        {searching ? "No matches" : title}
      </p>
      <p className="text-slate-400 text-[12.5px] mt-1 max-w-xs">
        {searching ? searchHint : hint}
      </p>
    </div>
  );
}
