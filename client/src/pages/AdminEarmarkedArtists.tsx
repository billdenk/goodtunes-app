import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { useToast } from "@/hooks/use-toast";
import { Trash2 } from "lucide-react";

interface EarmarkedRow {
  id: string;
  name: string;
  email: string;
  notes: string | null;
  addedAt: string;
  invitedAt: string | null;
  invitedInviteId: string | null;
  invitedEmail: string | null;
  invitedUsedAt: string | null;
}

export function AdminEarmarkedArtists() {
  const { toast } = useToast();
  const [bulk, setBulk] = useState("");

  const list = useQuery<{ rows: EarmarkedRow[] }>({
    queryKey: ["/api/admin/earmarked-artists"],
  });

  const add = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/admin/earmarked-artists/bulk", { bulk });
      return r.json() as Promise<{ inserted: number; updated: number; parsed: number }>;
    },
    onSuccess: (d) => {
      setBulk("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/earmarked-artists"] });
      toast({
        title: "Added to earmarked",
        description: `${d.inserted} new, ${d.updated} updated (${d.parsed} parsed)`,
      });
    },
    onError: (e: Error) => toast({ title: "Couldn't add", description: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/earmarked-artists/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/earmarked-artists"] });
      toast({ title: "Removed" });
    },
    onError: (e: Error) => toast({ title: "Couldn't remove", description: e.message, variant: "destructive" }),
  });

  const rows = list.data?.rows ?? [];
  const pending = rows.filter((r) => !r.invitedAt);
  const invited = rows.filter((r) => r.invitedAt);

  return (
    <AdminFrame active="invites">
      <div className="max-w-3xl mx-auto p-6">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-slate-900" data-testid="text-page-title">Earmarked artists</h1>
          <p className="text-sm text-slate-500 mt-1">
            Names + emails Bill wants surfaced as one-tap invite suggestions on the artist dashboard. Verified artists
            see this list as chips and can send invites with a single click.
          </p>
        </div>

        <section className="mb-8 bg-white border border-slate-200 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-slate-900 mb-2">Paste batch</h2>
          <p className="text-xs text-slate-500 mb-2">
            One per line. Formats: <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">Name &lt;email&gt;</code>{" "}
            or <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">Name, email</code>. Re-pasting the same email updates the name.
          </p>
          <textarea
            value={bulk}
            onChange={(e) => setBulk(e.target.value)}
            rows={6}
            placeholder="Jane Doe <jane@example.com>&#10;John Smith, john@example.com"
            className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm font-mono"
            data-testid="textarea-bulk"
          />
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={() => bulk.trim() && add.mutate()}
              disabled={add.isPending || !bulk.trim()}
              className="px-3 py-1.5 text-sm font-semibold text-white bg-[var(--brand-blue)] hover:opacity-90 rounded-md disabled:opacity-40"
              data-testid="button-add-bulk"
            >
              {add.isPending ? "Adding…" : "Add to list"}
            </button>
          </div>
        </section>

        <section className="mb-8" data-testid="section-pending">
          <h2 className="text-sm font-semibold text-slate-900 mb-2">
            Awaiting invite <span className="text-slate-400 font-normal">({pending.length})</span>
          </h2>
          {pending.length === 0 ? (
            <p className="text-sm text-slate-500 italic">Empty — paste a batch above to seed.</p>
          ) : (
            <ul className="divide-y divide-slate-200 bg-white border border-slate-200 rounded-lg">
              {pending.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-3 py-2.5" data-testid={`row-pending-${r.id}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate" data-testid={`text-name-${r.id}`}>{r.name}</p>
                    <p className="text-xs text-slate-500 truncate">{r.email}{r.notes ? <span className="text-slate-400"> · {r.notes}</span> : null}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { if (confirm(`Remove ${r.name}?`)) remove.mutate(r.id); }}
                    className="text-slate-400 hover:text-red-600 p-1"
                    aria-label="Remove"
                    data-testid={`button-remove-${r.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section data-testid="section-invited">
          <h2 className="text-sm font-semibold text-slate-900 mb-2">
            Already invited <span className="text-slate-400 font-normal">({invited.length})</span>
          </h2>
          {invited.length === 0 ? (
            <p className="text-sm text-slate-500 italic">No invites stamped yet.</p>
          ) : (
            <ul className="divide-y divide-slate-200 bg-white border border-slate-200 rounded-lg">
              {invited.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-3 py-2.5" data-testid={`row-invited-${r.id}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{r.name}</p>
                    <p className="text-xs text-slate-500 truncate">{r.email}</p>
                  </div>
                  <span
                    className={`text-xs font-semibold uppercase tracking-wider ${r.invitedUsedAt ? "text-emerald-600" : "text-sky-600"}`}
                    data-testid={`text-status-${r.id}`}
                  >
                    {r.invitedUsedAt ? "Accepted" : "Invited"}
                  </span>
                  <button
                    type="button"
                    onClick={() => { if (confirm(`Remove ${r.name}?`)) remove.mutate(r.id); }}
                    className="text-slate-400 hover:text-red-600 p-1"
                    aria-label="Remove"
                    data-testid={`button-remove-invited-${r.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AdminFrame>
  );
}

export default AdminEarmarkedArtists;
