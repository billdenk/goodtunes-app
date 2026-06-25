/**
 * Shared admin persona definitions.
 *
 * Used by both the in-app "View As" switcher (ViewAsSwitcher.tsx) and the
 * dev-login role dropdown on the admin login page (Login.tsx) so the two
 * surfaces stay in lock-step without duplicating the list.
 *
 * Icons are lucide-react component refs — anything importing this module from
 * a non-React context should only use the non-icon fields (key, label,
 * endpoint, filter, detailPath, listPath).
 */

import {
  Eye,
  Tag,
  Factory,
  Hammer,
  Store,
  Truck,
  User,
  Heart,
  type LucideIcon,
} from "lucide-react";

export type PersonaKey =
  | "god"
  | "label"
  | "press"
  | "artist"
  | "nonprofit"
  | "maker"
  | "reseller"
  | "fulfillment";

export interface EntityLite {
  id: string;
  name: string;
  isMaker?: boolean;
  isReseller?: boolean;
}

export interface Persona {
  key: PersonaKey;
  label: string;
  icon: LucideIcon;
  /** Endpoint that returns the list of entities for this persona. */
  endpoint?: string;
  /** Optional client-side filter (Maker vs Reseller both use /api/vendors). */
  filter?: (e: EntityLite) => boolean;
  /** Where to land when an entity is picked. */
  detailPath?: (id: string) => string;
  /** Where to land for "+ New" (the list page hosts the add modal). */
  listPath?: string;
  /** Customers don't get a "+ New" — fans self-sign-up. */
  allowCreate?: boolean;
}

/**
 * All personas in sidebar-importance order. God View sits first (takes the
 * place of the Dashboard persona-slot). Partner roles follow in the same
 * order they appear in the View As switcher.
 *
 * `detailPath` drives BOTH the in-app switcher navigation AND the post-login
 * landing for the dev-login role dropdown on the admin login page.
 *
 * Personas with a real partner portal (Label, Artist, Non-profit) route to
 * that portal with the super-admin `?<scope>Id=` view-as query param the
 * backend already honours. The result is what that partner actually sees when
 * logged in — the useful version for QA / investor demos.
 *
 * Personas without a portal yet (Press, Maker, Reseller, Fulfillment) fall
 * back to the admin detail page. Swap their `detailPath` to the portal URL
 * once the portal ships — no other change needed here.
 */
export const PERSONAS: Persona[] = [
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
    detailPath: (id) => `/label?labelId=${encodeURIComponent(id)}`,
    listPath: "/admin/labels",
    allowCreate: true,
  },
  {
    key: "press",
    label: "Press",
    icon: Factory,
    endpoint: "/api/manufacturers",
    detailPath: (id) => `/admin/manufacturers/${id}`,
    listPath: "/admin/manufacturers",
    allowCreate: true,
  },
  {
    key: "artist",
    label: "Artist",
    icon: User,
    endpoint: "/api/people",
    detailPath: (id) => `/artist?personId=${encodeURIComponent(id)}`,
    listPath: "/admin/people",
    allowCreate: true,
  },
  {
    key: "nonprofit",
    label: "Non-profit",
    icon: Heart,
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
    detailPath: (id) => `/admin/vendors/${id}`,
    listPath: "/admin/vendors",
    allowCreate: true,
  },
  {
    key: "fulfillment",
    label: "Fulfillment",
    icon: Truck,
    endpoint: "/api/fulfillment-partners",
    detailPath: (id) => `/admin/fulfillment-partners/${id}`,
    listPath: "/admin/fulfillment-partners",
    allowCreate: true,
  },
];

/** Lookup a persona by key (returns undefined if not found). */
export function getPersona(key: PersonaKey): Persona | undefined {
  return PERSONAS.find((p) => p.key === key);
}

/**
 * Storage key used to hand off the desired persona across the full-page
 * redirect that the dev-login flow triggers. Written before the redirect,
 * consumed + cleared inside the hash-token pickup useEffect in Login.tsx.
 */
export const DEV_LOGIN_PERSONA_KEY = "gt:devLoginPersona";
