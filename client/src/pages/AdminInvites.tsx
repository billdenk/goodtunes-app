import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Copy, Check } from "lucide-react";

interface PendingInvite {
  id: string;
  email: string;
  role: string;
  roleScopeId: string | null;
  expiresAt: string;
  createdAt: string;
}

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "super_admin", label: "Super Admin (full access)" },
  { value: "label", label: "Label" },
  { value: "artist", label: "Artist" },
  { value: "manufacturer", label: "Manufacturer" },
  { value: "fulfillment", label: "Fulfillment Partner" },
];

const ROLE_LABEL: Record<string, string> = Object.fromEntries(
  ROLE_OPTIONS.map((o) => [o.value, o.label.replace(/ \(.*\)$/, "")]),
);

export function AdminInvites() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("super_admin");
  const [lastUrl, setLastUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: invites = [], isLoading } = useQuery<PendingInvite[]>({
    queryKey: ["/api/admin/invites"],
  });

  const createMutation = useMutation({
    mutationFn: async (body: { email: string; role: string }) => {
      const r = await apiRequest("POST", "/api/admin/invites", body);
      return r.json() as Promise<{
        id: string;
        email: string;
        role: string;
        acceptUrl: string;
        emailDelivered: boolean;
      }>;
    },
    onSuccess: (data) => {
      setEmail("");
      setRole("super_admin");
      setLastUrl(data.acceptUrl);
      setCopied(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invites"] });
      toast({
        title: data.emailDelivered ? "Invite sent" : "Invite created (email failed)",
        description: data.emailDelivered
          ? `Emailed ${data.email}.`
          : `${data.email} — copy the link below and share it manually.`,
      });
    },
    onError: (e: Error) => {
      toast({ title: "Could not send invite", description: e.message, variant: "destructive" });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/invites/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invites"] });
      toast({ title: "Invite revoked" });
    },
  });

  async function copyUrl() {
    if (!lastUrl) return;
    try {
      await navigator.clipboard.writeText(lastUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  return (
    <AdminFrame active="albums">
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold text-slate-900 mb-1" data-testid="text-page-title">Invites</h1>
        <p className="text-sm text-slate-600 mb-6">
          Invite a teammate to the admin. They'll receive an email with a one-time link to set their username + password.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!email.trim()) return;
            createMutation.mutate({ email: email.trim(), role });
          }}
          className="bg-white border border-slate-200 rounded-2xl p-5 mb-6"
          data-testid="form-create-invite"
        >
          <div className="grid grid-cols-1 sm:grid-cols-[1fr,200px,auto] gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="name@example.com"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:border-[var(--brand-blue)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]/20"
                data-testid="input-invite-email"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white focus:border-[var(--brand-blue)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]/20"
                data-testid="select-invite-role"
              >
                {ROLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={createMutation.isPending || !email.trim()}
              className="bg-[var(--brand-blue)] hover:bg-[#2789bd] disabled:bg-slate-300 text-white font-semibold rounded-lg px-4 py-2 transition-colors"
              data-testid="button-send-invite"
            >
              {createMutation.isPending ? "Sending…" : "Send invite"}
            </button>
          </div>

          {lastUrl && (
            <div className="mt-4 bg-slate-50 border border-slate-200 rounded-lg p-3" data-testid="last-invite-url">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] uppercase tracking-wide font-semibold text-slate-500">Invite link</div>
                <button
                  type="button"
                  onClick={copyUrl}
                  className="text-xs font-semibold text-[var(--brand-blue)] hover:underline flex items-center gap-1"
                  data-testid="button-copy-url"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <div className="mt-1 text-xs text-slate-700 break-all font-mono">{lastUrl}</div>
            </div>
          )}
        </form>

        <h2 className="text-sm font-semibold text-slate-900 mb-3">Pending</h2>
        {isLoading ? (
          <div className="text-sm text-slate-500">Loading…</div>
        ) : invites.length === 0 ? (
          <div className="text-sm text-slate-500 bg-white border border-slate-200 rounded-2xl p-6 text-center" data-testid="empty-invites">
            No pending invites.
          </div>
        ) : (
          <ul className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100" data-testid="list-invites">
            {invites.map((inv) => {
              const expires = new Date(inv.expiresAt);
              const expired = expires < new Date();
              return (
                <li key={inv.id} className="flex items-center justify-between px-4 py-3" data-testid={`row-invite-${inv.id}`}>
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900 truncate">{inv.email}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {ROLE_LABEL[inv.role] || inv.role}
                      <span className="mx-2">·</span>
                      <span className={expired ? "text-rose-600" : ""}>
                        {expired ? "expired" : `expires ${expires.toLocaleDateString()}`}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => revokeMutation.mutate(inv.id)}
                    className="p-2 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                    title="Revoke invite"
                    aria-label="Revoke invite"
                    data-testid={`button-revoke-${inv.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AdminFrame>
  );
}
