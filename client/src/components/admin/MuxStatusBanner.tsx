import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertTriangle, X } from "lucide-react";

/**
 * Task #364 — Passive admin banner that surfaces two pipeline failure
 * modes the operator otherwise wouldn't notice until a fan opened a
 * track:
 *   • Mux secrets missing → fans can't stream at all, raw fallback is
 *     now refused, and we have to point at the exact env vars to add.
 *   • A non-trivial count of errored or never-ingested songs → the
 *     reconcile sweep already did its best; what's left needs human
 *     triage in AdminAlbum.
 *
 * Polls `/api/admin/mux-status` every 60s so the auto-retry sweep
 * (Task #367, every 30min + per-minute reconcile) shows up here
 * without an admin reloading. Dismissal is per-set:
 * we hash the {missingSecrets, erroredCount, notIngestedCount} tuple
 * and stash it in localStorage, so the banner returns the moment the
 * shape of the problem changes (e.g. a new errored song joins).
 */

type MuxStatusResponse = {
  configured: boolean;
  missingSecrets: string[];
  counts: {
    songsWithAudio: number;
    ready: number;
    preparing: number;
    errored: number;
    notIngested: number;
  };
  erroredSample: Array<{
    id: string;
    title: string | null;
    albumId: string | null;
    reason: string | null;
  }>;
  // Task #369 — per-song auto-retry state keyed by songId. Only present
  // for errored songs the backfill sweep has actually touched.
  retryState?: Record<
    string,
    {
      attempts: number;
      maxAttempts: number;
      lastAttemptAt: number;
      nextRetryAt: number | null;
      exhausted: boolean;
    }
  >;
  serverNow?: number;
};

const DISMISS_KEY = "gt:admin-mux-banner-dismissed";

function signatureFor(s: MuxStatusResponse): string {
  return [
    s.configured ? "ok" : `missing:${s.missingSecrets.join(",")}`,
    `errored:${s.counts.errored}`,
    `notIngested:${s.counts.notIngested}`,
  ].join("|");
}

export function MuxStatusBanner() {
  const { data } = useQuery<MuxStatusResponse>({
    queryKey: ["/api/admin/mux-status"],
    refetchInterval: 60 * 1000,
  });

  const signature = useMemo(() => (data ? signatureFor(data) : ""), [data]);

  const [dismissed, setDismissed] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    try {
      return window.localStorage.getItem(DISMISS_KEY) ?? "";
    } catch {
      return "";
    }
  });

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === DISMISS_KEY) setDismissed(e.newValue ?? "");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  if (!data) return null;

  // What counts as "show the banner"?
  //   • Mux is not configured (any required secret missing), OR
  //   • There are errored songs we couldn't auto-heal, OR
  //   • >10 songs with a master have no Mux asset at all (boot backfill
  //     is gradual, so a small backlog is normal — only nag when it
  //     stays large).
  const showForMissing = !data.configured;
  const showForErrored = data.counts.errored > 0;
  const showForNotIngested = data.counts.notIngested > 10;
  const show = showForMissing || showForErrored || showForNotIngested;
  if (!show || signature === dismissed) return null;

  const onDismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, signature);
    } catch {}
    setDismissed(signature);
  };

  const title = showForMissing
    ? "Mux isn't configured — fan playback is offline"
    : "Mux pipeline needs attention";

  const body = showForMissing
    ? `Add the missing Replit secret${data.missingSecrets.length === 1 ? "" : "s"}: ${data.missingSecrets.join(", ")}. Until that's done, fans can't stream — only admins can preview from a track row.`
    : showForErrored
      ? `${data.counts.errored} song${data.counts.errored === 1 ? "" : "s"} failed to ingest into Mux${data.counts.notIngested > 0 ? ` and ${data.counts.notIngested} master${data.counts.notIngested === 1 ? "" : "s"} ${data.counts.notIngested === 1 ? "is" : "are"} not yet ingested` : ""}. Open the affected album and use the per-track Mux badge to retry.`
      : `${data.counts.notIngested} master${data.counts.notIngested === 1 ? "" : "s"} ${data.counts.notIngested === 1 ? "has" : "have"} no Mux asset yet. The backfill sweep is working through them.`;

  const deepLink = data.erroredSample[0]?.albumId
    ? `/admin/albums/${data.erroredSample[0].albumId}`
    : null;

  return (
    <div
      className="mx-6 sm:mx-8 mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 flex items-start gap-3"
      data-testid="banner-mux-status"
      role="alert"
    >
      <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-700" />
      <div className="flex-1 min-w-0 text-sm text-amber-900">
        <div className="font-semibold">{title}</div>
        <div className="mt-0.5 text-amber-800">
          {body}
          {deepLink && (
            <>
              {" "}
              <Link href={deepLink} className="font-medium underline underline-offset-2 transition-colors hover:text-[color:var(--brand-blue)]" data-testid="link-mux-banner-first-errored">
                Open the first one
              </Link>
              .
            </>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="w-7 h-7 rounded-md flex items-center justify-center text-amber-700 hover:bg-amber-100 transition-colors"
        title="Dismiss"
        aria-label="Dismiss Mux pipeline alert"
        data-testid="button-dismiss-mux-banner"
      >
        <X className="w-4 h-4" />
        <span className="sr-only">Dismiss</span>
      </button>
    </div>
  );
}
