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
    | "pressingOrder";
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
  { kind: "page", id: "reports", title: "Reports", badge: "Page", href: "/admin/reports" },
  { kind: "page", id: "platform-pricing", title: "Platform pricing", badge: "Page", href: "/admin/platform-pricing" },
];

const RECENT_KEY_PREFIX = "gt:admin-search-recent:";
const RECENT_MAX = 5;

type Recent = Pick<SearchResult, "kind" | "id" | "title" | "href" | "badge">;

function recentKey(userId: string | undefined | null): string | null {
  if (!userId) return null;
  return `${RECENT_KEY_PREFIX}${userId}`;
}

function readRecents(userId: string | undefined | null): Recent[] {
  if (typeof window === "undefined") return [];
  const key = recentKey(userId);
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

function pushRecent(userId: string | undefined | null, entry: Recent) {
  if (typeof window === "undefined") return;
  const key = recentKey(userId);
  if (!key) return;
  try {
    const existing = readRecents(userId).filter(
      (r) => !(r.kind === entry.kind && r.id === entry.id),
    );
    const next = [entry, ...existing].slice(0, RECENT_MAX);
    window.localStorage.setItem(key, JSON.stringify(next));
  } catch {}
}

// Apple/Linear-style command palette: type is conveyed by a small
// monochrome leading icon in a fixed gutter, not by a trailing "Page"
// chip. Every searchable kind maps to one calm Lucide glyph; the icon
// gutter keeps recents (mixed types under one header) and live results
// scannable at a glance.
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
};

// Group order in the dropdown. Pages always sit at the top so an admin
// hunting for a tab finds it on the first row.
const GROUP_ORDER: Array<{ key: keyof ServerPayload | "pages"; label: string }> = [
  { key: "pages", label: "Pages" },
  { key: "people", label: "People" },
  { key: "vendors", label: "Makers & Resellers" },
  { key: "labels", label: "Labels" },
  { key: "nonprofits", label: "NPOs" },
  { key: "albums", label: "Albums" },
  { key: "gear", label: "Gear" },
  { key: "customers", label: "Customers" },
  { key: "manufacturers", label: "Presses" },
  { key: "fulfillment", label: "Fulfillment" },
  { key: "songs", label: "Songs" },
  { key: "playlists", label: "Playlists" },
  { key: "fanOrders", label: "Fan orders" },
  { key: "pressingOrders", label: "Press Orders" },
];

export function AdminSearchBar({ registerShortcut = true }: { registerShortcut?: boolean } = {}) {
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

  // Recents are user-scoped — re-read whenever the logged-in admin
  // changes so we never bleed one admin's recents into another's
  // session on a shared browser.
  useEffect(() => {
    setRecents(readRecents(userId));
  }, [userId]);

  // ~150ms debounce — keeps the API quiet while the admin is mid-word.
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(query.trim()), 150);
    return () => window.clearTimeout(id);
  }, [query]);

  // ⌘K / Ctrl-K from anywhere in the admin shell focuses (and opens)
  // the search box. Esc on the box returns focus to the rest of the
  // page. AdminFrame mounts two copies (sidebar + mobile header) so
  // only the desktop instance registers the shortcut to avoid two
  // listeners racing for focus/open state.
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

  // Outside click closes the popover. The input stays mounted because
  // it lives inside the sidebar — only the dropdown is dismissed.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // Close on route change (sidebar nav, recent click, programmatic
  // navigation, etc.).
  const [location] = useLocation();
  useEffect(() => {
    setOpen(false);
    // Remember the page the admin actually landed on so the recent
    // list is useful on first open of a new session. We only stamp
    // top-level admin nav pages here; detail navigations from the
    // dropdown stamp themselves on select.
    const match = NAV_PAGES.find((p) => p.href === location);
    if (match) pushRecent(userId, { kind: match.kind, id: match.id, title: match.title, href: match.href, badge: match.badge });
    setRecents(readRecents(userId));
  }, [location, userId]);

  // Custom queryFn — the default joins queryKey with "/", which would
  // request `/api/admin/search/<term>` (no such route). We need the
  // `?q=` querystring shape the backend exposes.
  const { data, isFetching } = useQuery<ServerPayload>({
    queryKey: ["/api/admin/search", debounced],
    enabled: debounced.length >= 1,
    staleTime: 30_000,
    queryFn: async () => {
      const url = `/api/admin/search?q=${encodeURIComponent(debounced)}&limit=5`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
  });

  // Local nav-page matches — instant, no network. Case-insensitive
  // substring on the static label.
  const pageMatches = useMemo(() => {
    const q = debounced.toLowerCase();
    if (!q) return [];
    return NAV_PAGES.filter((p) => p.title.toLowerCase().includes(q)).slice(0, 5);
  }, [debounced]);

  // Flatten everything into a single ordered list (so ↑/↓ + Enter has
  // one canonical index) but keep the group boundaries so the render
  // pass can drop in the headings.
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
    pushRecent(userId, { kind: r.kind, id: r.id, title: r.title, href: r.href, badge: r.badge });
    setRecents(readRecents(userId));
    setOpen(false);
    setQuery("");
    setDebounced("");
    navigate(r.href);
  }, [navigate, userId]);

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

  // Render the ⌘K hint only on desktop (where the shortcut works
  // reliably and the sidebar has room). Mobile uses the magnifying
  // glass as the visible affordance instead.
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

  let flatIndex = -1;
  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search admin…"
          aria-label="Search admin"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls="admin-search-results"
          data-testid="input-admin-search"
          className="w-full h-8 pl-8 pr-12 rounded-md bg-slate-100 text-sm text-slate-900 placeholder-slate-400 outline-none focus:ring-2 focus:ring-[var(--brand-blue)] focus:bg-white focus:border focus:border-slate-200 transition-colors"
        />
        <kbd className="hidden lg:flex absolute right-2 top-1/2 -translate-y-1/2 items-center h-5 px-1.5 rounded text-xs font-medium text-slate-400 bg-white border border-slate-200 pointer-events-none">
          {isMac ? "⌘K" : "Ctrl K"}
        </kbd>
      </div>

      {open && (
        <div
          id="admin-search-results"
          role="listbox"
          aria-label="Admin search results"
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
                      // Type is read from the leading icon + section
                      // header; no per-row "Page" chip or trailing type
                      // label (Apple/Linear command-palette pattern).
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
