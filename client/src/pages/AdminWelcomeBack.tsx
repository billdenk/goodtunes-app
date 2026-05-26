// Task #400 — Admin tool for the wave-1 welcome-back campaign.
//
// One-page dashboard: shows the audience snapshot (imported / eligible
// / already mailed / onboarded / merged), the kill-switch state, and a
// "Send wave-1" button with a mandatory dry-run preview first. Sends
// are batched server-side (25 per batch, 1s sleep between batches) so
// the operator just clicks once and waits.

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { AdminFrame } from "@/components/admin/AdminFrame";

type WelcomeStatus = {
  imported: number;
  eligible: number;
  alreadyMailed: number;
  onboarded: number;
  merged: number;
  sendsLogged: number;
  sendFailures: number;
  killSwitch: boolean;
};

type SendResult = { dryRun?: boolean; audienceSize: number; sent?: number; failed?: number; sample?: string[] };

export function AdminWelcomeBack() {
  const { toast } = useToast();
  const [confirmText, setConfirmText] = useState("");
  const [lastResult, setLastResult] = useState<SendResult | null>(null);

  const { data: status, isLoading } = useQuery<WelcomeStatus>({
    queryKey: ["/api/admin/welcome-back/status"],
  });

  const sendMutation = useMutation<SendResult, Error, { dryRun: boolean }>({
    mutationFn: async ({ dryRun }) => {
      const r = await apiRequest("POST", "/api/admin/welcome-back/send", { dryRun });
      return r.json();
    },
    onSuccess: (r) => {
      setLastResult(r);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/welcome-back/status"] });
      if (r.dryRun) {
        toast({ title: `Dry run: would email ${r.audienceSize} fan${r.audienceSize === 1 ? "" : "s"}` });
      } else {
        toast({ title: `Sent ${r.sent} · failed ${r.failed}`, description: `Audience: ${r.audienceSize}` });
      }
    },
    onError: (e) => {
      toast({ title: "Send failed", description: e.message, variant: "destructive" });
    },
  });

  return (
    <AdminFrame>
      <div className="max-w-3xl mx-auto px-6 py-8" data-testid="page-admin-welcome-back">
        <h1 className="text-2xl font-bold text-slate-900 mb-1">Welcome-back campaign</h1>
        <p className="text-slate-600 text-sm mb-8">
          Wave-1 email to the ~1,850 imported gogoods.com fans whose addresses have a verified-on-arrival timestamp.
          Each recipient gets a single-use 30-day sign-in link that drops them into the 3-screen onboarding.
        </p>

        {isLoading ? (
          <div className="text-slate-500 text-sm" data-testid="welcomeback-loading">Loading…</div>
        ) : status ? (
          <>
            <div className="grid grid-cols-3 gap-3 mb-6">
              <Stat label="Imported" value={status.imported} testId="stat-imported" />
              <Stat label="Eligible (not yet mailed)" value={status.eligible} testId="stat-eligible" tone="accent" />
              <Stat label="Already mailed" value={status.alreadyMailed} testId="stat-mailed" />
              <Stat label="Onboarded" value={status.onboarded} testId="stat-onboarded" tone="success" />
              <Stat label="Merged" value={status.merged} testId="stat-merged" />
              <Stat label="Send failures (log)" value={status.sendFailures} testId="stat-failures" tone={status.sendFailures > 0 ? "danger" : undefined} />
            </div>

            {status.killSwitch && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 mb-5 text-sm text-rose-900" data-testid="kill-switch-banner">
                <strong>Kill switch active.</strong> <code>WELCOME_BACK_KILL_SWITCH=on</code> is set — sends are blocked.
                Unset the env var and reload to enable.
              </div>
            )}

            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="font-semibold text-slate-900 mb-1">Send wave-1</h2>
              <p className="text-slate-500 text-sm mb-4">
                Always dry-run first — sample addresses appear below so you can sanity-check the audience. The real send
                batches 25 at a time with a 1-second cooldown between batches.
              </p>
              <div className="flex flex-wrap gap-2 mb-4">
                <button
                  type="button"
                  onClick={() => sendMutation.mutate({ dryRun: true })}
                  disabled={sendMutation.isPending || status.eligible === 0}
                  className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-300 text-slate-800 bg-white hover:bg-slate-50 disabled:opacity-40"
                  data-testid="button-dry-run"
                >
                  {sendMutation.isPending ? "Working…" : "Dry run"}
                </button>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder='Type "SEND" to enable'
                  className="px-3 py-2 rounded-lg text-sm border border-slate-300 bg-white"
                  data-testid="input-send-confirm"
                />
                <button
                  type="button"
                  onClick={() => sendMutation.mutate({ dryRun: false })}
                  disabled={sendMutation.isPending || confirmText !== "SEND" || status.killSwitch || status.eligible === 0}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-40"
                  data-testid="button-send-live"
                >
                  Send to {status.eligible} fan{status.eligible === 1 ? "" : "s"}
                </button>
              </div>
              {lastResult && (
                <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-800" data-testid="last-result">
                  {lastResult.dryRun ? (
                    <>
                      <div className="font-semibold mb-1">Dry run · audience {lastResult.audienceSize}</div>
                      {lastResult.sample && lastResult.sample.length > 0 && (
                        <ul className="list-disc ml-5 text-slate-600">
                          {lastResult.sample.map((e) => <li key={e}>{e}</li>)}
                        </ul>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="font-semibold mb-1">Live send · audience {lastResult.audienceSize}</div>
                      <div className="text-slate-600">sent {lastResult.sent} · failed {lastResult.failed}</div>
                    </>
                  )}
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>
    </AdminFrame>
  );
}

function Stat({ label, value, testId, tone }: { label: string; value: number; testId: string; tone?: "accent" | "success" | "danger" }) {
  const color =
    tone === "accent" ? "text-sky-700" :
    tone === "success" ? "text-emerald-700" :
    tone === "danger" ? "text-rose-700" :
    "text-slate-900";
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-4" data-testid={testId}>
      <div className={`text-3xl font-bold leading-none ${color}`}>{value}</div>
      <div className="text-slate-500 text-xs mt-1 uppercase tracking-wider font-semibold">{label}</div>
    </div>
  );
}
