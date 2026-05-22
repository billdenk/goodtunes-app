import { useLocation } from "wouter";
import { LogOut, ShieldCheck, UserPlus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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

export function AdminUserMenu() {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();

  if (!user) return null;

  const initials = initialsFor(user.displayName, user.email);
  const displayName = user.displayName || user.username || user.email;

  const handleSignOut = async () => {
    try {
      await logout();
    } finally {
      navigate("/admin/login");
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          data-testid="button-admin-user-menu"
          className="w-8 h-8 rounded-full bg-[var(--brand-blue)] text-white text-[12px] font-semibold flex items-center justify-center tracking-wide hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)] focus-visible:ring-offset-2"
        >
          {initials}
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
        <DropdownMenuSeparator className="bg-slate-200" />
        <DropdownMenuItem
          onClick={() => navigate("/admin/invites")}
          data-testid="menu-item-invites"
          className="text-[13px] cursor-pointer text-slate-700 focus:bg-slate-100 focus:text-slate-900"
        >
          <UserPlus className="w-4 h-4 mr-2 text-slate-500" />
          Invite teammate
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
  );
}
