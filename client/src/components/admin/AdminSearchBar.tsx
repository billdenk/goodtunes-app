import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  FileText,
  User,
  Store,
  Tag,
  HeartHandshake,
  Disc3,
  Guitar,
  Users,
  UserCheck,
  Factory,
  Truck,
  Music,
  ListMusic,
  ShoppingBag,
  ClipboardList,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

// Task #336 — Global admin search.
// Sits at the top of the admin sidebar (above Dashboard) and serves
// as the keyboard-first navigator across every admin entity. Static
// nav matches are computed locally from the same nav config the
// sidebar renders; record matches come from /api/admin/search with a
// ~150ms debounce so we don't spam the API per keystroke. ⌘K / Ctrl-K
// opens/focuses it from anywhere in the admin shell.
//
// Task #2600 — Partner portal scoped search. Three optional props extend
// this for partner portals:
//   • searchEndpoint — URL to hit instead of /api/admin/search.
//   • navPages       — Replaces NAV_PAGES entirely. Pass the portal's own
//                      tab definitions (with portal-relative hrefs) so page
//                      shortcuts navigate to the right place in the portal.
//   • placeholder    — Input placeholder; defaults to "Search admin…".

export type SearchResult = {
  kind:
    | "page"
    | "person"
    | "vendor"
    | "label"
    | "nonprofit"
    | "album"
    | "gear"
    | "customer"
    | "manufacturer"
    | "fulfillment"
    | "song"
    | "playlist"
    | "fanOrder"
    | "pressingOrder"
    | "teamAccount";
  id: string;
  title: string;
  subtitle?: string | null;
  badge?: string;
  href: string;
};

type ServerPayload = {
  people: SearchResult[];
  vendors: SearchResult[];
  labels: SearchResult[];
  nonprofits: SearchResult[];
  albums: SearchResult[];
  gear: SearchResult[];
  customers: SearchResult[];
  manufacturers: SearchResult[];
  fulfillment: SearchResult[];
  songs: SearchResult[];
  playlists: SearchResult[];
  fanOrders: SearchResult[];
  pressingOrders: SearchResult[];
  teamAccounts?: SearchResult[];
};

// Static nav config — mirrors AdminFrame's sidebar order. Keeping the
// list inline (instead of importing from AdminFrame) avoids a circular
// import; the cost is one place to update when a new tab ships.
const NAV_PAGES: SearchResult[] = [
  { kind: "page", id: "dashboard", title: "Dashboard", badge: "Page", href: "/admin/dashboard" },
  { kind: "page", id: "albums", title: "Albums", badge: "Page", href: "/admin/albums" },
  { kind: "page", id: "people", title: "People", badge: "Page", href: "/admin/people" },
  { kind: "page", id: "labels", title: "Labels", badge: "Page", href: "/admin/labels" },
  { kind: "page", id: "nonprofits", title: "NPOs", badge: "Page", href: "/admin/non-profits" },
  { kind: "page", id: "gear", title: "Gear", badge: "Page", href: "/admin/instruments" },
  { kind: "page", id: "manufacturers", title: "Presses", badge: "Page", href: "/admin/manufacturers" },
  { kind: "page", id: "makers", title: "Makers", badge: "Page", href: "/admin/makers" },
  { kind: "page", id: "vendors", title: "Resellers", badge: "Page", href: "/admin/vendors" },
  { kind: "page", id: "fulfillment", title: "Fulfillment", badge: "Page", href: "/admin/fulfillment-partners" },
  { kind: "page", id: "pressing-orders", title: "Press Orders", badge: "Page", href: "/admin/pressing-orders" },
  { kind: "page", id: "fan-orders", title: "Fan orders", badge: "Page", href: "/admin/fan-orders" },
  { kind: "page", id: "jobs", title: "Jobs", badge: "Page", href: "/admin/jobs" },
  { kind: "page", id: "customers", title: "Customers", badge: "Page", href: "/admin/customers" },
  { kind: "page", id: "team-accounts", title: "Team accounts", badge: "Page", href: "/admin/team-accounts" },
  { kind: "page", id: "reports", title: "Reports", badge: "Page", href: "/admin/reports" },
  { kind: "page", id: "platform-pricing", title: "Platform pricing", badge: "Page", href: "/admin/platform-pricing" },
];

