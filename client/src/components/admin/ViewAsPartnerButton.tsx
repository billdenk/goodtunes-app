// "View as this partner" entry-point button — shown only to super-admins on
// partner detail pages (AdminManufacturer, AdminLabel, AdminNonProfit, etc.).
// Mints a short-lived HMAC token via POST /api/admin/view-as/mint and opens
// the partner's genuine restricted portal in a NEW tab. The current god-view
// tab is completely unaffected. Fetches meRole from the query cache (already
// loaded by the parent page) — renders null for non-super-admin callers.

import { useState } from "react";
import { Eye } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export type PartnerRoleKind =
  | "manufacturer"
  | "label"
  | "artist"
  | "non_profit"
  | "vendor"
  | "fulfillment"
  | "manager";

const PORTAL_PATH: Record<PartnerRoleKind, string> = {
  manufacturer: "/vendor",
  label: "/label",
  artist: "/artist",
  non_profit: "/non-profit",
  vendor: "/vendor",
  fulfillment: "/vendor",
  manager: "/manager",
};

export interface ViewAsPartnerButtonProps {
  role: PartnerRoleKind;
  /** defaults to role when omitted */
  scopeKind?: string | null;
  scopeId: string;
  label: string;
  /** button copy — defaults to "View as this partner" */
  buttonText?: string;
  /** overrides the default data-testid when set */
  testId?: string;
}

export function ViewAsPartnerButton({
  role,
  scopeKind,
  scopeId,
  label,
  buttonText = "View as this partner",
  testId = "button-view-as-partner",
}: ViewAsPartnerButtonProps) {
  const { data: meRole } = useQuery<{ role: string }>({ queryKey: ["/api/me/role"] });
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  if (meRole?.role !== "super_admin") return null;

  async function handleViewAs() {
    setLoading(true);
    try {
      const r = await apiRequest("POST", "/api/admin/view-as/mint", {
        role,
        scopeKind: scopeKind ?? role,
        scopeId,
        label,
      });
      const { token, scopeDivergentWarning } = (await r.json()) as {
        token: string;
        label: string;
        /** Task #2865 — set when one or more accounts with this role have
         * a NULL scope, meaning God Mode view-as may show more than the
         * real partner login. Operator should investigate & repair the
         * affected account before relying on this view. */
        scopeDivergentWarning?: string;
      };
      const portalPath = PORTAL_PATH[role];
      const hash = `viewas=${encodeURIComponent(token)}&viewaslabel=${encodeURIComponent(label)}`;
      window.open(`${portalPath}#${hash}`, "_blank", "noopener,noreferrer");
      // Warn the operator that the real account may look different from
      // what view-as is showing (scope-less account defect).
      if (scopeDivergentWarning) {
        toast({
          title: "⚠ View-as may not match the real login",
          description: scopeDivergentWarning,
          variant: "destructive",
        });
      }
    } catch (e: any) {
      toast({
        title: "Couldn't open partner view",
        description: e?.message ?? "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleViewAs}
      disabled={loading}
      className="flex items-center gap-1.5 text-xs h-7 px-2.5 rounded-full border-[var(--apple-hairline)] text-[var(--apple-subink)] hover:text-[var(--brand-blue)] hover:border-[var(--brand-blue)]"
      data-testid={testId}
    >
      <Eye className="w-3.5 h-3.5" />
      {buttonText}
    </Button>
  );
}
