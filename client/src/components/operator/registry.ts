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
  | "press";

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
  { id: "overview",  label: "Overview",  roles: ["artist"] },
  { id: "audience",  label: "Audience",  roles: ["artist"] },
  { id: "catalog",   label: "Catalog",   roles: ["artist"] },
  { id: "orders",    label: "Orders",    roles: ["artist"] },
  { id: "buyers",    label: "Buyers",    roles: ["artist"] },
  { id: "referrals", label: "Referrals", roles: ["artist"] },

  // Label shell — `/label` (LabelDashboard.tsx)
  { id: "dashboard", label: "Dashboard", roles: ["label"] },
  { id: "overview",  label: "Overview",  roles: ["label"] },
  { id: "roster",    label: "Roster",    roles: ["label"] },
  { id: "catalog",   label: "Catalog",   roles: ["label"] },
  { id: "orders",    label: "Orders",    roles: ["label"] },

  // Manager shell — `/manager` (ManagerDashboard.tsx). No self-serve
  // dashboard/PartnerDashboard tab (managers carry no press provenance
  // and have no /api/partner/manager/dashboard route); reporting only.
  { id: "overview",  label: "Overview",  roles: ["manager"] },
  { id: "roster",    label: "Roster",    roles: ["manager"] },
  { id: "catalog",   label: "Catalog",   roles: ["manager"] },
  { id: "orders",    label: "Orders",    roles: ["manager"] },

  // Non-profit shell — `/non-profit` (NonProfitDashboard.tsx)
  { id: "dashboard", label: "Dashboard",     roles: ["non_profit"] },
  { id: "artists",   label: "Your artists",  roles: ["non_profit"] },
  { id: "buyers",    label: "Buyers",        roles: ["non_profit"] },
  { id: "invites",   label: "Invites",       roles: ["non_profit"] },

  // Vendor + reseller + fulfillment shell — `/vendor` (VendorPortal.tsx)
  // GoodDeed Services is vendor-only server-side (gateVendorAccess in
  // server/routes.ts admits role==='vendor' only); manufacturer +
  // fulfillment scopes get the dashboard tab only.
  { id: "dashboard", label: "Dashboard",         roles: ["vendor", "manufacturer", "fulfillment"] },
  { id: "services",  label: "GoodDeed Services", roles: ["vendor"] },

  // Press shell — `/vendor` routed via ManufacturerScopeRouter for
  // is_maker manufacturers (PressPortal.tsx).
  { id: "dashboard", label: "Dashboard", roles: ["press"] },
  { id: "customers", label: "Customers", roles: ["press"] },
  { id: "pipeline",  label: "Pipeline",  roles: ["press"] },
  { id: "settings",  label: "Settings",  roles: ["press"] },
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
