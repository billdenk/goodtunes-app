import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  ROLE_OPTIONS,
  ROLE_LABEL,
  SCOPE_CONFIG,
  ScopePicker,
} from "@/components/admin/RoleScopePicker";

/**
 * Shared "Make admin" dialog (Task #1342).
 *
 * Promotes a fan account to an admin/partner role using their existing
 * password + linked sign-ins. Extracted from AdminCustomers so the same
 * dialog can open from the Customers list (formerly a per-row button,
 * now removed) and the Customer detail page's quiet action.
 */
export function PromoteCustomerDialog({
  customer,
  onClose,
  onPromoted,
}: {
  customer: { id: string; name: string; email: string };
  onClose: () => void;
  onPromoted: () => void;
}) {
  const [role, setRole] = useState("super_admin");
  const [scopeId, setScopeId] = useState<string | null>(null);
  const needsScope = !!SCOPE_CONFIG[role];
  const { toast } = useToast();

  const promote = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/admin/customers/${customer.id}/promote`, {
        role,
        roleScopeId: needsScope ? scopeId : null,
      });
      return r.json();
    },
    onSuccess: () => onPromoted(),
    onError: (err: any) => {
      toast({ title: "Could not promote", description: err?.message ?? "Try again." });
    },
  });

  const canSubmit = !needsScope || !!scopeId;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
      data-testid="dialog-promote-customer"
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Make admin</h2>
            <p className="text-xs text-slate-500">
              {customer.name} &lt;{customer.email}&gt;
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            aria-label="Close"
            data-testid="button-close-promote"
          >
            <X className="w-4 h-4" />
            <span className="sr-only">Close</span>
          </button>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm text-slate-600 leading-relaxed mb-3">
            Grants admin access using <strong>{customer.email}</strong>&apos;s existing
            password and any linked Google/Apple sign-in. No email is sent.
          </p>
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
            Role
          </label>
          <select
            value={role}
            onChange={(e) => {
              setRole(e.target.value);
              setScopeId(null);
            }}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white focus:border-[var(--brand-blue)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]/20"
            data-testid="select-promote-role"
          >
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {needsScope && (
            <ScopePicker
              cfg={SCOPE_CONFIG[role]}
              value={scopeId}
              onChange={(id) => setScopeId(id)}
              testId="promote-scope"
            />
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-4 rounded-md text-sm font-medium text-slate-600 hover:bg-slate-100"
            data-testid="button-cancel-promote"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit || promote.isPending}
            onClick={() => promote.mutate()}
            className="min-h-[44px] px-4 rounded-md text-sm font-semibold bg-[var(--brand-purple)] text-white hover:opacity-90 disabled:bg-slate-300 disabled:cursor-not-allowed disabled:opacity-100"
            data-testid="button-confirm-promote"
          >
            {promote.isPending ? "Promoting…" : `Make ${ROLE_LABEL[role] || role}`}
          </button>
        </div>
      </div>
    </div>
  );
}
