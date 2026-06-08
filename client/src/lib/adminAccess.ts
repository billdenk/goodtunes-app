// Single source of truth for which admin roles can reach /admin/security.
// Artist-partner accounts are blocked from the Security page by the route
// guard in App.tsx, so the account-menu Security item must use this same
// predicate to avoid showing a dead entry. Keep both call sites pointed
// here so the menu and the guard can never drift.
export function canAccessAdminSecurity(role: string | null | undefined): boolean {
  return role !== "artist";
}