// Derive a short stable token from a URL for use in the localStorage key.
// "/api/partner/search" → "partner-search", "/api/admin/search" → "admin"
function scopeTokenFromEndpoint(endpoint: string): string {
  if (endpoint === "/api/admin/search") return "admin";
  const last = endpoint.split("/").filter(Boolean).slice(-2).join("-");
  return last || "admin";
}

const RECENT_KEY_PREFIX = "gt:admin-search-recent:";
const RECENT_MAX = 5;

type Recent = Pick<SearchResult, "kind" | "id" | "title" | "href" | "badge">;

function recentKey(
  userId: string | undefined | null,
  scopeToken: string,
): string | null {
  if (!userId) return null;
  return `${RECENT_KEY_PREFIX}${scopeToken}:${userId}`;
}

function readRecents(
  userId: string | undefined | null,
  scopeToken: string,
): Recent[] {
  if (typeof window === "undefined") return [];
  const key = recentKey(userId, scopeToken);
  if (!key) return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

function pushRecent(
  userId: string | undefined | null,
  scopeToken: string,
  entry: Recent,
) {
  if (typeof window === "undefined") return;
  const key = recentKey(userId, scopeToken);
  if (!key) return;
  try {
    const existing = readRecents(userId, scopeToken).filter(
      (r) => !(r.kind === entry.kind && r.id === entry.id),
    );
    const next = [entry, ...existing].slice(0, RECENT_MAX);
    window.localStorage.setItem(key, JSON.stringify(next));
  } catch {}
}

// Apple/Linear-style command palette: type is conveyed by a small
// monochrome leading icon in a fixed gutter, not by a trailing chip.
// Every searchable kind maps to one calm Lucide glyph.
const KIND_ICON: Record<SearchResult["kind"], LucideIcon> = {
  page: FileText,
  person: User,
  vendor: Store,
  label: Tag,
  nonprofit: HeartHandshake,
  album: Disc3,
  gear: Guitar,
  customer: Users,
  manufacturer: Factory,
  fulfillment: Truck,
  song: Music,
  playlist: ListMusic,
  fanOrder: ShoppingBag,
  pressingOrder: ClipboardList,
  teamAccount: UserCheck,
};

// Group order in the dropdown. Pages always sit at the top.
const GROUP_ORDER: Array<{ key: keyof ServerPayload | "pages"; label: string }> = [
  { key: "pages", label: "Pages" },
  { key: "people", label: "People" },
  { key: "vendors", label: "Makers & Resellers" },
  { key: "labels", label: "Labels" },
  { key: "nonprofits", label: "NPOs" },
  { key: "albums", label: "Albums" },
  { key: "gear", label: "Gear" },
  { key: "customers", label: "Customers" },
  { key: "teamAccounts", label: "Team accounts" },
  { key: "manufacturers", label: "Presses" },
  { key: "fulfillment", label: "Fulfillment" },
  { key: "songs", label: "Songs" },
  { key: "playlists", label: "Playlists" },
  { key: "fanOrders", label: "Fan orders" },
  { key: "pressingOrders", label: "Press Orders" },
];

export function AdminSearchBar({
  registerShortcut = true,
  searchEndpoint = "/api/admin/search",
  navPages,
  placeholder = "Search admin…",
  recentScopeKey,
  allowedNavIds,
}: {
  registerShortcut?: boolean;
  /**
   * Override the search API endpoint. Defaults to `/api/admin/search`.
   * Pass `/api/partner/search` for partner portals so results are
   * scoped to the caller's role.
   */
  searchEndpoint?: string;
  /**
   * Explicit localStorage scope key for recently-visited entries.
   * When provided, overrides the scope token derived from `searchEndpoint`
   * so two different portals sharing the same endpoint (e.g. artist portal
   * and label portal both using /api/partner/search) keep separate recent
   * histories. Should be a stable, human-opaque string like `artist:<id>`.
   */
  recentScopeKey?: string;
  /**
   * Filter built-in NAV_PAGES to only the IDs listed here. Ignored when
   * `navPages` is also provided (navPages takes precedence). Use this for
   * lightweight filtering of the default admin page list.
   */
  allowedNavIds?: string[];
  /**
   * Custom page definitions to use as instant page shortcuts instead of
   * the default NAV_PAGES list. Pass the portal's own tab pages (with
   * portal-relative hrefs such as `/artist?tab=catalog`) so clicking a
   * shortcut actually lands on the right section of the portal, not on
   * an /admin/* route the partner may not see.
   */
  navPages?: SearchResult[];
  /** Input placeholder text. Defaults to "Search admin…". */
  placeholder?: string;
} = {}) {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const userId = user?.id;
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [recents, setRecents] = useState<Recent[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Resolve the effective set of page shortcuts.
  // Priority: explicit navPages > allowedNavIds-filtered NAV_PAGES > all NAV_PAGES.
  // navPages provides portal-specific hrefs (e.g. /artist?tab=catalog);
  // allowedNavIds is a lightweight filter on the default admin NAV_PAGES list.
  const effectiveNavPages = navPages
    ?? (allowedNavIds ? NAV_PAGES.filter((p) => allowedNavIds.includes(p.id)) : NAV_PAGES);

  // Stable scope token derived from the endpoint — used to namespace the
  // localStorage recently-visited key so partner and super-admin histories
  // never bleed into each other on a shared browser. When the caller
  // supplies an explicit recentScopeKey (e.g. "artist:<id>"), use that
  // instead of the endpoint-derived token so multiple portals that share
  // the same endpoint keep separate recent histories per entity.
  const scopeToken = useMemo(
    () => recentScopeKey ?? scopeTokenFromEndpoint(searchEndpoint),
    [recentScopeKey, searchEndpoint],
  );

  // Recents are user + scope scoped — re-read whenever the logged-in admin
  // or the scope changes so we never bleed one admin's recents into another's
  // session on a shared browser.
  useEffect(() => {
    setRecents(readRecents(userId, scopeToken));
  }, [userId, scopeToken]);

  // ~150ms debounce — keeps the API quiet while the admin is mid-word.
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(query.trim()), 150);
    return () => window.clearTimeout(id);
  }, [query]);

  // ⌘K / Ctrl-K from anywhere in the shell focuses (and opens) the search
  // box. Esc on the box returns focus to the rest of the page.
  // AdminFrame mounts two copies (sidebar + mobile header) so only the
  // desktop instance registers the shortcut to avoid two listeners racing.
  useEffect(() => {
    if (!registerShortcut) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [registerShortcut]);

  // Outside click closes the popover.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // Close on route change; stamp recently-visited for top-level nav pages.
  const [location] = useLocation();
  useEffect(() => {
    setOpen(false);
    const match = effectiveNavPages.find((p) => p.href === location);
    if (match) pushRecent(userId, scopeToken, { kind: match.kind, id: match.id, title: match.title, href: match.href, badge: match.badge });
    setRecents(readRecents(userId, scopeToken));
  }, [location, userId, scopeToken]); // eslint-disable-line react-hooks/exhaustive-deps

  // Custom queryFn — the default joins queryKey with "/", which would
  // request `/api/admin/search/<term>` (no such route). We need the
  // `?q=` querystring shape the backend exposes.
  const { data, isFetching } = useQuery<ServerPayload>({
    queryKey: [searchEndpoint, debounced],
    enabled: debounced.length >= 1,
    staleTime: 30_000,
    queryFn: async () => {
      const url = `${searchEndpoint}?q=${encodeURIComponent(debounced)}&limit=5`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
  });

  // Local nav-page matches — instant, no network. Case-insensitive substring.
  const pageMatches = useMemo(() => {
    const q = debounced.toLowerCase();
    if (!q) return [];
    return effectiveNavPages.filter((p) => p.title.toLowerCase().includes(q)).slice(0, 5);
  }, [debounced, effectiveNavPages]);

  // Flatten everything into a single ordered list for ↑/↓ + Enter.
  const groups: Array<{ key: string; label: string; items: SearchResult[] }> = useMemo(() => {
    if (!debounced) {
      if (recents.length === 0) return [];
      return [{
        key: "recent",
        label: "Recently visited",
        items: recents.map((r) => ({
          kind: r.kind,
          id: r.id,
          title: r.title,
          href: r.href,
          badge: r.badge,
        })),
      }];
    }
    const out: Array<{ key: string; label: string; items: SearchResult[] }> = [];
    for (const g of GROUP_ORDER) {
      const items = g.key === "pages" ? pageMatches : (data?.[g.key] ?? []);
      if (items.length > 0) out.push({ key: String(g.key), label: g.label, items });
    }
    return out;
  }, [debounced, recents, pageMatches, data]);

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  useEffect(() => { setActiveIndex(0); }, [debounced, recents.length]);

  const onSelect = useCallback((r: SearchResult) => {
    pushRecent(userId, scopeToken, { kind: r.kind, id: r.id, title: r.title, href: r.href, badge: r.badge });
    setRecents(readRecents(userId, scopeToken));
    setOpen(false);
    setQuery("");
    setDebounced("");
    navigate(r.href);
  }, [navigate, userId, scopeToken]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(0, flat.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = flat[activeIndex];
      if (r) onSelect(r);
    }
  };

  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

  let flatIndex = -1;
  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-label="Search"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls="admin-search-results"
          data-testid="input-admin-search"
          className="w-full h-9 pl-9 pr-12 rounded-full bg-white border border-[var(--apple-hairline)] text-[13px] text-[var(--apple-ink)] placeholder-slate-400 outline-none focus:ring-2 focus:ring-[var(--brand-blue)] transition-colors"
        />
        <kbd className="flex absolute right-2 top-1/2 -translate-y-1/2 items-center h-5 px-1.5 rounded-md text-[10px] font-medium text-slate-400 bg-slate-50 border border-slate-200 pointer-events-none">
          ⌘K
        </kbd>
      </div>

      {open && (
        <div
          id="admin-search-results"
          role="listbox"
          aria-label="Search results"
          className="absolute left-0 right-0 top-full mt-1 z-50 max-h-[60vh] overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg"
          data-testid="admin-search-dropdown"
        >
          {groups.length === 0 ? (
            <div className="px-3 py-4 text-sm text-slate-500" data-testid="text-admin-search-empty">
              {isFetching ? "Searching…" : debounced ? `No matches for "${debounced}"` : "Start typing to search"}
            </div>
          ) : (
            <>
              {isFetching && debounced && (
                <div className="px-3 py-1 text-xs font-medium tracking-wide text-slate-400">
                  Searching…
                </div>
              )}
              {groups.map((g) => (
                <div key={g.key} data-testid={`group-${g.key}`}>
                  <div className="px-3 pt-2 pb-1 text-xs font-medium tracking-wide text-slate-400">
                    {g.label}
                  </div>
                  <ul className="pb-1">
                    {g.items.map((r) => {
                      flatIndex += 1;
                      const isActive = flatIndex === activeIndex;
                      const KindIcon = KIND_ICON[r.kind] ?? FileText;
                      return (
                        <li key={`${r.kind}-${r.id}`}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={isActive}
                            onMouseEnter={() => setActiveIndex(flatIndex)}
                            onMouseDown={(e) => { e.preventDefault(); onSelect(r); }}
                            data-testid={`result-${r.kind}-${r.id}`}
                            className={[
                              "w-full text-left px-3 py-1.5 flex items-center gap-2.5 text-sm transition-colors",
                              isActive ? "bg-slate-100" : "hover:bg-slate-50",
                            ].join(" ")}
                          >
                            <span className="flex-shrink-0 flex w-4 items-center justify-center text-slate-400">
                              <KindIcon className="w-4 h-4" />
                            </span>
                            <span className="flex-1 min-w-0">
                              <span className="block truncate text-slate-900">{r.title}</span>
                              {r.subtitle && (
                                <span className="block truncate text-xs text-slate-500">
                                  {r.subtitle}
                                </span>
                              )}
                            </span>
                            {isActive && (
                              <span
                                className="flex-shrink-0 text-slate-400 text-sm leading-none"
                                aria-hidden="true"
                              >
                                ↵
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
