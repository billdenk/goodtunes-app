import { useEffect, useRef, useState } from "react";
import { useLocation, Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Search, Factory, Clock, Loader2, X, Disc3, BadgeCheck, Truck } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { pressTurnaroundLabel } from "@/lib/pressTurnaround";
import { useAdminDark, useDarkMarkLogo } from "@/lib/adminAppearance";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { ErrorState } from "@/components/admin/AdminErrorBoundary";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminPressesDashboard } from "@/components/admin/AdminPressesDashboard";
import { AddEntityButton } from "@/components/admin/AddEntityButton";
import { ViewModeToggle, useViewMode } from "@/components/admin/ViewModeToggle";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { Manufacturer } from "@shared/schema";

// apiRequest throws errors shaped like `"502: {\"message\":\"…\"}"` — strip
// the status prefix and unwrap the JSON `message` so inline dialog errors
// read like English. Mirrors AdminLabels / AdminVendors.
function humanizeApiError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  if (!raw) {
    return "Couldn't read that page. Try the URL again, or use a plant name to create a blank entry.";
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

// Recover the duplicate-manufacturer payload the backend returns on 409
// so the "already added" inline notice can deep-link to the existing
// plant instead of just showing a generic error. Mirrors AdminLabels.
function extractDuplicateManufacturer(err: unknown): Manufacturer | null {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const m = raw.match(/^409:\s*(.*)$/);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[1]);
    if (parsed && parsed.manufacturer && typeof parsed.manufacturer.id === "string") {
      return parsed.manufacturer as Manufacturer;
    }
  } catch {
    /* not JSON — fall through */
  }
  return null;
}

/**
 * Admin · Presses (formerly Manufacturers, Task #69 / #283). One row per
 * pressing plant. Each press can be invited to bid on RFQs (see
 * AdminAlbum.RFQ section) and is the awarded plant for any album whose
 * print run was assigned to them.
 *
 * "Add press" accepts either a plant name *or* a website URL — pasting
 * a URL triggers the server scraper (mirrors Labels/Vendors/Gear) so
 * the record lands with name, domain, logo, cover, bio, and location
 * already filled in.
 *
 * Styleguide alignment (Task #283): search-toggle + ViewModeToggle +
 * grid/list renderer mirroring Labels/Makers/NPOs.
 */
function getMfrPageTab(): "dashboard" | "list" {
  const p = new URLSearchParams(window.location.search).get("tab");
  return p === "list" ? "list" : "dashboard";
}

