// Task #544 — Module registry for the shared OperatorShell.
//
// One source of truth for "which tabs does each operator role get."
// Each role declares its modules here; the shell calls `modulesForRole`
// and renders the resulting tabs in order. To add a tab to an existing
// role you append a row here (and add the matching `tab === id` branch
// in the role's page) — no shell changes required.
//
// `roles` is the closed `users.role` enum from shared/schema.ts plus a
// synthetic "press" entry that distinguishes `is_maker` manufacturers
// (Hellbender, MRP, PMP) from reseller/quick-printer manufacturers that
// share the legacy vendor shell. See VendorPortal.tsx `ManufacturerScopeRouter`.
//
// `requires` is reserved for partner-permission gating (the
// PARTNER_PERMISSION_VERBS verbs from docs/roles-and-permissions.md).
// No current module needs it — the per-role split already covers every
// real gate today — but the field is here so a new module that needs
// e.g. `invite_subusers` to appear can declare it without re-plumbing
// the shell.
//
// Task #2566 — each module also carries its own `icon` (a lucide glyph)
// and optional `section` membership, so the shared OperatorShell rail is
// the SINGLE SOURCE OF TRUTH for every portal's icons and grouping (no
// per-page icon maps that can drift). Icons match the super-admin
// AdminFrame `SidebarLink`s for every shared destination (Dashboard →
// LayoutDashboard, People → User, Albums → Disc3, Orders → ShoppingBag,
// Reports → BarChart3); portal-only destinations pick one consistent
// glyph reused across every portal. `section` mirrors AdminFrame's
// `SidebarSectionId` / `SECTION_FOR_ENTITY` model — modules that share a
// section id render nested under a collapsible header in the rail.

import {
  LayoutDashboard,
  User,
  Users,
  Disc3,
  ShoppingBag,
  BarChart3,
  Activity,
  Megaphone,
  UserCheck,
  UserPlus,
  ScrollText,
  Wrench,
  Library,
  Gift,
  Receipt,
  Cog,
  Printer,
  Truck,
  Store,
  type LucideIcon,
} from "lucide-react";

export type OperatorRole =
  | "artist"
  | "label"
  | "manager"
  | "non_profit"
  | "manufacturer"
  | "vendor"
  | "fulfillment"
  | "press"
  // Synthetic entry (like "press") for GoodDeed quickprinters — vendors
  // flagged is_quickprinter. They share the vendor role server-side but
  // get a print-centric portal (PrinterPortal.tsx). See VendorScopeRouter.
  | "printer";

export type PartnerVerb =
  | "edit_metadata"
  | "upload_masters"
  | "map_shopify"
  | "manage_payouts"
  | "invite_subusers"
  | "edit_credits_and_gear";

/** Collapsible rail groups. Only "catalog" exists today — mirrors the
 * super-admin's Catalog section (People/Roster + Albums nested under a
 * chevron header directly under Dashboard). */
export type OperatorSectionId = "catalog";

/** Header labels for each collapsible section. */
export const SECTION_LABELS: Record<OperatorSectionId, string> = {
  catalog: "Catalog",
};

export interface OperatorModuleDef {
  id: string;
  label: string;
  /** Lucide glyph shown in the left rail. Shared destinations use the
   * exact icon the super-admin AdminFrame uses. */
  icon: LucideIcon;
  /** When set, this module renders nested under the matching collapsible
   * section header in the rail instead of as a flat top-level row. */
  section?: OperatorSectionId;
  slot?: "main" | "aside";
  roles: readonly OperatorRole[];
  requires?: readonly PartnerVerb[];
}

