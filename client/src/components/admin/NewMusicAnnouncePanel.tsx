import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Megaphone, Send, MailCheck } from "lucide-react";
import { ErrorState } from "@/components/admin/AdminErrorBoundary";
import { apiRequest, queryClient, apiErrorBody } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type Payload = { recipientCount: number; notifiedAt: string | null; isPrepping: boolean };
type SendResult = { ok: boolean; recipients: number; sent: number; failed: number; notifiedAt: string };

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Task #2012 — operator-gated blast to the GLOBAL new-music opt-in audience
// (everyone who turned on "Notify me when new music drops"), a different list
// from this album's early-access waitlist. Single-shot per release so the whole
// audience can't be accidentally double-emailed.
export function NewMusicAnnouncePanel({ albumId }: { albumId: string }) {
  const { toast } = useToast();
  const [sending, setSending] = useState(false);

  const queryKey = useMemo(
    () => ["/api/admin/albums", albumId, "new-music-announce"],
    [albumId],
  );

  const { data, isLoading, isError, error, refetch } = useQuery<Payload>({
    queryKey,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/albums/${albumId}/new-music-announce`);
      return (await res.json()) as Payload;
    },
  });

  const recipientCount = data?.recipientCount ?? 0;
  const notifiedAt = data?.notifiedAt ?? null;
  const isPrepping = data?.isPrepping ?? false;
  const alreadySent = !!notifiedAt;
  const disabled = sending || alreadySent || isPrepping || recipientCount === 0;

  async function handleSend() {
    if (disabled) return;
    const ok = window.confirm(
      `Email all ${recipientCount.toLocaleString()} ${recipientCount === 1 ? "fan" : "fans"} who opted in to new-music updates about this release? This sends to the whole opt-in list and can only be done once per release.`,
    );
    if (!ok) return;
    setSending(true);
    try {
      const res = await apiRequest("POST", `/api/admin/albums/${albumId}/new-music-announce/send`);
      const result = (await res.json()) as SendResult;
      await queryClient.invalidateQueries({ queryKey });
      toast({
        title: "New-music email sent",
        description:
          result.failed > 0
            ? `Emailed ${result.sent} of ${result.recipients}. ${result.failed} couldn't be delivered.`
            : `Emailed ${result.sent} ${result.sent === 1 ? "fan" : "fans"}.`,
      });
    } catch (err: any) {
      toast({
        title: "Couldn't send",
        description:
          apiErrorBody<{ message?: string }>(err)?.message ??
          err?.message ??
          "The send failed. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  }

  if (isLoading) {
    return (
      <div className="py-10 text-slate-500 text-sm" data-testid="announce-loading">
        Loading…
      </div>
    );
  }
  if (isError) {
    return (
      <ErrorState
        error={error}
        onRetry={() => refetch()}
        title="Couldn't load the new-music list"
        testId="new-music-announce-error"
      />
    );
  }

  return (
    <div
      className="rounded-xl border border-slate-200 bg-white overflow-hidden"
      data-testid="panel-new-music-announce"
    >
      <div className="flex items-center justify-between gap-4 px-5 py-3.5 border-b border-slate-100">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-[var(--brand-blue)]/10 flex items-center justify-center flex-shrink-0">
            <Megaphone className="w-4 h-4 text-[var(--brand-blue)]" strokeWidth={1.8} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Announce to the new-music list</h2>
            <p className="text-xs text-slate-500 mt-0.5" data-testid="text-announce-status">
              {alreadySent
                ? `Already announced ${formatDate(notifiedAt)}.`
                : isPrepping
                  ? "Publish the release before announcing it."
                  : recipientCount > 0
                    ? `${recipientCount.toLocaleString()} ${recipientCount === 1 ? "fan has" : "fans have"} opted in to new-music updates.`
                    : "No fans have opted in to new-music updates yet."}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleSend}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-[var(--brand-blue)] text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity flex-shrink-0"
          data-testid="button-announce-new-music"
        >
          {alreadySent ? <MailCheck className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
          {sending
            ? "Sending…"
            : alreadySent
              ? "Announced"
              : recipientCount > 0
                ? `Announce to ${recipientCount.toLocaleString()}`
                : "Announce"}
        </button>
      </div>
      <div className="px-5 py-3.5">
        <p className="text-xs text-slate-500 leading-relaxed">
          This emails everyone who turned on "Notify me when new music drops" in their account — a
          different audience from this album's early-access waitlist above. Each email includes a
          one-tap unsubscribe link. To prevent accidental double-sends, a release can be announced to
          this list only once.
        </p>
      </div>
    </div>
  );
}
