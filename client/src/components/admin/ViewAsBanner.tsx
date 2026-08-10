// View-as indicator — a single compact pill in the portal header (left of
// the Feedback launcher). Replaces the old full-width blue banner (Task
// #2918 dismiss/restore logic is gone with it — the pill is always visible
// while impersonating, and the header keeps its normal height).
//
// Clicking the pill — or its small X — exits the view-as session; Esc does
// too. Exit clears the tab-scoped token, drops the query cache (so the next
// request goes without the impersonation header), and lands the operator
// back exactly where they were before entering view-as (the god-view path
// captured at mint time), falling back to the admin dashboard.

import { useEffect } from "react";
import { X, Eye } from "lucide-react";
import { useLocation } from "wouter";
import {
  getViewAsLabel,
  getViewAsReturnTo,
  clearViewAsSession,
  queryClient,
} from "@/lib/queryClient";

export function exitViewAs(navigate: (to: string) => void) {
  const returnTo = getViewAsReturnTo();
  clearViewAsSession();
  // Force-refetch all queries without the impersonation header.
  queryClient.clear();
  // getViewAsReturnTo() already re-validates the stored path (same-app
  // relative only) — null means missing or unsafe.
  navigate(returnTo ?? "/admin/dashboard");
}

export function ViewAsPill() {
  const label = getViewAsLabel();
  const [, navigate] = useLocation();

  // Esc exits view-as. Deliberate layering: when an open dialog/popover
  // handles Esc first (defaultPrevented), that Esc closes it and the NEXT
  // Esc exits view-as — exiting mid-dialog would be jarring. Typing in a
  // field is also exempt.
  useEffect(() => {
    if (!label) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      exitViewAs(navigate);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [label, navigate]);

  if (!label) return null;

  return (
    <button
      type="button"
      onClick={() => exitViewAs(navigate)}
      title={`Viewing as ${label} — click to exit (Esc)`}
      className="flex items-center gap-1.5 rounded-full bg-blue-50 text-blue-800 pl-2.5 pr-1.5 py-1 text-xs font-medium max-w-[260px] shrink-0 hover:bg-blue-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)]"
      data-testid="pill-view-as"
    >
      <Eye className="w-3.5 h-3.5 shrink-0" />
      <span className="truncate">
        Viewing as <span className="font-semibold" data-testid="pill-view-as-label">{label}</span>
      </span>
      <span
        aria-hidden="true"
        className="rounded-full p-0.5 hover:bg-blue-200/70 transition-colors"
        data-testid="button-exit-view-as"
      >
        <X className="w-3 h-3" />
      </span>
    </button>
  );
}