export const OPERATOR_MODULES: readonly OperatorModuleDef[] = [
  // Artist shell — `/artist` (ArtistDashboard.tsx). Catalog section
  // (People, Albums) sits directly under Dashboard, mirroring the
  // super-admin. The "catalog" module renders the releases list — its id
  // stays "catalog" (ArtistDashboard keys the embedded album view on it)
  // but its LABEL is "Albums".
  { id: "dashboard",   label: "Dashboard",   icon: LayoutDashboard, roles: ["artist"] },
  { id: "people",      label: "People",      icon: User,      section: "catalog", roles: ["artist"] },
  { id: "catalog",     label: "Albums",      icon: Disc3,     section: "catalog", roles: ["artist"] },
  // (Overview merged into Dashboard — Task #2893. Label/manager keep theirs.)
  { id: "audience",    label: "Audience",    icon: Users,     roles: ["artist"] },
  { id: "acquisition", label: "Acquisition", icon: Megaphone, roles: ["artist"] },
  { id: "orders",      label: "Orders",      icon: ShoppingBag, roles: ["artist"] },
  { id: "buyers",      label: "Buyers",      icon: UserCheck, roles: ["artist"] },
  { id: "referrals",   label: "Referrals",   icon: UserPlus,  roles: ["artist"] },
  // Task #2914 — artists connect their own Shopify store from the portal
  // (pre-vetted, no approval gate). Same connect card as /admin/shopify.
  { id: "shopify",     label: "Shopify",     icon: Store,     roles: ["artist"] },
  // Reports renders the shared AdminReports in `embedded` mode INSIDE the
  // artist portal shell (no /admin chrome). See ArtistDashboard.tsx.
  { id: "reports",     label: "Reports",     icon: BarChart3, roles: ["artist"] },

  // Label shell — `/label` (LabelDashboard.tsx). Catalog section (Roster,
  // Albums) under Dashboard. "catalog" relabeled "Albums".
  { id: "dashboard",   label: "Dashboard",   icon: LayoutDashboard, roles: ["label"] },
  // Task #2860 — People (label contacts / Add Admin) gets its own tab,
  // parity with the press portal, instead of hiding inside Overview.
  { id: "people",      label: "People",      icon: User,      section: "catalog", roles: ["label"] },
  { id: "roster",      label: "Roster",      icon: Users,     section: "catalog", roles: ["label"] },
  { id: "catalog",     label: "Albums",      icon: Disc3,     section: "catalog", roles: ["label"] },
  { id: "overview",    label: "Overview",    icon: Activity,  roles: ["label"] },
  { id: "acquisition", label: "Acquisition", icon: Megaphone, roles: ["label"] },
  { id: "orders",      label: "Orders",      icon: ShoppingBag, roles: ["label"] },
  // Reports renders the shared AdminReports in `embedded` mode INSIDE the
  // label portal shell (no /admin chrome). See LabelDashboard.tsx.
  { id: "reports",     label: "Reports",     icon: BarChart3, roles: ["label"] },

  // Manager shell — `/manager` (ManagerDashboard.tsx). No self-serve
  // dashboard/PartnerDashboard tab (managers carry no press provenance
  // and have no /api/partner/manager/dashboard route); reporting only.
  // Catalog section (Roster, Albums) sits under Overview since there's no
  // Dashboard tab. "catalog" relabeled "Albums".
  { id: "overview",  label: "Overview",  icon: Activity,    roles: ["manager"] },
  { id: "roster",    label: "Roster",    icon: Users,  section: "catalog", roles: ["manager"] },
  { id: "catalog",   label: "Albums",    icon: Disc3,  section: "catalog", roles: ["manager"] },
  { id: "orders",    label: "Orders",    icon: ShoppingBag, roles: ["manager"] },

  // Non-profit shell — `/non-profit` (NonProfitDashboard.tsx). No catalog
  // entities, so no Catalog section — flat list. `tree` is gated at the
  // call site by caps.canViewTree.
  { id: "dashboard",   label: "Dashboard",     icon: LayoutDashboard, roles: ["non_profit"] },
  { id: "artists",     label: "Your artists",  icon: Users,      roles: ["non_profit"] },
  { id: "acquisition", label: "Acquisition",   icon: Megaphone,  roles: ["non_profit"] },
  { id: "buyers",      label: "Buyers",        icon: UserCheck,  roles: ["non_profit"] },
  // Invites + Team tree mirror the super-admin System section's
  // "Invites" (UserPlus) and "Invite tree" (Users) glyphs exactly.
  { id: "invites",     label: "Invites",       icon: UserPlus,   roles: ["non_profit"] },
  { id: "ledger",      label: "Album ledger",  icon: ScrollText, roles: ["non_profit"] },
  { id: "tree",        label: "Team tree",     icon: Users,      roles: ["non_profit"] },

  // Vendor + reseller + fulfillment shell — `/vendor` (VendorPortal.tsx)
  // GoodDeed Services is vendor-only server-side (gateVendorAccess in
  // server/routes.ts admits role==='vendor' only); manufacturer +
  // fulfillment scopes get the dashboard tab only. No catalog — flat list.
  { id: "dashboard", label: "Dashboard",         icon: LayoutDashboard, roles: ["vendor", "manufacturer", "fulfillment"] },
  { id: "services",  label: "GoodDeed Services", icon: Wrench,          roles: ["vendor"] },
  // Task #2818 — fulfillment partners (Spinney Media et al) get real
  // work surfaces: fan orders routed to their warehouse + approved
  // press runs inbound to their dock.
  { id: "orders",    label: "Orders",            icon: ShoppingBag,     roles: ["fulfillment"] },
  { id: "inbound",   label: "Inbound",           icon: Truck,           roles: ["fulfillment"] },

  // Press shell — `/vendor` routed via ManufacturerScopeRouter for
  // is_maker manufacturers (PressPortal.tsx). Clients + Projects render
  // FLAT directly under Dashboard (no collapsible Catalog section —
  // flattened per Bill, Task #2838). The press's own "catalog" tab is
  // the VINYL PRODUCT catalog (not releases) — relabeled "Vinyl catalog"
  // alongside GoodDeed pricing + Settings. GoodDeed pricing renders
  // INLINE (Task #2075).
  { id: "dashboard",   label: "Dashboard",        icon: LayoutDashboard,  roles: ["press"] },
  // Icons follow the press playground mock canon (Bill, Aug 2026):
  // Clients=Users, Acquisition=UserPlus, Catalog=Library, Referrals=Gift.
  { id: "people",     label: "Clients",          icon: Users,            roles: ["press"] },
  { id: "albums",     label: "Projects",         icon: Disc3,            roles: ["press"] },
  { id: "acquisition", label: "Acquisition",    icon: UserPlus,         roles: ["press"] },
  { id: "catalog",    label: "Catalog",          icon: Library,          roles: ["press"] },
  { id: "pricing",    label: "GoodDeed pricing", icon: Receipt,          roles: ["press"] },
  { id: "settings",   label: "Settings",         icon: Cog,              roles: ["press"] },
  { id: "referrals",  label: "Referrals",        icon: Gift,             roles: ["press"] },

  // GoodDeed Quickprinter shell — `/vendor` routed via VendorScopeRouter
  // for is_quickprinter vendors (PrinterPortal.tsx). Print Queue stays the
  // first item under Dashboard (deliberate centerpiece). Catalog section
  // (People & Labels, Albums) follows. The printer's own "catalog" tab is
  // the GoodDeed pricing editor — relabeled "GoodDeed pricing" and left flat.
  { id: "dashboard",   label: "Dashboard",       icon: LayoutDashboard,  roles: ["printer"] },
  { id: "print-queue", label: "Print Queue",     icon: Printer,          roles: ["printer"] },
  { id: "people",      label: "People & Labels", icon: User,   section: "catalog", roles: ["printer"] },
  { id: "albums",      label: "Albums",          icon: Disc3,  section: "catalog", roles: ["printer"] },
  { id: "catalog",     label: "GoodDeed pricing", icon: Receipt,         roles: ["printer"] },
  { id: "settings",    label: "Settings",        icon: Cog,              roles: ["printer"] },
];

export function modulesForRole(
  role: OperatorRole,
  grantedVerbs?: ReadonlySet<PartnerVerb>,
): OperatorModuleDef[] {
  return OPERATOR_MODULES.filter((m) => {
    if (!m.roles.includes(role)) return false;
    if (m.requires && m.requires.length > 0) {
      if (!grantedVerbs) return false;
      return m.requires.every((v) => grantedVerbs.has(v));
    }
    return true;
  });
}
