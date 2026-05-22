import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertTriangle, X } from "lucide-react";

/**
 * Task #138 — Passive alert when auto-sync STT runs are creeping toward
 * the ElevenLabs 120 s cap. The Jobs page already turns the STT cell red
 * at ≥90 s, but someone still has to open the page to see it. This banner
 * polls `/api/admin/job-runs/alerts` and shows a dismissible warning at
 * the top of every admin page when one or more recent runs tripped the
 * threshold (slow STT or master bytes within the warn margin of the cap).
 *
 * Dismissal is per-set: we hash the tripped run IDs and stash that hash
 * in localStorage. As soon as a new run trips, the hash changes and the
 * banner returns — no risk of permanently silencing the warning.
 */

type AlertReason = "stt-slow" | "source-near-cap";

type JobAlert = {
  runId: string;
  songId: string | null;
  albumId: string | null;
  finishedAt: string;
  sttMs: number | null;
  sourceBytes: number | null;
  reasons: AlertReason[];
};

type AlertsResponse = {
  alerts: JobAlert[];
  thresholds: {
    sttWarnMs: number;
    sourceCapBytes: number;
    sourceWarnMarginBytes: number;
    lookbackDays: number;
  };
};

const DISMISS_KEY = "gt:admin-autosync-alert-dismissed";

function signatureFor(alerts: JobAlert[]): string {
  return alerts
    .map((a) => a.runId)
    .sort()
    .join("|");
}

export function AutoSyncAlertBanner() {
  const { data } = useQuery<AlertsResponse>({
    queryKey: ["/api/admin/job-runs/alerts"],
    refetchInterval: 5 * 60 * 1000,
  });

  const alerts = data?.alerts ?? [];
  const signature = useMemo(() => signatureFor(alerts), [alerts]);

  const [dismissed, setDismissed] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    try {
      return window.localStorage.getItem(DISMISS_KEY) ?? "";
    } catch {
      return "";
    }
  });

  // Mirror cross-tab dismissals so muting in one admin tab clears the
  // banner in the others too.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === DISMISS_KEY) setDismissed(e.newValue ?? "");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  if (alerts.length === 0 || signature === dismissed) return null;

  const sttSlow = alerts.filter((a) => a.reasons.includes("stt-slow")).length;
  const nearCap = alerts.filter((a) => a.reasons.includes("source-near-cap")).length;
  const lookback = data?.thresholds.lookbackDays ?? 7;

  const onDismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, signature);
    } catch {}
    setDismissed(signature);
  };

  const parts: string[] = [];
  if (sttSlow > 0) parts.push(`${sttSlow} run${sttSlow === 1 ? "" : "s"} with STT ≥ 90 s`);
  if (nearCap > 0) parts.push(`${nearCap} master${nearCap === 1 ? "" : "s"} near the 1.5 GB cap`);

  return (
    <div
      className="mx-6 sm:mx-8 mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 flex items-start gap-3"
      data-testid="banner-autosync-alert"
      role="alert"
    >
      <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-700" />
      <div className="flex-1 min-w-0 text-[13px] text-amber-900">
        <div className="font-semibold">
          Auto-sync runs are creeping toward the ElevenLabs timeout
        </div>
        <div className="mt-0.5 text-amber-800">
          In the last {lookback} days: {parts.join(" · ")}.{" "}
          <Link
            href="/admin/jobs"
            className="underline font-medium hover:text-amber-900"
            data-testid="link-autosync-alert-jobs"
          >
            Open Jobs
          </Link>{" "}
          to see which songs.
        </div>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="w-7 h-7 rounded-md flex items-center justify-center text-amber-700 hover:bg-amber-100 transition-colors"
        title="Dismiss"
        aria-label="Dismiss alert"
        data-testid="button-dismiss-autosync-alert"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
