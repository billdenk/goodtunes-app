import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Link2, Plus, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Spinner } from "@/components/ui/Spinner";

export const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "super_admin", label: "Super Admin (full access)" },
  { value: "label", label: "Label" },
  { value: "manager", label: "Manager" },
  { value: "artist", label: "Artist" },
  { value: "manufacturer", label: "Manufacturer" },
  { value: "fulfillment", label: "Fulfillment Partner" },
  { value: "non_profit", label: "Non-profit" },
  // Task #1792 — `vendor` is the code role for makers (instrument builders)
  // and resellers (shops). The DB value + table stay `vendor`; the operator-
  // facing label reads as the two real-world roles it covers.
  { value: "vendor", label: "Maker / Reseller (GoodDeed pricing)" },
];

export const ROLE_LABEL: Record<string, string> = Object.fromEntries(
  ROLE_OPTIONS.map((o) => [o.value, o.label.replace(/ \(.*\)$/, "")]),
);

// Task #1792 — anything the scrape endpoints can return that a create body
// might consume. Per-scope `buildBody` cherry-picks what each create accepts.
export type ScrapeResult = {
  source?: string | null;
  name?: string | null;
  domain?: string | null;
  logoUrl?: string | null;
  coverUrl?: string | null;
  photoUrl?: string | null;
  bio?: string | null;
  tagline?: string | null;
  location?: string | null;
  websiteUrl?: string | null;
  homeUrl?: string | null;
  aboutUrl?: string | null;
  appleMusicUrl?: string | null;
  spotifyUrl?: string | null;
  tidalUrl?: string | null;
  qobuzUrl?: string | null;
  deezerUrl?: string | null;
  pandoraUrl?: string | null;
  itunesArtistId?: string | null;
  instagramUrl?: string | null;
  tiktokUrl?: string | null;
  twitterUrl?: string | null;
  blueskyUrl?: string | null;
  facebookUrl?: string | null;
  linkedinUrl?: string | null;
};

// Task #1792 — inline "add new" affordance config. When a scope carries one,
// the ScopePicker grows a footer that creates the entity on-the-fly (type a
// name and/or paste a URL the server scrapes) and auto-selects it — so an
// operator inviting e.g. a Manager who isn't in the catalog yet no longer
// dead-ends. Uses the SAME scrape + create endpoints the per-section "Add"
// dialogs use, so both surfaces stay in lock-step on the API contract.
export type ScopeAddConfig = {
  createEndpoint: string;
  scrapeEndpoint: string;
  // Vendor scope shows Maker/Reseller toggles and REQUIRES a URL (domain is
  // mandatory server-side and is derived from the scraped page).
  withRoles?: boolean;
  requireUrl?: boolean;
  buildBody: (args: {
    name: string;
    scraped: ScrapeResult | null;
    roles?: { isMaker: boolean; isReseller: boolean };
  }) => Record<string, unknown>;
};

export type ScopeCfg = {
  endpoint: string;
  noun: string;
  thumbField: "photoUrl" | "logoUrl";
  add?: ScopeAddConfig;
};

// Keep only the keys a given create endpoint accepts; drop falsy values so a
// bare scrape (name-only page) doesn't null out columns.
function pickTruthy(obj: ScrapeResult | null, keys: (keyof ScrapeResult)[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!obj) return out;
  for (const k of keys) {
    const v = obj[k];
    if (v) out[k] = v;
  }
  return out;
}

