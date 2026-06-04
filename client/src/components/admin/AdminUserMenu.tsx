import { useState } from "react";
import { useLocation } from "wouter";
import { LogOut, ShieldCheck, UserPlus, Heart, Check, UserPen } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AdminEditProfileDialog } from "@/components/admin/AdminEditProfileDialog";

function initialsFor(name: string | undefined, email: string | undefined): string {
  const source = (name || "").trim();
  if (source) {
    const parts = source.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  }
  if (email) return email.slice(0, 2).toUpperCase();
  return "??";
}

type Membership = {
  key: string;
  role: string;
  scopeKind: string | null;
  scopeId: string | null;
  subRole: string | null;
  scopeName: string | null;
  isActive: boolean;
};

// Friendly labels for the hat-switcher. Mirrors the role vocabulary in
// docs/roles-and-permissions.md; the scope entity's own name (scopeName)
// rides alongside, e.g. "Artist · Nick Carter".
const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  label: "Label",
  artist: "Artist",
  non_profit: "Non-Profit",
  manufacturer: "Press",
  fulfillment: "Fulfillment",
  vendor: "Vendor",
};

function membershipLabel(m: Membership): string {
  const role = ROLE_LABELS[m.role] ?? m.role;
  return m.scopeName ? `${role} · ${m.scopeName}` : role;
}

export function AdminUserMenu() {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();
  // Task #1237 — "Edit profile" opens an admin-styled dialog *over* the
  // current admin page (left nav + shell stay visible) instead of
  // navigating to the fan player's dark-chrome editor at /account/edit.
  const [editProfileOpen, setEditProfileOpen] = useState(false);

  // Task #1038 — Unified identity P3. List every hat this account holds so a
  // multi-membership operator can switch the active one. Single-membership
  // accounts get a one-item list → the switcher section is hidden entirely,
  // so their menu is byte-for-byte the old menu (ZERO behavior change).
  const { data: membershipsResp } = useQuery<{ memberships: Membership[]; activeKey: string | null }>({
    queryKey: ["/api/me/memberships"],
    enabled: !!user,
  });
  // The resolved primary/active hat (mirrors what every gate sees). Used to
  // tick the currently-active row even when no explicit override is stored
  // (activeKey null → primary hat is active by default).
  const { data: roleInfo } = useQuery<{ role: string; roleScopeId: string | null }>({
    queryKey: ["/api/me/role"],
    enabled: !!user,
  });

  const switchHat = useMutation({
    mutationFn: async (key: string | null) => {
      await apiRequest("POST", "/api/me/active-membership", { key });
    },
    onSuccess: () => {
      // Switching the active hat re-scopes the sidebar, album list, reports,
      // and edit-permissions across the whole shell. Every admin query caches
      // at staleTime: Infinity and most aren't keyed by role, so a clean hard
      // navigation to /admin is the safe re-scope — route guards then land the
      // operator on the chosen hat's shell.
      window.location.href = "/admin";
    },
  });

  if (!user) return null;

  const initials = initialsFor(user.displayName, user.email);
  const displayName = user.displayName || user.username || user.email;

  const memberships = membershipsResp?.memberships ?? [];
  const showSwitcher = memberships.length >= 2;
  const isActiveHat = (m: Membership): boolean => {
    if (membershipsResp?.activeKey) return m.key === membershipsResp.activeKey;
    // No explicit override → the resolved primary (from /api/me/role) is active.
    return m.role === roleInfo?.role && (m.scopeId ?? null) === (roleInfo?.roleScopeId ?? null);
  };

  const handleSignOut = async () => {
    try {
      await logout();
    } finally {
      navigate("/admin/login");
    }
  };

  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          data-testid="button-admin-user-menu"
          className="w-8 h-8 rounded-full bg-[var(--brand-blue)] text-white text-[12px] font-semibold flex items-center justify-center tracking-wide overflow-hidden hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)] focus-visible:ring-offset-2"
        >
          {user.photoUrl ? (
            <img
              src={user.photoUrl}
              alt=""
              className="w-full h-full object-cover"
              data-testid="img-admin-user-avatar"
            />
          ) : (
            initials
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-60 bg-white border border-slate-200 shadow-lg text-slate-900"
        data-testid="menu-admin-user"
      >
        <DropdownMenuLabel className="font-normal py-2">
          <div className="text-[13px] font-semibold text-slate-900 truncate" data-testid="text-admin-user-name">
            {displayName}
          </div>
          <div className="text-[11.5px] text-slate-500 truncate" data-testid="text-admin-user-email">
            {user.email}
          </div>
        </DropdownMenuLabel>

        {showSwitcher && (
          <>
            <DropdownMenuSeparator className="bg-slate-200" />
            <DropdownMenuLabel className="text-xs uppercase tracking-wide text-slate-400 font-medium py-1.5">
              Switch hat
            </DropdownMenuLabel>
            {memberships.map((m) => {
              const active = isActiveHat(m);
              return (
                <DropdownMenuItem
                  key={m.key}
                  disabled={switchHat.isPending || active}
                  onClick={() => {
                    if (active) return;
                    switchHat.mutate(m.key);
                  }}
                  data-testid={`menu-item-hat-${m.key}`}
                  className="text-[13px] cursor-pointer text-slate-700 focus:bg-slate-100 focus:text-slate-900"
                >
                  <Check
                    className={`w-4 h-4 mr-2 ${active ? "text-[color:var(--brand-blue)]" : "text-transparent"}`}
                  />
                  <span className="truncate">{membershipLabel(m)}</span>
                </DropdownMenuItem>
              );
            })}
          </>
        )}

        <DropdownMenuSeparator className="bg-slate-200" />
        <DropdownMenuItem
          onClick={() => setEditProfileOpen(true)}
          data-testid="menu-item-edit-profile"
          className="text-[13px] cursor-pointer text-slate-700 focus:bg-slate-100 focus:text-slate-900"
        >
          <UserPen className="w-4 h-4 mr-2 text-slate-500" />
          Edit profile
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => navigate("/admin/invites")}
          data-testid="menu-item-invites"
          className="text-[13px] cursor-pointer text-slate-700 focus:bg-slate-100 focus:text-slate-900"
        >
          <UserPlus className="w-4 h-4 mr-2 text-slate-500" />
          Invite teammate
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => navigate("/admin/earmarked-artists")}
          data-testid="menu-item-earmarked"
          className="text-[13px] cursor-pointer text-slate-700 focus:bg-slate-100 focus:text-slate-900"
        >
          <Heart className="w-4 h-4 mr-2 text-slate-500" />
          Earmarked artists
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => navigate("/admin/security")}
          data-testid="menu-item-security"
          className="text-[13px] cursor-pointer text-slate-700 focus:bg-slate-100 focus:text-slate-900"
        >
          <ShieldCheck className="w-4 h-4 mr-2 text-slate-500" />
          Security
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-slate-200" />
        <DropdownMenuItem
          onClick={handleSignOut}
          data-testid="menu-item-sign-out"
          className="text-[13px] cursor-pointer text-slate-700 focus:bg-slate-100 focus:text-slate-900"
        >
          <LogOut className="w-4 h-4 mr-2 text-slate-500" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <AdminEditProfileDialog open={editProfileOpen} onOpenChange={setEditProfileOpen} />
    </>
  );
}