export function AdminManufacturers() {
  useEffect(() => {
    document.body.classList.add("gt-admin");
    return () => document.body.classList.remove("gt-admin");
  }, []);
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const [pageTab, setPageTabRaw] = useState<"dashboard" | "list">(getMfrPageTab);
  const setPageTab = (t: "dashboard" | "list") => {
    setPageTabRaw(t);
    const params = new URLSearchParams(window.location.search);
    params.set("tab", t);
    history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  };
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useViewMode("presses");
  // Task #916 — capability filter. A press can do more than one thing, so this
  // narrows the list to a single capability without hiding multi-capability
  // rows from the others. Fulfillment stays its own nav, so the segmented
  // control only offers All / Vinyl / GoodDeeds here.
  const [capFilter, setCapFilter] = useState<"all" | "vinyl" | "gooddeed">("all");
  const [addOpen, setAddOpen] = useState(false);
  const [draftInput, setDraftInput] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<Manufacturer | null>(null);
  const { toast } = useToast();

  const {
    data: rows = [],
    isLoading,
    isError: rowsError,
    error: rowsErrorObj,
    refetch: refetchRows,
  } = useQuery<Manufacturer[]>({
    queryKey: ["/api/manufacturers"],
    enabled: !!user?.isAdmin,
  });

  const create = useMutation({
    mutationFn: async (input: string) => {
      const trimmed = input.trim();
      let payload: Record<string, unknown> = { name: trimmed };
      let scrapedName: string | null = null;
      if (/^https?:\/\//i.test(trimmed)) {
        const sr = await apiRequest("POST", "/api/admin/manufacturers/scrape", { url: trimmed });
        const scraped = (await sr.json()) as {
          name: string | null;
          domain: string | null;
          logoUrl: string | null;
          coverUrl: string | null;
          bio: string | null;
          location: string | null;
          websiteUrl: string | null;
        };
        scrapedName = scraped.name;
        payload = {
          name: scraped.name || new URL(trimmed).hostname.replace(/^www\./, ""),
          ...(scraped.domain ? { domain: scraped.domain } : {}),
          ...(scraped.logoUrl ? { logoUrl: scraped.logoUrl } : {}),
          ...(scraped.coverUrl ? { coverUrl: scraped.coverUrl } : {}),
          ...(scraped.bio ? { bio: scraped.bio } : {}),
          ...(scraped.location ? { location: scraped.location } : {}),
          ...(scraped.websiteUrl ? { websiteUrl: scraped.websiteUrl } : {}),
        };
      }
      const r = await apiRequest("POST", "/api/admin/manufacturers", payload);
      const m = (await r.json()) as Manufacturer;
      return { m, scrapedName };
    },
    onSuccess: ({ m, scrapedName }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/manufacturers"] });
      setAddOpen(false);
      setDraftInput("");
      setPasteError(null);
      setDuplicate(null);
      if (scrapedName) {
        toast({
          title: `Pulled "${scrapedName}"`,
          description: "Review and edit on the detail page.",
        });
      }
      navigate(`/admin/manufacturers/${m.id}`);
    },
    onError: (err: any) => {
      const dup = extractDuplicateManufacturer(err);
      if (dup) {
        setDuplicate(dup);
        setPasteError(null);
      } else {
        setDuplicate(null);
        setPasteError(humanizeApiError(err));
      }
    },
  });

  const submit = () => {
    if (create.isPending) return;
    const trimmed = draftInput.trim();
    if (!trimmed) {
      setPasteError("Enter a plant name or paste their website URL.");
      return;
    }
    setPasteError(null);
    setDuplicate(null);
    create.mutate(trimmed);
  };

  if (authLoading) {
    return (
      <AdminFrame active="manufacturers">
        <div className="py-20 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-[var(--brand-blue)] border-t-transparent rounded-full animate-spin" />
        </div>
      </AdminFrame>
    );
  }
  if (!user?.isAdmin) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-8">
        <p className="text-slate-500 text-sm">Admin only.</p>
      </main>
    );
  }

  const filtered = rows.filter((r) => {
    const matchesSearch = search
      ? (r.name + " " + (r.location ?? "")).toLowerCase().includes(search.toLowerCase())
      : true;
    const matchesCap =
      capFilter === "all"
        ? true
        : capFilter === "vinyl"
          ? r.doesVinyl
          : r.doesGoodDeed;
    return matchesSearch && matchesCap;
  });

  const inputLooksLikeUrl = /^https?:\/\//i.test(draftInput.trim());

  return (
    <AdminFrame active="manufacturers">
      <div className="space-y-5">
        <div
          className="inline-flex items-center bg-[var(--apple-track)] rounded-full p-0.5"
          role="tablist"
          data-testid="tabs-section-manufacturers"
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
            Presses
          </button>
        </div>

        {pageTab === "dashboard" && <AdminPressesDashboard />}

        {pageTab === "list" && (<>
        <AdminPageHeader
          title="Presses"
          subtitle="Vinyl pressing plants and duplication houses. Invite them to bid on print runs."
          actions={
            <>
              {searchOpen ? (
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                  <input
                    ref={searchInputRef}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onBlur={() => {
                      if (!search) setSearchOpen(false);
                    }}
                    placeholder="Search presses"
                    autoFocus
                    className="h-9 w-56 pl-8 pr-8 rounded-md border border-[var(--apple-hairline)] bg-white text-xs focus:outline-none focus:border-[var(--brand-blue)]"
                    data-testid="input-search-manufacturers"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setSearch("");
                      setSearchOpen(false);
                    }}
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 inline-flex items-center justify-center text-[var(--apple-faint)] hover:text-[var(--apple-subink)]"
                    aria-label="Clear search"
                    data-testid="button-clear-search"
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
              {/* Task #916 — capability filter (All / Vinyl / GoodDeeds).
                  slate-100 segmented control, matching ViewModeToggle. */}
              <div
                className="inline-flex items-center rounded-full bg-[var(--apple-track)] p-0.5"
                data-testid="filter-capability"
              >
                {([
                  { key: "all", label: "All" },
                  { key: "vinyl", label: "Vinyl" },
                  { key: "gooddeed", label: "GoodDeeds" },
                ] as const).map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setCapFilter(opt.key)}
                    className={[
                      "h-8 px-2.5 rounded-full text-xs font-semibold transition-colors",
                      capFilter === opt.key
                        ? "bg-white text-[var(--apple-ink)] shadow-sm"
                        : "text-[var(--apple-subink)]",
                    ].join(" ")}
                    data-testid={`filter-capability-${opt.key}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <ViewModeToggle
                value={view}
                onChange={setView}
                testIdPrefix="view-mode-presses"
              />
              <AddEntityButton
                label="Add Press"
                onClick={() => setAddOpen(true)}
                testId="button-add-manufacturer"
              />
            </>
          }
        />

        {isLoading ? (
          <div className="py-10 text-slate-500 text-sm">Loading…</div>
        ) : rowsError ? (
          <ErrorState
            error={rowsErrorObj}
            onRetry={() => refetchRows()}
            title="Couldn't load presses"
            testId="admin-manufacturers-error"
          />
        ) : filtered.length === 0 ? (
          <AdminEmptyState testId="empty-manufacturers">
            {search.trim()
              ? "No presses match that search."
              : "No presses yet. Add your first pressing plant to start collecting quotes."}
          </AdminEmptyState>
        ) : view === "grid" ? (
          <div
            className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
            data-testid="grid-manufacturers"
          >
            {filtered.map((m) => (
              <PressCard key={m.id} press={m} />
            ))}
          </div>
        ) : (
          <div
            className="rounded-2xl border border-[var(--apple-hairline)] bg-white divide-y divide-[var(--apple-hairline)] overflow-hidden"
            data-testid="list-manufacturers"
          >
            {filtered.map((m) => (
              <PressRow key={m.id} press={m} />
            ))}
          </div>
        )}
        </>)}
      </div>

      <Dialog
        open={addOpen}
        onOpenChange={(o) => {
          if (create.isPending) return;
          setAddOpen(o);
          if (!o) {
            setDraftInput("");
            setPasteError(null);
            setDuplicate(null);
          }
        }}
      >
        <DialogContent
          className="max-w-md bg-white rounded-2xl overflow-hidden border border-[var(--apple-hairline)] shadow-xl p-6 gap-4"
          data-testid="dialog-add-manufacturer"
        >
          <DialogHeader className="text-left space-y-1">
            <DialogTitle className="text-[17px] font-semibold text-[var(--apple-ink)]">
              Add Press
            </DialogTitle>
            <DialogDescription className="text-sm text-[var(--apple-subink)] leading-relaxed">
              Paste the plant's website — we'll prefill name, domain, logo,
              cover, and bio from the page's Open Graph metadata. Or just
              type the name to create a blank entry.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 pt-1">
            <input
              autoFocus
              value={draftInput}
              onChange={(e) => {
                setDraftInput(e.target.value);
                if (pasteError) setPasteError(null);
                if (duplicate) setDuplicate(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="https://memphisrecordpressing.com  or  Pirates Press"
              disabled={create.isPending}
              className="w-full h-10 px-3 rounded-md border border-[var(--apple-hairline)] bg-white text-sm outline-none focus:border-[var(--brand-blue)] focus:ring-2 focus:ring-[var(--brand-blue)]/20 disabled:opacity-50"
              data-testid="input-new-manufacturer-name"
            />
            {duplicate && (
              <div
                className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
                data-testid="text-add-manufacturer-duplicate"
              >
                <span className="font-semibold">{duplicate.name}</span> is
                already in your Presses list.{" "}
                <button
                  type="button"
                  onClick={() => {
                    setAddOpen(false);
                    navigate(`/admin/manufacturers/${duplicate.id}`);
                  }}
                  className="underline underline-offset-2 hover:text-[var(--brand-blue)] transition-colors font-semibold"
                  data-testid="button-open-existing-manufacturer"
                >
                  Open it →
                </button>
              </div>
            )}
            {pasteError && (
              <p
                className="text-xs text-red-600"
                data-testid="text-add-manufacturer-error"
              >
                {pasteError}
              </p>
            )}
            <p className="text-xs text-[var(--apple-faint)]">
              {inputLooksLikeUrl
                ? "Reads the page's Open Graph metadata and rehosts the logo + cover."
                : "Paste an https:// URL to auto-fill, or enter a name to create blank."}
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)} disabled={create.isPending}>
              Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={!draftInput.trim() || create.isPending}
              data-testid="button-confirm-add-manufacturer"
            >
              {create.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {create.isPending
                ? inputLooksLikeUrl
                  ? "Reading…"
                  : "Adding…"
                : inputLooksLikeUrl
                  ? "Pull from URL"
                  : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminFrame>
  );
}

// Task #916 — per-card capability chips. Renders one small slate pill per
// active capability so the operator can see at a glance what each press does
// (a single row can carry all three). Empty when, somehow, none are set.
const CAPABILITY_CHIPS = [
  { key: "doesVinyl" as const, label: "Vinyl", icon: Disc3 },
  { key: "doesGoodDeed" as const, label: "GoodDeeds", icon: BadgeCheck },
  { key: "doesFulfillment" as const, label: "Fulfillment", icon: Truck },
];

function CapabilityChips({ press, className = "" }: { press: Manufacturer; className?: string }) {
  const active = CAPABILITY_CHIPS.filter((c) => Boolean(press[c.key]));
  if (active.length === 0) return null;
  return (
    <TooltipProvider delayDuration={300}>
      <span className={`inline-flex flex-nowrap items-center gap-1 ${className}`}>
        {active.map((c) => {
          const Icon = c.icon;
          return (
            <Tooltip key={c.key}>
              <TooltipTrigger asChild>
                <span
                  role="img"
                  aria-label={c.label}
                  tabIndex={0}
                  className="inline-flex items-center justify-center w-6 h-6 rounded bg-slate-100 text-slate-600 cursor-default focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                  data-testid={`chip-capability-${c.key}-${press.id}`}
                >
                  <Icon className="w-3.5 h-3.5" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">
                {c.label}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </span>
    </TooltipProvider>
  );
}

/** Dark-mode logo treatment shared by the card + row tiles: a near-black
 * mark on the charcoal card is invisible, so invert it to white (same
 * pixel-sampled heuristic the press detail header uses). Colored/light
 * logos are left untouched. */
function usePressLogoInvert(logoUrl: string | null): boolean {
  const dark = useAdminDark();
  const darkMark = useDarkMarkLogo(logoUrl);
  return dark && darkMark;
}

function PressCard({ press }: { press: Manufacturer }) {
  const invertLogo = usePressLogoInvert(press.logoUrl);
  // Task #1962 — every grid card reserves the same footprint regardless of
  // how much optional metadata it carries (location, turnaround label,
  // capability chips). The richest case (logo + name + location + turnaround
  // + chips) needs ~118px of content; `min-h-[8rem]` reserves that room so a
  // metadata-rich press (Memphis) and a sparse one (Hoover) sit at the same
  // height side by side, with lighter cards centering into the same box.
  return (
    <Link
      href={`/admin/manufacturers/${press.id}`}
      className="group text-left rounded-2xl bg-white border border-[var(--apple-hairline)] hover:shadow-md hover:border-[var(--brand-blue)]/30 transition-all p-4 min-h-[8rem] flex items-center gap-3.5 underline-offset-2"
      data-testid={`card-manufacturer-${press.id}`}
    >
      <div className="w-14 h-14 rounded-xl overflow-hidden bg-white ring-1 ring-[var(--apple-hairline)] flex items-center justify-center flex-shrink-0">
        {press.logoUrl ? (
          <img
            src={press.logoUrl}
            alt={press.name}
            className="w-full h-full object-cover"
            style={invertLogo ? { filter: "invert(1) brightness(1.7)" } : undefined}
          />
        ) : (
          <Factory className="w-6 h-6 text-slate-300" strokeWidth={1.5} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div
          className="text-slate-900 text-sm font-semibold leading-tight truncate"
          data-testid={`text-manufacturer-name-${press.id}`}
        >
          {press.name}
        </div>
        <div className="text-slate-400 text-xs truncate mt-0.5">
          {press.location || press.domain || "—"}
        </div>
        {(() => {
          const label = pressTurnaroundLabel(press);
          if (!label) return null;
          return (
            <div className="text-slate-500 text-xs mt-1 inline-flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {label}
            </div>
          );
        })()}
        <CapabilityChips press={press} className="mt-1.5" />
      </div>
    </Link>
  );
}

function PressRow({ press }: { press: Manufacturer }) {
  const invertLogo = usePressLogoInvert(press.logoUrl);
  return (
    <Link
      href={`/admin/manufacturers/${press.id}`}
      className="block px-4 py-3 hover:bg-[var(--apple-track)] transition-colors underline-offset-2"
      data-testid={`row-manufacturer-${press.id}`}
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-md bg-[var(--apple-track)] flex items-center justify-center overflow-hidden flex-shrink-0">
          {press.logoUrl ? (
            <img
              src={press.logoUrl}
              alt=""
              className="w-full h-full object-cover"
              style={invertLogo ? { filter: "invert(1) brightness(1.7)" } : undefined}
            />
          ) : (
            <Factory className="w-5 h-5 text-slate-400" strokeWidth={1.5} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-slate-900 text-sm font-medium truncate">{press.name}</div>
          <div className="text-slate-500 text-xs truncate">
            {press.location || press.domain || "—"}
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <CapabilityChips press={press} className="hidden sm:inline-flex" />
          {(() => {
            const label = pressTurnaroundLabel(press);
            if (!label) return null;
            return (
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {label}
              </span>
            );
          })()}
          {press.specialties.length > 0 && (
            <span className="hidden sm:inline-flex gap-1">
              {press.specialties.slice(0, 3).map((s) => (
                <span key={s} className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                  {s}
                </span>
              ))}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
