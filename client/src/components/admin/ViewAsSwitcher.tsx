import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Check,
  ChevronsUpDown,
  Plus,
  Eye,
  Tag,
  Factory,
  Hammer,
  Store,
  Truck,
  User,
  Heart,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Spinner } from "@/components/ui/Spinner";

/**
 * Header "view as" switcher.
 *
 * Lets a super-admin pick a persona (Label / Press / Artist / etc.) and
 * then a specific entity to land on that entity's admin detail page —
 * the quickest way to get a sense of "what does this label / press /
 * artist look like inside the admin." Picking "God View" returns to the
 * normal admin dashboard.
 *
 * Today this is plain navigation (no session impersonation) — the
 * detail page itself is still the admin view of that entity. When real
 * partner portals ship (artist upload portal, label dashboard, etc.)
 * each persona's `detailPath` can switch to the portal URL without
 * changing the switcher UI.
 */

interface EntityLite {
  id: string;
  name: string;
  isMaker?: boolean;
  isReseller?: boolean;
}

type PersonaKey =
  | "god"
  | "label"
  | "press"
  | "artist"
  | "nonprofit"
  | "maker"
  | "reseller"
  | "fulfillment";

interface Persona {
  key: PersonaKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Endpoint that returns the list of entities. */
  endpoint?: string;
  /** Optional client-side filter (Maker vs Reseller share /api/vendors). */
  filter?: (e: EntityLite) => boolean;
  /** Where to land when an entity is picked. */
  detailPath?: (id: string) => string;
  /** Where to land for "+ New" (the list page hosts the add modal). */
  listPath?: string;
  /** Customers don't get a "+ New" — fans self-sign-up. */
  allowCreate?: boolean;
}

// Order mirrors the left-nav importance order (Dashboard isn't a
// persona, so God View takes the top slot).
//
// `detailPath` controls what "View as <persona> → <entity>" lands on:
//   • Personas with a real partner portal (Label, Artist, Non-profit)
//     route to that portal with the super-admin `?<scope>Id=` view-as
//     query param the backend already honors (server/labelReports.ts,
//     server/artistReports.ts, /api/non-profit/* in routes.ts). The
//     result is *what that partner actually sees when logged in* — the
//     useful version for both founder/agent collaboration and investor
//     demos.
//   • Personas without a portal yet (Press, Maker, Reseller,
//     Fulfillment) fall back to the admin detail page so the switcher
//     still saves clicks. Swap their `detailPath` to a portal URL once
//     the portal ships — no other change needed here.
const PERSONAS: Persona[] = [
  {
    key: "god",
    label: "God View",
    icon: Eye,
  },
  {
    key: "label",
    label: "Label",
    icon: Tag,
    endpoint: "/api/labels",
    // Real portal: LabelDashboard reads ?labelId= when caller is super_admin.
    detailPath: (id) => `/label?labelId=${encodeURIComponent(id)}`,
    listPath: "/admin/labels",
    allowCreate: true,
  },
  {
    key: "press",
    label: "Press",
    icon: Factory,
    endpoint: "/api/manufacturers",
    // No portal yet — falls back to admin detail.
    detailPath: (id) => `/admin/manufacturers/${id}`,
    listPath: "/admin/manufacturers",
    allowCreate: true,
  },
  {
    key: "artist",
    label: "Artist",
    icon: User,
    endpoint: "/api/people",
    // Real portal: ArtistDashboard reads ?personId= when super_admin.
    detailPath: (id) => `/artist?personId=${encodeURIComponent(id)}`,
    listPath: "/admin/people",
    allowCreate: true,
  },
  {
    key: "nonprofit",
    label: "Non-profit",
    icon: Heart,
    // Non-profits live in the `organizations` table (kind='non_profit')
    // and are exposed through /api/non-profits. The chooser routes to
    // the canonical admin detail page so opening from a detail URL
    // round-trips back to the same page.
    endpoint: "/api/non-profits",
    detailPath: (id) => `/admin/non-profits/${id}`,
    listPath: "/admin/non-profits",
    allowCreate: true,
  },
  {
    key: "maker",
    label: "Maker",
    icon: Hammer,
    endpoint: "/api/vendors",
    filter: (e) => !!e.isMaker,
    // No portal yet.
    detailPath: (id) => `/admin/makers/${id}`,
    listPath: "/admin/makers",
    allowCreate: true,
  },
  {
    key: "reseller",
    label: "Reseller",
    icon: Store,
    endpoint: "/api/vendors",
    filter: (e) => !!e.isReseller,
    // No portal yet.
    detailPath: (id) => `/admin/vendors/${id}`,
    listPath: "/admin/vendors",
    allowCreate: true,
  },
  {
    key: "fulfillment",
    label: "Fulfillment",
    icon: Truck,
    endpoint: "/api/fulfillment-partners",
    // No portal yet.
    detailPath: (id) => `/admin/fulfillment-partners/${id}`,
    listPath: "/admin/fulfillment-partners",
    allowCreate: true,
  },
];

