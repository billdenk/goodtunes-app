// Task #306 — Surface signed-cert batch status on partner dashboards.
//
// Reuses two existing read-only endpoints:
//   • /api/<kind>/top-albums            — partner's full album list (limit=200)
//   • /api/partners/albums/:id/cert-batch-status — per-album window + steps
//
// Renders one card per album that has a configured sale window OR an
// in-flight batch (any of the six production steps complete). Mirrors
// the admin CertSaleWindowPanel chrome on the partner-facing palette
// so labels and artists see the same vocabulary the ops team uses.

import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import { SIGNED_CERT_MIN_BATCH } from "@shared/signedCertLadder";

type Kind = "label" | "artist";

type AlbumRow = {
  albumId: string;
  title: string;
  artist: string;
  artwork: string | null;
};

type BatchStatus = {
  window: {
    opensAt: string | null;
    closesAt: string | null;
    status: string | null;
    closedAt: string | null;
    notes: Record<string, string>;
    pdfAssetUrl: string | null;
    pdfGeneratedAt: string | null;
    steps: { key: string; label: string; completedAt: string | null }[];
  };
  counts: { total: number; printed: number };
};

const STATUS_PILL: Record<string, { label: string; cls: string }> = {
  scheduled: { label: "Scheduled", cls: "bg-white/10 text-white/75" },
  open: { label: "Open — taking orders", cls: "bg-[color:var(--brand-blue)]/15 text-[color:var(--brand-blue)]" },
  closed_below_min: {
    label: `Closed below ${SIGNED_CERT_MIN_BATCH} — refunded`,
    cls: "bg-[color:var(--brand-pink)]/15 text-[color:var(--brand-pink)]",
  },
  in_production: { label: "In production", cls: "bg-[color:var(--brand-purple)]/20 text-[color:var(--brand-purple)]" },
  shipped: { label: "Shipped", cls: "bg-[color:var(--brand-mint)]/20 text-[color:var(--brand-mint)]" },
  cancelled: { label: "Cancelled", cls: "bg-white/5 text-white/55" },
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function fmtDateShort(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function CertRunsSection({ kind, qs }: { kind: Kind; qs: string }) {
  // Pull the partner's catalog. top-albums LEFT-JOINs orders so albums
  // with no in-window activity still appear — we just need the IDs.
  // Limit lifted to 200 (server cap) so big rosters aren't truncated.
  const albumsQs = useMemo(() => {
    const u = new URLSearchParams(qs);
    u.set("limit", "200");
    return u.toString();
  }, [qs]);

  const albumsQuery = useQuery<{ albums: AlbumRow[] }>({
    queryKey: [`/api/${kind}/top-albums?${albumsQs}`],
  });

  const albums = albumsQuery.data?.albums ?? [];

  const statuses = useQueries({
    queries: albums.map((a) => ({
      queryKey: [`/api/partners/albums/${a.albumId}/cert-batch-status`],
      // Fail soft — if one album 403s (shouldn't happen for scoped
      // partners but defensive) the rest still render.
      retry: false,
    })),
  });

  const cards = useMemo(() => {
    return albums
      .map((album, i) => ({ album, status: statuses[i]?.data as BatchStatus | undefined }))
      .filter(({ status }) => {
        if (!status) return false;
        const hasWindow = status.window.status !== null;
        const hasStep = status.window.steps.some((s) => s.completedAt !== null);
        return hasWindow || hasStep;
      });
  }, [albums, statuses]);

  // Hide section entirely when there's nothing to show — no empty state.
  const anyLoading = albumsQuery.isLoading || statuses.some((q) => q.isLoading);
  if (!anyLoading && cards.length === 0) return null;

  return (
    <section className="rounded-2xl bg-white/[0.04] ring-1 ring-white/10 p-4 sm:p-5" data-testid="section-cert-runs">
      <div className="flex items-end justify-between gap-3 mb-4">
        <div>
          <h3 className="text-base font-semibold">Signed-cert runs</h3>
          <p className="text-white/55 text-xs">
            Live production status for every album with a configured sale window.
          </p>
        </div>
        {anyLoading && cards.length === 0 && (
          <span className="text-white/45 text-xs inline-flex items-center gap-1">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {cards.map(({ album, status }) => (
          <CertRunCard key={album.albumId} album={album} status={status!} />
        ))}
      </div>
    </section>
  );
}

function CertRunCard({ album, status }: { album: AlbumRow; status: BatchStatus }) {
  const w = status.window;
  const pill = STATUS_PILL[w.status ?? ""] ?? { label: "No window configured", cls: "bg-white/5 text-white/55" };
  const reserved = status.counts.printed;
  const total = status.counts.total;
  const pct = Math.min(100, Math.round((reserved / SIGNED_CERT_MIN_BATCH) * 100));
  const hitMin = reserved >= SIGNED_CERT_MIN_BATCH;

  return (
    <div className="rounded-xl bg-[color:var(--brand-bg)]/40 ring-1 ring-white/10 p-4" data-testid={`card-cert-run-${album.albumId}`}>
      <div className="flex items-start gap-3 mb-3">
        {album.artwork ? (
          <img src={album.artwork} alt="" className="w-12 h-12 rounded object-cover" />
        ) : (
          <div className="w-12 h-12 rounded bg-white/5" />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-semibold truncate" data-testid={`text-cert-run-title-${album.albumId}`}>{album.title}</p>
          <p className="text-white/55 text-xs truncate">{album.artist}</p>
        </div>
        <span
          className={`px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${pill.cls}`}
          data-testid={`pill-cert-status-${album.albumId}`}
        >
          {pill.label}
        </span>
      </div>

      <div className="mb-3">
        <div className="flex items-baseline justify-between text-xs mb-1">
          <span className="text-white/55">Reservations</span>
          <span className="tabular-nums" data-testid={`text-cert-reserved-${album.albumId}`}>
            <strong className="text-white">{reserved}</strong>
            <span className="text-white/45"> / {SIGNED_CERT_MIN_BATCH} minimum</span>
            {total > reserved && <span className="text-white/35"> · {total} total</span>}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div
            className={`h-full transition-all ${hitMin ? "bg-[color:var(--brand-mint)]" : "bg-[color:var(--brand-blue)]"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        {(w.opensAt || w.closesAt) && (
          <p className="mt-1.5 text-xs text-white/45">
            Window {fmtDateShort(w.opensAt)} → {fmtDateShort(w.closesAt)}
            {w.closedAt && ` · closed ${fmtDateShort(w.closedAt)}`}
          </p>
        )}
      </div>

      <ol className="space-y-1.5" data-testid={`list-cert-steps-${album.albumId}`}>
        {w.steps.map((s) => {
          const done = !!s.completedAt;
          return (
            <li
              key={s.key}
              className="flex items-center gap-2 text-xs"
              data-testid={`step-cert-${s.key}-${album.albumId}`}
            >
              <span
                className={`w-4 h-4 rounded-sm flex items-center justify-center shrink-0 ${
                  done
                    ? "bg-[color:var(--brand-mint)] text-[color:var(--brand-bg)]"
                    : "bg-white/10 text-white/40"
                }`}
              >
                {done && <Check className="w-3 h-3" strokeWidth={3} />}
              </span>
              <span className={done ? "text-white" : "text-white/55"}>{s.label}</span>
              {done && (
                <span className="ml-auto tabular-nums text-white/45">{fmtDate(s.completedAt)}</span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
