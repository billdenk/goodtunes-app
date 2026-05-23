import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/Spinner";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// Task #79 — Per-partner permissions card. Reused by AdminLabel +
// AdminPerson; the only difference is the scope kind (`label` vs.
// `artist`). Defaults from the server are conservative (all-off,
// metadata edits require approval) so a freshly-invited partner can
// browse the admin without immediately being able to rewrite history.

interface Permissions {
  scopeKind: string;
  scopeId: string;
  editMetadata: boolean;
  uploadMasters: boolean;
  mapShopify: boolean;
  managePayouts: boolean;
  inviteSubusers: boolean;
  metadataEditsRequireApproval: boolean;
}

interface RoleInfo {
  role: "super_admin" | "admin" | "label" | "artist" | "manufacturer" | "fulfillment";
  roleScopeId: string | null;
}

interface Props {
  scopeKind: "label" | "artist" | "manufacturer" | "fulfillment";
  scopeId: string;
  scopeName: string;
}

const VERBS: Array<{ key: keyof Permissions; label: string; hint: string }> = [
  { key: "editMetadata", label: "Edit metadata", hint: "Album + track titles, descriptions, credits, bio." },
  { key: "uploadMasters", label: "Upload masters", hint: "Replace song audio + cover art." },
  { key: "mapShopify", label: "Map Shopify products", hint: "Connect Shopify variants to GoodTunes albums." },
  { key: "managePayouts", label: "Manage payouts", hint: "Edit the Stripe Connect account and payout overrides." },
  { key: "inviteSubusers", label: "Invite sub-users", hint: "Send invites that share this same scope." },
];

export function PartnerPermissionsPanel({ scopeKind, scopeId, scopeName }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const queryKey = ["/api/admin/partner-permissions", scopeKind, scopeId];

  const { data: role } = useQuery<RoleInfo>({ queryKey: ["/api/me/role"] });
  const isSuperAdmin = role?.role === "super_admin";

  const { data, isLoading } = useQuery<Permissions>({ queryKey, enabled: !!scopeId });

  const [draft, setDraft] = useState<Permissions | null>(null);
  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  const save = useMutation({
    mutationFn: async (patch: Partial<Permissions>) => {
      const r = await apiRequest(
        "PUT",
        `/api/admin/partner-permissions/${scopeKind}/${scopeId}`,
        patch,
      );
      return r.json();
    },
    onSuccess: (row: Permissions) => {
      qc.setQueryData(queryKey, row);
      toast({ title: "Permissions saved." });
    },
    onError: (e: any) => {
      toast({
        title: "Couldn't save permissions",
        description: e?.message || "Try again.",
        variant: "destructive",
      });
    },
  });

  if (isLoading || !draft) {
    return (
      <Card className="p-6 mt-6" data-testid="card-partner-permissions-loading">
        <Spinner />
      </Card>
    );
  }

  const dirty = data
    ? VERBS.some((v) => draft[v.key] !== data[v.key]) ||
      draft.metadataEditsRequireApproval !== data.metadataEditsRequireApproval
    : false;

  function toggle(key: keyof Permissions) {
    if (!isSuperAdmin) return;
    setDraft((d) => (d ? { ...d, [key]: !d[key] } : d));
  }

  return (
    <Card className="p-6 mt-6 bg-white border border-slate-200" data-testid="card-partner-permissions">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-slate-900">Partner permissions</h2>
          <p className="text-[12.5px] text-slate-500 mt-0.5">
            What signed-in users scoped to <span className="font-medium text-slate-700">{scopeName}</span> can do
            in admin. Super-admin always bypasses these gates.
          </p>
        </div>
        {!isSuperAdmin && (
          <span
            className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-500"
            data-testid="badge-read-only-permissions"
          >
            Read-only
          </span>
        )}
      </div>

      <div className="space-y-1 divide-y divide-slate-100">
        {VERBS.map((v) => (
          <div
            key={v.key}
            className="flex items-center justify-between gap-4 py-3"
            data-testid={`row-permission-${v.key}`}
          >
            <div className="min-w-0">
              <div className="text-[13.5px] font-medium text-slate-900">{v.label}</div>
              <div className="text-[12px] text-slate-500">{v.hint}</div>
            </div>
            <Switch
              checked={!!draft[v.key]}
              disabled={!isSuperAdmin || save.isPending}
              onCheckedChange={() => toggle(v.key)}
              data-testid={`switch-permission-${v.key}`}
            />
          </div>
        ))}
        <div className="flex items-center justify-between gap-4 py-3">
          <div className="min-w-0">
            <div className="text-[13.5px] font-medium text-slate-900">
              Metadata edits require GoodTunes approval
            </div>
            <div className="text-[12px] text-slate-500">
              When on, partner edits to album / track metadata land in the review queue instead of
              applying directly.
            </div>
          </div>
          <Switch
            checked={!!draft.metadataEditsRequireApproval}
            disabled={!isSuperAdmin || save.isPending}
            onCheckedChange={() => toggle("metadataEditsRequireApproval")}
            data-testid="switch-permission-metadataEditsRequireApproval"
          />
        </div>
      </div>

      {isSuperAdmin && (
        <div className="flex items-center justify-end gap-2 pt-4 mt-2 border-t border-slate-100">
          <Button
            type="button"
            onClick={() => data && setDraft(data)}
            disabled={!dirty || save.isPending}
            className="bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
            data-testid="button-reset-permissions"
          >
            Reset
          </Button>
          <Button
            type="button"
            onClick={() => {
              const patch: Partial<Permissions> = {};
              if (!data) return;
              for (const v of VERBS) {
                if (draft[v.key] !== data[v.key]) (patch as any)[v.key] = draft[v.key];
              }
              if (draft.metadataEditsRequireApproval !== data.metadataEditsRequireApproval) {
                patch.metadataEditsRequireApproval = draft.metadataEditsRequireApproval;
              }
              save.mutate(patch);
            }}
            disabled={!dirty || save.isPending}
            className="bg-[var(--brand-blue)] text-white hover:opacity-90"
            data-testid="button-save-permissions"
          >
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      )}
    </Card>
  );
}
