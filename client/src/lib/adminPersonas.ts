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
  /** Where to land when an entity is picked in the ViewAs switcher (super-admin nav). */
  detailPath?: (id: string) => string;
  /** Where to land for "+ New" (the list page hosts the add modal). */
  listPath?: string;
  /** Customers don't get a "+ New" — fans self-sign-up. */
  allowCreate?: boolean;
  /**
   * Dev-only impersonation config. When present, picking this persona from
   * the dev-login dropdown will set a synthetic hat with these role+scope
   * details and land on `portalPath` — the genuine restricted partner shell
   * (not the super-admin detail page). Absent on "god" (no hat needed).
   */
  devHat?: {
    /** The partner role that governs the admin sidebar and API gates. */
    role: string;
    /** The membership scope kind (mirrors MEMBERSHIP_SCOPE_KINDS). */
    scopeKind: string;
    /**
     * The portal home URL for this role. No entity-ID query param — the
     * portal reads the scopeId from /api/me/role (impersonated). Use
     * detailPath for the super-admin VIEW-AS URL (with ?...Id=).
     */
    portalPath: string;
  };
}

/**
 * All personas in sidebar-importance order. God View sits first (takes the
 * place of the Dashboard persona-slot). Partner roles follow in the same
 * order they appear in the View As switcher.
 *
 * `detailPath` drives the in-app switcher navigation (VIEW AS, super-admin
 * navigation with entity-ID query param). `devHat.portalPath` drives the
 * post-login landing for the dev-login role dropdown — it's the genuine
 * restricted portal home (no entity-ID param; the portal reads from
 * /api/me/role which the synthetic hat populates).
 */
export const PERSONAS: Persona[] = [
  {
    key: "god",
    label: "God View",
    icon: Eye,
    // No devHat — God View clears impersonation and returns to full super-admin.
  },
  {
    key: "label",
    label: "Label",
    icon: Tag,
    endpoint: "/api/labels",
    detailPath: (id) => `/label?labelId=${encodeURIComponent(id)}`,
    listPath: "/admin/labels",
    allowCreate: true,
    devHat: {
      role: "label",
      scopeKind: "label",
      portalPath: "/label",
    },
  },
  {
    key: "press",
    label: "Press",
    icon: Factory,
    endpoint: "/api/manufacturers",
    detailPath: (id) => `/admin/manufacturers/${id}`,
    listPath: "/admin/manufacturers",
    allowCreate: true,
    devHat: {
      role: "manufacturer",
      scopeKind: "manufacturer",
      portalPath: "/vendor",
    },
  },
  {
    key: "artist",
    label: "Artist",
    icon: User,
    endpoint: "/api/people",
    detailPath: (id) => `/artist?personId=${encodeURIComponent(id)}`,
    listPath: "/admin/people",
    allowCreate: true,
    devHat: {
      role: "artist",
      scopeKind: "artist",
      portalPath: "/artist",
    },
  },
  {
    key: "nonprofit",
    label: "Non-profit",
    icon: Heart,
    endpoint: "/api/non-profits",
    detailPath: (id) => `/admin/non-profits/${id}`,
    listPath: "/admin/non-profits",
    allowCreate: true,
    devHat: {
      role: "non_profit",
      scopeKind: "non_profit",
      portalPath: "/non-profit",
    },
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
    devHat: {
      role: "vendor",
      scopeKind: "vendor",
      portalPath: "/vendor",
    },
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
    devHat: {
      role: "vendor",
      scopeKind: "vendor",
      portalPath: "/vendor",
    },
  },
  {
    key: "fulfillment",
    label: "Fulfillment",
    icon: Truck,
    endpoint: "/api/fulfillment-partners",
    detailPath: (id) => `/admin/fulfillment-partners/${id}`,
    listPath: "/admin/fulfillment-partners",
    allowCreate: true,
    devHat: {
      role: "fulfillment",
      scopeKind: "fulfillment",
      portalPath: "/vendor",
    },
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
