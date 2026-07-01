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

export interface OperatorModuleDef {
  id: string;
  label: string;
  slot?: "main" | "aside";
  roles: readonly OperatorRole[];
  requires?: readonly PartnerVerb[];
}

export const OPERATOR_MODULES: readonly OperatorModuleDef[] = [
  // Artist shell — `/artist` (ArtistDashboard.tsx)
  { id: "dashboard",   label: "Dashboard",   roles: ["artist"] },
  { id: "overview",    label: "Overview",    roles: ["artist"] },
  { id: "audience",    label: "Audience",    roles: ["artist"] },
  { id: "acquisition", label: "Acquisition", roles: ["artist"] },
  { id: "catalog",     label: "Catalog",     roles: ["artist"] },
  { id: "orders",      label: "Orders",      roles: ["artist"] },
  { id: "buyers",      label: "Buyers",      roles: ["artist"] },
  { id: "referrals",   label: "Referrals",   roles: ["artist"] },

  // Label shell — `/label` (LabelDashboard.tsx)
  { id: "dashboard",   label: "Dashboard",   roles: ["label"] },
  { id: "overview",    label: "Overview",    roles: ["label"] },
  { id: "acquisition", label: "Acquisition", roles: ["label"] },
  { id: "roster",      label: "Roster",      roles: ["label"] },
  { id: "catalog",     label: "Catalog",     roles: ["label"] },
  { id: "orders",      label: "Orders",      roles: ["label"] },

  // Manager shell — `/manager` (ManagerDashboard.tsx). No self-serve
  // dashboard/PartnerDashboard tab (managers carry no press provenance
  // and have no /api/partner/manager/dashboard route); reporting only.
  { id: "overview",  label: "Overview",  roles: ["manager"] },
  { id: "roster",    label: "Roster",    roles: ["manager"] },
  { id: "catalog",   label: "Catalog",   roles: ["manager"] },
  { id: "orders",    label: "Orders",    roles: ["manager"] },

  // Non-profit shell — `/non-profit` (NonProfitDashboard.tsx)
  { id: "dashboard",   label: "Dashboard",     roles: ["non_profit"] },
  { id: "artists",     label: "Your artists",  roles: ["non_profit"] },
  { id: "acquisition", label: "Acquisition",   roles: ["non_profit"] },
  { id: "buyers",      label: "Buyers",        roles: ["non_profit"] },
  { id: "invites",     label: "Invites",       roles: ["non_profit"] },

  // Vendor + reseller + fulfillment shell — `/vendor` (VendorPortal.tsx)
  // GoodDeed Services is vendor-only server-side (gateVendorAccess in
  // server/routes.ts admits role==='vendor' only); manufacturer +
  // fulfillment scopes get the dashboard tab only.
  { id: "dashboard", label: "Dashboard",         roles: ["vendor", "manufacturer", "fulfillment"] },
  { id: "services",  label: "GoodDeed Services", roles: ["vendor"] },

  // Press shell — `/vendor` routed via ManufacturerScopeRouter for
  // is_maker manufacturers (PressPortal.tsx). Catalog promoted to first-class
  // nav tab (Task #2188); Pipeline + Reports removed from nav (still reachable
  // via direct ?tab= URL). GoodDeed pricing renders INLINE (Task #2075).
  { id: "dashboard", label: "Dashboard",        roles: ["press"] },
  { id: "people",    label: "People",           roles: ["press"] },
  { id: "catalog",   label: "Catalog",          roles: ["press"] },
  { id: "pricing",   label: "GoodDeed pricing", roles: ["press"] },
  { id: "settings",  label: "Settings",         roles: ["press"] },

  // GoodDeed Quickprinter shell — `/vendor` routed via VendorScopeRouter
  // for is_quickprinter vendors (PrinterPortal.tsx). Print Queue is the
  // centerpiece; Catalog is the GoodDeed Services pricing editor; Albums
  // and People are derived read-only views of who they print for.
  { id: "dashboard",   label: "Dashboard",       roles: ["printer"] },
  { id: "print-queue", label: "Print Queue",     roles: ["printer"] },
  { id: "catalog",     label: "Catalog",         roles: ["printer"] },
  { id: "albums",      label: "Albums",          roles: ["printer"] },
  { id: "people",      label: "People & Labels", roles: ["printer"] },
  { id: "settings",    label: "Settings",        roles: ["printer"] },
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
