import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bell, Send, MailCheck, Undo2 } from "lucide-react";
import { ErrorState } from "@/components/admin/AdminErrorBoundary";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type Stats = { total: number; notified: number; cameBack: number };
type SignupRow = {
  id: string;
  email: string;
  customerUserId: string | null;
  source: string | null;
  createdAt: string | null;
  notifiedAt: string | null;
};
type Payload = { count: number; stats: Stats; signups: SignupRow[] };
type SendResult = { ok: boolean; recipients: number; sent: number; failed: number; stats: Stats };

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function StatCard({
  label,
  value,
  icon: Icon,
  testId,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  testId?: string;
}) {
  return (
    <div
      className="rounded-xl border border-slate-200 bg-white p-4 flex items-start gap-3"
      data-testid={testId}
    >
      <div className="w-9 h-9 rounded-lg bg-[var(--brand-blue)]/10 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-[var(--brand-blue)]" strokeWidth={1.8} />
      </div>
      <div>
        <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold">{label}</div>
        <div className="text-2xl font-bold text-slate-900 tabular-nums mt-0.5">{value}</div>
      </div>
    </div>
  );
}

export function AlbumWaitlistPanel({ albumId }: { albumId: string }) {
  const { toast } = useToast();
  const [sending, setSending] = useState(false);

  const queryKey = useMemo(
    () => ["/api/admin/albums", albumId, "notify-signups"],
    [albumId],
  );

  const { data, isLoading, isError, error, refetch } = useQuery<Payload>({
    queryKey,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/albums/${albumId}/notify-signups`);
      return (await res.json()) as Payload;
    },
  });

  const stats = data?.stats;
  const signups = data?.signups ?? [];
  const pending = signups.filter((s) => !s.notifiedAt).length;

  async function handleSend() {
    if (sending) return;
    if (pending === 0) return;
    const ok = window.confirm(
      `Send the early-access email to ${pending} ${pending === 1 ? "person" : "people"} who haven't been notified yet?`,
    );
    if (!ok) return;
    setSending(true);
    try {
      const res = await apiRequest("POST", `/api/admin/albums/${albumId}/notify-send`);
      const result = (await res.json()) as SendResult;
      await queryClient.invalidateQueries({ queryKey });
      toast({
        title: "Early access sent",
        description:
          result.failed > 0
            ? `Emailed ${result.sent} of ${result.recipients}. ${result.failed} couldn't be delivered.`
            : `Emailed ${result.sent} ${result.sent === 1 ? "person" : "people"}.`,
      });
    } catch (err: any) {
      toast({
        title: "Couldn't send",
        description: err?.message ?? "The send failed. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  }

  if (isLoading) {
    return (
      <div className="py-10 text-slate-500 text-sm" data-testid="waitlist-loading">
        Loading…
      </div>
    );
  }
  if (isError) {
    return (
      <ErrorState
        // Plain-language copy instead of the raw status/message text
        // (e.g. "404: Album not found") — friendlier for operators.
        error="We couldn't load the waitlist right now — try again."
        onRetry={() => refetch()}
        title="Couldn't load the waitlist"
        testId="album-waitlist-error"
      />
    );
  }

  return (
    <div className="space-y-5" data-testid="panel-waitlist">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" data-testid="kpi-grid-waitlist">
        <StatCard
          label="Total signups"
          value={(stats?.total ?? 0).toLocaleString()}
          icon={Bell}
          testId="kpi-waitlist-total"
        />
        <StatCard
          label="Notified"
          value={(stats?.notified ?? 0).toLocaleString()}
          icon={MailCheck}
          testId="kpi-waitlist-notified"
        />
        <StatCard
          label="Came back"
          value={(stats?.cameBack ?? 0).toLocaleString()}
          icon={Undo2}
          testId="kpi-waitlist-cameback"
        />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between gap-4 px-5 py-3.5 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Early access waitlist</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {pending > 0
                ? `${pending.toLocaleString()} ${pending === 1 ? "person hasn't" : "people haven't"} been emailed yet.`
                : signups.length > 0
                  ? "Everyone on the list has been emailed."
                  : "No one has signed up yet."}
            </p>
          </div>
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || pending === 0}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-[var(--brand-blue)] text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity flex-shrink-0"
            data-testid="button-send-early-access"
          >
            <Send className="w-3.5 h-3.5" />
            {sending
              ? "Sending…"
              : pending > 0
                ? `Send early access email (${pending.toLocaleString()})`
                : "Send early access email"}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-xs uppercase tracking-wide font-semibold text-slate-500">
                <th className="text-left px-5 py-2.5">Email</th>
                <th className="text-left px-4 py-2.5 hidden md:table-cell">Signed up</th>
                <th className="text-left px-5 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {signups.length === 0 && (
                <tr>
                  <td
                    colSpan={3}
                    className="px-5 py-8 text-center text-slate-400"
                    data-testid="waitlist-empty"
                  >
                    No signups yet.
                  </td>
                </tr>
              )}
              {signups.map((s) => (
                <tr
                  key={s.id}
                  className="hover:bg-slate-50 transition-colors"
                  data-testid={`row-waitlist-${s.id}`}
                >
                  <td className="px-5 py-3">
                    <div className="font-medium text-slate-900 truncate max-w-[260px]">
                      {s.email}
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-slate-500 whitespace-nowrap">
                    {formatDate(s.createdAt)}
                  </td>
                  <td className="px-5 py-3">
                    {s.notifiedAt ? (
                      <span
                        className="inline-flex items-center gap-1 rounded-full bg-[var(--brand-blue)]/10 text-[var(--brand-blue)] text-xs font-semibold px-2 py-0.5"
                        data-testid={`waitlist-notified-${s.id}`}
                      >
                        <MailCheck className="w-3 h-3" strokeWidth={2.5} />
                        Notified {formatDate(s.notifiedAt)}
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-500 text-xs font-semibold px-2 py-0.5"
                        data-testid={`waitlist-pending-${s.id}`}
                      >
                        Not notified
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