// Inspect the current URL and figure out which persona + entity id the
// operator is looking at, so the chooser can pre-select that row instead
// of making them re-search. Covers both the canonical admin detail
// routes (`/admin/<segment>/:id`) and the partner-portal view-as URLs
// (`/label?labelId=…`, `/artist?personId=…`, `/non-profit?orgId=…`).
function detectCurrentEntity(
  pathname: string,
  search: string,
): { personaKey: PersonaKey; id: string } | null {
  const adminSegmentToPersona: Record<string, PersonaKey> = {
    labels: "label",
    manufacturers: "press",
    people: "artist",
    "non-profits": "nonprofit",
    makers: "maker",
    vendors: "reseller",
    "fulfillment-partners": "fulfillment",
  };
  const adminMatch = pathname.match(/^\/admin\/([^/]+)\/([^/?#]+)/);
  if (adminMatch) {
    const seg = adminMatch[1];
    const id = adminMatch[2];
    const personaKey = adminSegmentToPersona[seg];
    if (personaKey && id && id !== "new") return { personaKey, id };
  }
  const params = new URLSearchParams(search);
  if (pathname === "/label" && params.get("labelId"))
    return { personaKey: "label", id: params.get("labelId")! };
  if (pathname === "/artist" && params.get("personId"))
    return { personaKey: "artist", id: params.get("personId")! };
  if (pathname === "/non-profit" && params.get("orgId"))
    return { personaKey: "nonprofit", id: params.get("orgId")! };
  return null;
}

export function ViewAsSwitcher() {
  const [location, navigate] = useLocation();
  // Super-admin-only chrome. Partner roles (label / artist / press / etc.)
  // must never see the "View as" persona switcher — it's a god-view tool for
  // jumping across any entity's admin detail page. Gated on the real logged-in
  // role (this control only navigates, it never swaps the session, so the role
  // response is stable). The server already scopes what each role can open.
  const { data: roleInfo } = useQuery<{ role: string; roleScopeId: string | null }>({
    queryKey: ["/api/me/role"],
  });
  const isSuperAdmin = roleInfo?.role === "super_admin";
  const currentEntity = useMemo(() => {
    const search = typeof window !== "undefined" ? window.location.search : "";
    return detectCurrentEntity(location, search);
  }, [location]);

  const [personaOpen, setPersonaOpen] = useState(false);
  const [personaQuery, setPersonaQuery] = useState("");
  const [persona, setPersona] = useState<Persona>(() => {
    if (currentEntity) {
      const match = PERSONAS.find((p) => p.key === currentEntity.personaKey);
      if (match) return match;
    }
    return PERSONAS[0];
  });
  // When the operator navigates to a different detail page, auto-switch
  // the persona to match so the entity picker is already on the right
  // list. They can still override with the persona popover.
  useEffect(() => {
    if (!currentEntity) return;
    if (currentEntity.personaKey === persona.key) return;
    const match = PERSONAS.find((p) => p.key === currentEntity.personaKey);
    if (match) setPersona(match);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentEntity?.personaKey, currentEntity?.id]);

  const [entityOpen, setEntityOpen] = useState(false);
  const [entityQuery, setEntityQuery] = useState("");

  const personaTriggerRef = useRef<HTMLButtonElement | null>(null);
  const entityTriggerRef = useRef<HTMLButtonElement | null>(null);

  // Only fetch the entity list when a persona that needs one is selected.
  const { data: rawEntities = [], isLoading: entitiesLoading } = useQuery<EntityLite[]>({
    queryKey: persona.endpoint ? [persona.endpoint] : ["__view-as-noop__"],
    enabled: !!persona.endpoint,
  });

  const entities = useMemo(() => {
    const filtered = persona.filter
      ? rawEntities.filter(persona.filter)
      : rawEntities;
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  }, [rawEntities, persona]);

  // The current-entity id (if any) belongs to *this* persona's list —
  // used to highlight that row and label the trigger button so the
  // operator instantly sees "you're on this one."
  const currentEntityId =
    currentEntity && currentEntity.personaKey === persona.key
      ? currentEntity.id
      : null;
  const currentEntityName = useMemo(() => {
    if (!currentEntityId) return null;
    return entities.find((e) => e.id === currentEntityId)?.name ?? null;
  }, [currentEntityId, entities]);

  const choosePersona = (next: Persona) => {
    setPersona(next);
    setPersonaOpen(false);
    setPersonaQuery("");
    setEntityQuery("");
    if (next.key === "god") {
      navigate("/admin/dashboard");
      return;
    }
    // Open the entity picker right away so the second step is one less
    // click — they've told us "I want to see a label", they shouldn't
    // have to click again to start typing.
    queueMicrotask(() => {
      entityTriggerRef.current?.focus();
      setEntityOpen(true);
    });
  };

  const chooseEntity = (e: EntityLite) => {
    if (!persona.detailPath) return;
    navigate(persona.detailPath(e.id));
    setEntityOpen(false);
    setEntityQuery("");
  };

  const createNew = () => {
    if (!persona.listPath) return;
    navigate(persona.listPath);
    setEntityOpen(false);
    setEntityQuery("");
  };

  const PersonaIcon = persona.icon;

  // All hooks above run unconditionally; only the render is gated so a
  // non-super-admin sees nothing at all.
  if (!isSuperAdmin) return null;

  return (
    <div className="flex items-center gap-2" data-testid="view-as-switcher">
      {/* Persona picker */}
      <Popover open={personaOpen} onOpenChange={setPersonaOpen}>
        <PopoverTrigger asChild>
          <button
            ref={personaTriggerRef}
            type="button"
            className="h-9 min-w-[150px] rounded-md border border-slate-300 bg-white px-3 text-[13.5px] text-left text-slate-900 hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)] focus:border-transparent inline-flex items-center gap-2"
            data-testid="button-view-as-persona"
            aria-haspopup="listbox"
            aria-expanded={personaOpen}
          >
            <span className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
              View as
            </span>
            <PersonaIcon className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
            <span className="flex-1 truncate font-medium">{persona.label}</span>
            <ChevronsUpDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={4}
          className="p-0 w-[240px] bg-white border border-slate-200 text-slate-900 shadow-lg"
        >
          <Command
            shouldFilter={true}
            className={[
              "bg-white text-slate-900",
              "[&_[cmdk-input-wrapper]]:border-slate-200",
              "[&_[cmdk-item]]:text-slate-700",
              "[&_[cmdk-item][data-selected=true]]:bg-slate-100",
              "[&_[cmdk-item][data-selected=true]]:text-slate-900",
            ].join(" ")}
          >
            <CommandInput
              placeholder="Search personas…"
              value={personaQuery}
              onValueChange={setPersonaQuery}
              className="text-slate-900 placeholder:text-slate-400"
              data-testid="input-view-as-persona-search"
            />
            <CommandList>
              <CommandEmpty>
                <div className="text-[12.5px] text-slate-500">
                  No match.
                </div>
              </CommandEmpty>
              <CommandGroup>
                {PERSONAS.map((p) => {
                  const Icon = p.icon;
                  const selected = p.key === persona.key;
                  return (
                    <CommandItem
                      key={p.key}
                      value={p.label}
                      onSelect={() => choosePersona(p)}
                      data-testid={`option-view-as-persona-${p.key}`}
                      className="flex items-center gap-2"
                    >
                      <Icon className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                      <span className="flex-1 truncate">{p.label}</span>
                      {selected && (
                        <Check className="w-3.5 h-3.5 text-[var(--brand-blue)] flex-shrink-0" />
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Entity picker — only when a persona other than God View is active. */}
      {persona.key !== "god" && persona.endpoint && (
        <Popover open={entityOpen} onOpenChange={setEntityOpen}>
          <PopoverTrigger asChild>
            <button
              ref={entityTriggerRef}
              type="button"
              className="h-9 min-w-[200px] rounded-md border border-slate-300 bg-white px-3 text-[13.5px] text-left text-slate-900 hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)] focus:border-transparent inline-flex items-center gap-2"
              data-testid="button-view-as-entity"
              aria-haspopup="listbox"
              aria-expanded={entityOpen}
            >
              {currentEntityName ? (
                <span
                  className="flex-1 truncate font-medium"
                  data-testid="text-view-as-current-entity"
                >
                  {currentEntityName}
                </span>
              ) : (
                <span className="flex-1 truncate text-slate-400 italic">
                  Choose {persona.label.toLowerCase()}…
                </span>
              )}
              <ChevronsUpDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            sideOffset={4}
            className="p-0 w-[min(320px,calc(100vw-2rem))] bg-white border border-slate-200 text-slate-900 shadow-lg"
          >
            <Command
              shouldFilter={true}
              className={[
                "bg-white text-slate-900",
                "[&_[cmdk-input-wrapper]]:border-slate-200",
                "[&_[cmdk-group-heading]]:text-slate-400",
                "[&_[cmdk-item]]:text-slate-700",
                "[&_[cmdk-item][data-selected=true]]:bg-slate-100",
                "[&_[cmdk-item][data-selected=true]]:text-slate-900",
              ].join(" ")}
            >
              <CommandInput
                placeholder={`Search ${persona.label.toLowerCase()}s…`}
                value={entityQuery}
                onValueChange={setEntityQuery}
                className="text-slate-900 placeholder:text-slate-400"
                data-testid="input-view-as-entity-search"
              />
              <CommandList>
                {entitiesLoading ? (
                  <div className="p-4 text-[12.5px] text-slate-500 inline-flex items-center gap-2">
                    <Spinner className="w-3.5 h-3.5 animate-spin" />
                    Loading…
                  </div>
                ) : (
                  <>
                    <CommandEmpty>
                      <div className="text-[12.5px] text-slate-500">
                        No matches.
                      </div>
                    </CommandEmpty>
                    {entities.length > 0 && (
                      <CommandGroup heading={`${persona.label}s`}>
                        {entities.map((e) => {
                          const isCurrent = e.id === currentEntityId;
                          return (
                            <CommandItem
                              key={e.id}
                              value={e.name}
                              onSelect={() => chooseEntity(e)}
                              data-testid={`option-view-as-entity-${e.id}`}
                              className="flex items-center gap-2"
                            >
                              <span
                                className={`flex-1 truncate ${isCurrent ? "font-medium text-slate-900" : ""}`}
                              >
                                {e.name}
                              </span>
                              {isCurrent && (
                                <Check className="w-3.5 h-3.5 text-[var(--brand-blue)] flex-shrink-0" />
                              )}
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    )}
                    {persona.allowCreate && (
                      <>
                        <CommandSeparator />
                        <CommandGroup heading="Add new">
                          <CommandItem
                            value={`__create__${persona.key}`}
                            onSelect={createNew}
                            data-testid="button-view-as-create"
                            className="flex items-center gap-2"
                          >
                            <Plus className="w-3.5 h-3.5 text-[var(--brand-blue)] flex-shrink-0" />
                            <span className="flex-1 truncate">
                              New {persona.label.toLowerCase()}…
                            </span>
                          </CommandItem>
                        </CommandGroup>
                      </>
                    )}
                  </>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