export const SCOPE_CONFIG: Record<string, ScopeCfg> = {
  artist: {
    endpoint: "/api/people",
    noun: "artist",
    thumbField: "photoUrl",
    add: {
      createEndpoint: "/api/admin/people",
      scrapeEndpoint: "/api/admin/people/scrape",
      buildBody: ({ name, scraped }) => ({
        name: scraped?.name || name,
        ...pickTruthy(scraped, [
          "photoUrl", "coverUrl", "bio", "appleMusicUrl", "spotifyUrl",
          "tidalUrl", "qobuzUrl", "deezerUrl", "pandoraUrl", "itunesArtistId",
          "instagramUrl", "tiktokUrl", "twitterUrl", "blueskyUrl",
          "facebookUrl", "websiteUrl", "linkedinUrl",
        ]),
      }),
    },
  },
  label: {
    endpoint: "/api/labels",
    noun: "label",
    thumbField: "logoUrl",
    add: {
      createEndpoint: "/api/admin/labels",
      scrapeEndpoint: "/api/admin/labels/scrape",
      buildBody: ({ name, scraped }) => ({
        name: scraped?.name || name,
        ...pickTruthy(scraped, ["domain", "logoUrl", "coverUrl", "bio", "location", "websiteUrl"]),
      }),
    },
  },
  manager: {
    endpoint: "/api/managers",
    noun: "manager",
    thumbField: "logoUrl",
    add: {
      createEndpoint: "/api/admin/managers",
      scrapeEndpoint: "/api/admin/managers/scrape",
      buildBody: ({ name, scraped }) => ({
        name: scraped?.name || name,
        ...pickTruthy(scraped, ["domain", "logoUrl", "coverUrl", "bio", "location", "websiteUrl"]),
      }),
    },
  },
  manufacturer: {
    endpoint: "/api/manufacturers",
    noun: "manufacturer",
    thumbField: "logoUrl",
    add: {
      createEndpoint: "/api/admin/manufacturers",
      scrapeEndpoint: "/api/admin/manufacturers/scrape",
      // doesVinyl defaults true server-side when no capability flags are sent,
      // so a name-only press still lands on the Presses tab.
      buildBody: ({ name, scraped }) => ({
        name: scraped?.name || name,
        ...pickTruthy(scraped, ["domain", "logoUrl", "coverUrl", "bio", "location", "websiteUrl"]),
      }),
    },
  },
  fulfillment: {
    endpoint: "/api/fulfillment-partners",
    noun: "fulfillment partner",
    thumbField: "logoUrl",
    add: {
      createEndpoint: "/api/admin/fulfillment-partners",
      scrapeEndpoint: "/api/admin/fulfillment-partners/scrape",
      buildBody: ({ name, scraped }) => ({
        name: scraped?.name || name,
        ...pickTruthy(scraped, ["domain", "logoUrl", "coverUrl", "bio", "location", "websiteUrl"]),
      }),
    },
  },
  non_profit: {
    endpoint: "/api/non-profits",
    noun: "non-profit",
    thumbField: "logoUrl",
    add: {
      // NPOs have no dedicated scraper — reuse the vendors scraper (homeUrl →
      // websiteUrl). Create is super-admin-only server-side; a non-super-admin
      // attempt surfaces as a toast rather than a silent no-op.
      createEndpoint: "/api/non-profits",
      scrapeEndpoint: "/api/admin/vendors/scrape",
      buildBody: ({ name, scraped }) => ({
        name: scraped?.name || name,
        ...(scraped?.homeUrl ? { websiteUrl: scraped.homeUrl } : {}),
        ...(scraped?.logoUrl ? { logoUrl: scraped.logoUrl } : {}),
      }),
    },
  },
  vendor: {
    endpoint: "/api/vendors",
    noun: "maker or reseller",
    thumbField: "logoUrl",
    add: {
      createEndpoint: "/api/admin/vendors",
      scrapeEndpoint: "/api/admin/vendors/scrape",
      withRoles: true,
      requireUrl: true,
      buildBody: ({ name, scraped, roles }) => ({
        name: scraped?.name || name,
        ...pickTruthy(scraped, ["domain", "homeUrl", "aboutUrl", "logoUrl", "coverUrl", "tagline", "bio", "location"]),
        // Server only acts on isMaker===true / isReseller===false; the column
        // defaults are isMaker=false, isReseller=true.
        isMaker: !!roles?.isMaker,
        isReseller: roles?.isReseller !== false,
      }),
    },
  },
  // Task #350 — ambassador picker reuses the people endpoint; server
  // validates can_invite_ambassadors=true at invite-create time so a
  // misclicked non-ambassador surfaces as a 400 rather than silently
  // attributing to a person without the verb. No inline-add — ambassadors
  // are promoted from existing NPO contacts, not minted here.
  ambassador: { endpoint: "/api/people", noun: "ambassador", thumbField: "photoUrl" },
};

export type ScopeEntity = { id: string; name: string; photoUrl?: string | null; logoUrl?: string | null };

// Pull a clean human message out of an apiRequest error (which embeds the JSON
// body after a "NNN: " status prefix).
function humanizeScopeError(e: any): string {
  const msg: string = e?.message || "Something went wrong. Try again.";
  try {
    const m = msg.match(/\{[\s\S]*\}/);
    if (m) {
      const p = JSON.parse(m[0]);
      if (p?.message) return p.message;
    }
  } catch { /* fall through */ }
  return msg.replace(/^\d{3}:\s*/, "");
}

