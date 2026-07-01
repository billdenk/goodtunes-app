// Persistent banner shown in every partner-portal tab that was opened via
// "View as this partner". Reads label from sessionStorage (tab-scoped).
// Exit clears the session token, invalidates all queries (so the next
// request goes without the impersonation header), and redirects back to
// the god-view admin dashboard.

import { X, Eye } from "lucide-react";
import { useLocation } from "wouter";
import { getViewAsLabel, clearViewAsSession } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";

export function ViewAsBanner() {
  const label = getViewAsLabel();
  const [, navigate] = useLocation();

  if (!label) return null;

  function handleExit() {
    clearViewAsSession();
    // Force-refetch all queries without the impersonation header.
    queryClient.clear();
    navigate("/admin/dashboard");
  }

  return (
    <div
      className="w-full bg-[var(--brand-blue)] text-white flex items-center gap-3 px-4 py-2.5 text-sm font-medium z-50 flex-shrink-0"
      data-testid="banner-view-as"
      role="banner"
    >
      <Eye className="w-4 h-4 flex-shrink-0" />
      <span className="flex-1">
        Viewing as{" "}
        <span className="font-semibold" data-testid="banner-view-as-label">
          {label}
        </span>
        {" "}— changes you make are attributed to your super-admin account.
      </span>
      <button
        type="button"
        onClick={handleExit}
        className="flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold bg-white/20 hover:bg-white/30 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--brand-blue)]"
        data-testid="button-exit-view-as"
      >
        <X className="w-3.5 h-3.5" />
        Exit view
      </button>
    </div>
  );
}