export function ScopePicker({
  cfg,
  value,
  onChange,
  label,
  testId,
}: {
  cfg: ScopeCfg;
  value: string | null;
  onChange: (id: string | null, name: string | null) => void;
  label?: string;
  testId?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  // Inline "add new" panel state.
  const [addMode, setAddMode] = useState(false);
  const [addName, setAddName] = useState("");
  const [addUrl, setAddUrl] = useState("");
  const [addIsMaker, setAddIsMaker] = useState(false);
  const [addIsReseller, setAddIsReseller] = useState(true);
  const [addError, setAddError] = useState<string | null>(null);

  const { data: rows = [], isLoading } = useQuery<ScopeEntity[]>({
    queryKey: [cfg.endpoint],
  });

  const selected = useMemo(() => rows.find((r) => r.id === value) ?? null, [rows, value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...rows].sort((a, b) => a.name.localeCompare(b.name));
    if (!q) return sorted.slice(0, 50);
    return sorted.filter((r) => r.name.toLowerCase().includes(q)).slice(0, 50);
  }, [rows, query]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Reset the inline-add panel whenever the scope itself changes (e.g. the
  // invite role flips from Artist to Manager) so a half-typed add can't bleed
  // across scopes.
  useEffect(() => {
    setAddMode(false);
    setAddName("");
    setAddUrl("");
    setAddIsMaker(false);
    setAddIsReseller(true);
    setAddError(null);
    setQuery("");
  }, [cfg.endpoint]);

  const thumb = (r: ScopeEntity) => (cfg.thumbField === "photoUrl" ? r.photoUrl : r.logoUrl) || null;

  const createMut = useMutation({
    mutationFn: async (): Promise<ScopeEntity> => {
      const add = cfg.add!;
      let scraped: ScrapeResult | null = null;
      const url = addUrl.trim();
      if (url) {
        const sr = await apiRequest("POST", add.scrapeEndpoint, { url });
        scraped = (await sr.json()) as ScrapeResult;
      }
      const body = add.buildBody({
        name: addName.trim(),
        scraped,
        roles: { isMaker: addIsMaker, isReseller: addIsReseller },
      });
      const res = await apiRequest("POST", add.createEndpoint, body);
      return (await res.json()) as ScopeEntity;
    },
    onSuccess: (created) => {
      // Optimistically seed the list cache so `selected` resolves immediately,
      // then invalidate to reconcile with the server.
      qc.setQueryData<ScopeEntity[]>([cfg.endpoint], (old) =>
        old ? (old.some((x) => x.id === created.id) ? old : [...old, created]) : [created],
      );
      qc.invalidateQueries({ queryKey: [cfg.endpoint] });
      onChange(created.id, created.name);
      setAddMode(false);
      setAddName("");
      setAddUrl("");
      setAddError(null);
      setOpen(false);
      setQuery("");
      toast({ title: `Added ${created.name}` });
    },
    onError: (e) => setAddError(humanizeScopeError(e)),
  });

  const add = cfg.add;
  const busy = createMut.isPending;
  const urlValid = !addUrl.trim() || /^https?:\/\//i.test(addUrl.trim());
  const canSubmit = add
    ? add.requireUrl
      ? !!addUrl.trim() && urlValid && (addIsMaker || addIsReseller)
      : (!!addName.trim() || !!addUrl.trim()) && urlValid
    : false;

  const openAdd = () => {
    setAddName(query.trim());
    setAddUrl("");
    setAddError(null);
    setAddIsMaker(false);
    setAddIsReseller(true);
    setAddMode(true);
  };

  const submitAdd = () => {
    if (busy || !canSubmit) return;
    setAddError(null);
    if (addUrl.trim() && !urlValid) {
      setAddError("Paste a full https:// URL.");
      return;
    }
    createMut.mutate();
  };

  const Noun = cfg.noun.charAt(0).toUpperCase() + cfg.noun.slice(1);

  return (
    <div className="mt-3" ref={wrapRef}>
      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
        {label || Noun}
      </label>
      {selected ? (
        <div
          className="flex items-center gap-3 px-3 py-2 rounded-lg border border-slate-300 bg-white"
          data-testid={testId ? `${testId}-selected` : "scope-selected"}
        >
          {thumb(selected) ? (
            <img src={thumb(selected)!} alt="" className="w-8 h-8 rounded-full object-cover bg-slate-100" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-slate-200" />
          )}
          <div className="flex-1 min-w-0 font-medium text-slate-900 truncate">{selected.name}</div>
          <button
            type="button"
            onClick={() => {
              onChange(null, null);
              setQuery("");
              setOpen(true);
            }}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            aria-label="Clear selection"
            data-testid={testId ? `${testId}-clear` : "button-clear-scope"}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <div className="flex items-center rounded-lg border border-slate-300 bg-white focus-within:border-[var(--brand-blue)] focus-within:ring-2 focus-within:ring-[var(--brand-blue)]/20">
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              placeholder={`Search ${cfg.noun}s…`}
              className="flex-1 px-3 py-2 bg-transparent focus:outline-none"
              data-testid={testId ? `${testId}-input` : "input-scope-search"}
            />
            <ChevronDown className="w-4 h-4 text-slate-400 mr-3" />
          </div>
          {open && (
            <div
              className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden"
              data-testid={testId ? `${testId}-options` : "list-scope-options"}
            >
              {addMode && add ? (
                <div className="p-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700">Add {cfg.noun}</span>
                    <button
                      type="button"
                      onClick={() => { setAddMode(false); setAddError(null); }}
                      className="text-xs font-semibold text-slate-500 hover:text-slate-900"
                      data-testid={testId ? `${testId}-add-back` : "button-add-scope-back"}
                    >
                      Back
                    </button>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">
                      {Noun} name {add.requireUrl ? "(optional — pulled from URL)" : ""}
                    </label>
                    <input
                      type="text"
                      autoFocus
                      value={addName}
                      onChange={(e) => setAddName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitAdd(); } }}
                      placeholder={`${Noun} name`}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-[var(--brand-blue)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]/20"
                      data-testid={testId ? `${testId}-add-name` : "input-add-scope-name"}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">
                      Website URL {add.requireUrl ? "· required" : "(optional — we'll pull name, logo & bio)"}
                    </label>
                    <input
                      type="url"
                      value={addUrl}
                      onChange={(e) => setAddUrl(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitAdd(); } }}
                      placeholder="https://…"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-[var(--brand-blue)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]/20"
                      data-testid={testId ? `${testId}-add-url` : "input-add-scope-url"}
                    />
                  </div>
                  {add.withRoles && (
                    <div className="flex items-center gap-4 pt-0.5">
                      <label className="inline-flex items-center gap-1.5 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={addIsMaker}
                          onChange={(e) => setAddIsMaker(e.target.checked)}
                          className="rounded border-slate-300"
                          data-testid={testId ? `${testId}-add-maker` : "checkbox-add-maker"}
                        />
                        Maker
                      </label>
                      <label className="inline-flex items-center gap-1.5 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={addIsReseller}
                          onChange={(e) => setAddIsReseller(e.target.checked)}
                          className="rounded border-slate-300"
                          data-testid={testId ? `${testId}-add-reseller` : "checkbox-add-reseller"}
                        />
                        Reseller
                      </label>
                    </div>
                  )}
                  {addError && (
                    <p className="text-xs text-rose-600" data-testid={testId ? `${testId}-add-error` : "text-add-scope-error"}>
                      {addError}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={submitAdd}
                    disabled={busy || !canSubmit}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--brand-blue)] hover:bg-[#2789bd] disabled:bg-slate-300 text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5 transition-colors"
                    data-testid={testId ? `${testId}-add-submit` : "button-add-scope-submit"}
                  >
                    {busy ? <Spinner className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    {busy ? "Adding…" : "Add & select"}
                  </button>
                </div>
              ) : (
                <>
                  <div className="max-h-60 overflow-auto">
                    {isLoading ? (
                      <div className="px-3 py-2 text-sm text-slate-500">Loading…</div>
                    ) : filtered.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-slate-500">
                        No {cfg.noun}s match "{query}".
                      </div>
                    ) : (
                      filtered.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => {
                            onChange(r.id, r.name);
                            setOpen(false);
                            setQuery("");
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-slate-50"
                          data-testid={`option-${testId || "scope"}-${r.id}`}
                        >
                          {thumb(r) ? (
                            <img src={thumb(r)!} alt="" className="w-7 h-7 rounded-full object-cover bg-slate-100" />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-slate-200" />
                          )}
                          <span className="text-sm text-slate-900 truncate">{r.name}</span>
                        </button>
                      ))
                    )}
                  </div>
                  {add && (
                    <button
                      type="button"
                      onClick={openAdd}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm font-medium text-slate-700 border-t border-slate-200 hover:bg-slate-50"
                      data-testid={testId ? `${testId}-add` : "button-add-scope"}
                    >
                      {add.requireUrl ? (
                        <Link2 className="w-4 h-4 text-[var(--brand-blue)] flex-shrink-0" />
                      ) : (
                        <Plus className="w-4 h-4 text-[var(--brand-blue)] flex-shrink-0" />
                      )}
                      <span className="truncate">
                        {query.trim()
                          ? `Add "${query.trim()}" as a new ${cfg.noun}…`
                          : `Add a new ${cfg.noun}…`}
                      </span>
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
