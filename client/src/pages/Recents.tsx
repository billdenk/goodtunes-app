import { useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { FanScreen } from "@/components/ui/FanScreen";
import { useFanRecents, useRemoveRecent, useClearRecents } from "@/hooks/useRecents";
import type { FanRecent } from "@shared/schema";

// Task #530 Recents tab — server-side per-fan history, grouped by
// freshness windows (Today / Yesterday / This week / Earlier), with
// swipe-to-remove + a global Clear All. We render at most 200 rows
// (storage layer enforces the cap on writes too).

function groupKey(d: Date, now: Date): "today" | "yesterday" | "week" | "earlier" {
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, now)) return "today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, yesterday)) return "yesterday";
  const weekAgo = new Date(now);
  weekAgo.setDate(now.getDate() - 7);
  if (d >= weekAgo) return "week";
  return "earlier";
}

const SECTION_LABELS: Record<string, string> = {
  today: "Today",
  yesterday: "Yesterday",
  week: "This Week",
  earlier: "Earlier",
};

// Apple-style relative timestamps for each row ("2h ago", "Yesterday",
// "3d ago", absolute date once we're past the week). Pure function so
// it stays deterministic across re-renders.
function relativeTime(then: Date, now: Date): string {
  const ms = now.getTime() - then.getTime();
  if (ms < 60_000) return "Just now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(then, yesterday)) return "Yesterday";
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return then.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const KIND_LABEL: Record<string, string> = {
  album: "Album",
  song: "Song",
  artist: "Artist",
  person: "Person",
  instrument: "Gear",
  vendor: "Vendor",
  label: "Label",
  playlist: "Playlist",
  video: "Bonus video",
  photo: "Bonus photo",
};

export function RecentsPage() {
  const [, navigate] = useLocation();
  const { data: recents, isLoading } = useFanRecents();
  const remove = useRemoveRecent();
  const clearAll = useClearRecents();
  const [confirmClear, setConfirmClear] = useState(false);

  // A fan only ever has their own albums to open — Collection is scoped to
  // owned albums too (Task #1255), so an album-kind recent pointing at an
  // album the fan doesn't own would dead-end. Scope album rows to the owned
  // set; other entity kinds (artist/gear/vendor/etc.) stay browsable and are
  // left untouched.
  const { data: myAlbumsRaw, isLoading: myAlbumsLoading, isSuccess: ownershipReady } = useQuery<Array<{ albumId: string; isPreview?: boolean }> | null>({
    queryKey: ["/api/my-albums"],
  });
  const ownedAlbumIds = useMemo(
    () => new Set((myAlbumsRaw ?? []).map((a) => a.albumId)),
    [myAlbumsRaw],
  );
  const loading = isLoading || myAlbumsLoading;

  const grouped = useMemo(() => {
    const now = new Date();
    const buckets: Record<string, FanRecent[]> = { today: [], yesterday: [], week: [], earlier: [] };
    for (const row of recents ?? []) {
      // Fail open: only drop an unowned album once ownership has actually
      // resolved. If /api/my-albums errors (ownedAlbumIds would be empty),
      // keep showing the fan's real history instead of a false empty state.
      if (ownershipReady && row.entityKind === "album" && !ownedAlbumIds.has(row.entityId)) continue;
      buckets[groupKey(new Date(row.lastAt as any), now)].push(row);
    }
    return buckets;
  }, [recents, ownedAlbumIds, ownershipReady]);

  const totalShown = useMemo(
    () => Object.values(grouped).reduce((n, rows) => n + rows.length, 0),
    [grouped],
  );

  return (
    <>
      <FanScreen
        title="Recents"
        trailing={
          totalShown > 0 ? (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="text-[#319ED8] text-[14px] font-semibold active:opacity-60"
              data-testid="button-clear-all-recents"
            >
              Clear All
            </button>
          ) : undefined
        }
      >
        {loading && (
          <p className="text-white/45 text-sm text-center mt-8">Loading…</p>
        )}
        {!loading && totalShown === 0 && (
          <div className="text-center mt-16 px-6">
            <p className="text-white/55 text-sm">Nothing here yet.</p>
            <p className="text-white/35 text-xs mt-1">Albums, songs, and gear you open will show up here.</p>
          </div>
        )}

        {(["today", "yesterday", "week", "earlier"] as const).map((k) => {
          const rows = grouped[k];
          if (rows.length === 0) return null;
          return (
            <div key={k} className="mb-5 lg:mb-8">
              <div className="px-5 mb-2 lg:mb-4">
                <h2 className="text-white text-[15px] font-bold">{SECTION_LABELS[k]}</h2>
              </div>
              {/* Phone — swipe-to-remove list. Hidden at lg+ (TD), where the
                  grid below leads instead. */}
              <div className="px-5 lg:hidden">
                {rows.map((row) => (
                  <RecentRow
                    key={row.id}
                    row={row}
                    timestamp={relativeTime(new Date(row.lastAt as any), new Date())}
                    onOpen={() => navigate(row.href)}
                    onRemove={() => remove.mutate(row.id)}
                  />
                ))}
              </div>
              {/* TD (lg+) — Apple-Music artwork-forward grid, matching the
                  Collection / Home grids. Phone never renders this. */}
              <div className="px-5 hidden lg:grid grid-cols-4 2xl:grid-cols-5 gap-4 lg:gap-5">
                {rows.map((row) => (
                  <RecentCard
                    key={row.id}
                    row={row}
                    timestamp={relativeTime(new Date(row.lastAt as any), new Date())}
                    onOpen={() => navigate(row.href)}
                    onRemove={() => remove.mutate(row.id)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </FanScreen>

      {confirmClear && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setConfirmClear(false)} />
          <div className="relative w-full max-w-[390px] bg-[#0D1B4B] rounded-t-3xl pt-3 pb-6 z-10">
            <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-4" />
            <div className="px-5 pb-2">
              <h3 className="text-white text-base font-semibold mb-1">Clear all recents?</h3>
              <p className="text-white/55 text-sm">This removes every entry from your Recents tab. It doesn't delete anything else.</p>
            </div>
            <div className="flex gap-2 px-5 pt-4">
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="flex-1 py-3 rounded-xl text-sm font-semibold text-white"
                style={{ background: "rgba(255,255,255,0.10)" }}
                data-testid="button-cancel-clear"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { clearAll.mutate(); setConfirmClear(false); }}
                className="flex-1 py-3 rounded-xl text-sm font-semibold text-white"
                style={{ background: "#FF5470" }}
                data-testid="button-confirm-clear"
              >
                Clear All
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function RecentRow({
  row,
  timestamp,
  onOpen,
  onRemove,
}: {
  row: FanRecent;
  timestamp: string;
  onOpen: () => void;
  onRemove: () => void;
}) {
  // Simple touch swipe-to-remove: drag the row left by up to 96px to
  // expose a Remove button on the right. Tap anywhere on the row to
  // open the destination.
  const startX = useRef<number | null>(null);
  const [tx, setTx] = useState(0);
  const [swiped, setSwiped] = useState(false);

  const isRound = row.entityKind === "artist" || row.entityKind === "person" || row.entityKind === "vendor" || row.entityKind === "label";

  return (
    <div className="relative overflow-hidden" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
      <button
        type="button"
        onClick={onRemove}
        className="absolute right-0 top-0 bottom-0 w-24 flex items-center justify-center text-white text-sm font-semibold"
        style={{ background: "#FF5470" }}
        data-testid={`button-remove-recent-${row.id}`}
      >
        Remove
      </button>
      <div
        className="relative bg-[#00062B]"
        style={{ transform: `translateX(${tx}px)`, transition: startX.current == null ? "transform 200ms" : "none" }}
        onTouchStart={(e) => { startX.current = e.touches[0].clientX; }}
        onTouchMove={(e) => {
          if (startX.current == null) return;
          const dx = e.touches[0].clientX - startX.current;
          if (dx < 0) setTx(Math.max(-96, dx));
          else if (swiped) setTx(Math.min(0, -96 + dx));
        }}
        onTouchEnd={() => {
          startX.current = null;
          if (tx < -48) { setTx(-96); setSwiped(true); }
          else { setTx(0); setSwiped(false); }
        }}
      >
        <button
          type="button"
          onClick={() => { if (tx === 0) onOpen(); else { setTx(0); setSwiped(false); } }}
          className="w-full flex items-center gap-3 py-2.5 active:opacity-60 transition-opacity text-left"
          data-testid={`row-recent-${row.id}`}
        >
          <div
            className={`w-11 h-11 flex-shrink-0 overflow-hidden flex items-center justify-center ${isRound ? "rounded-full" : "rounded-md"}`}
            style={{ background: "rgba(255,255,255,0.08)", border: isRound ? "1px solid rgba(255,255,255,0.10)" : undefined }}
          >
            {row.thumbUrl ? (
              <img src={row.thumbUrl} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
            ) : isRound ? (
              // Brand fallback for round kinds (artist/person/vendor/label)
              // with no photo: the artist star, not a blank circle.
              // Songs use the heart; the star is the person/artist mark.
              <Star size={18} className="text-white/35" fill="currentColor" data-testid={`icon-recent-fallback-${row.id}`} />
            ) : null}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-fan-primary text-sm font-semibold truncate leading-tight">{row.title}</p>
            <p className="text-fan-secondary text-xs truncate leading-tight mt-0.5">
              {KIND_LABEL[row.entityKind] ?? row.entityKind}
              {row.subtitle ? ` · ${row.subtitle}` : ""}
            </p>
          </div>
          {/* Task #530 — per-row relative timestamp ("2h ago",
              "Yesterday", "3d ago", or an absolute Mon DD once we're
              past the week). Sits to the right of the metadata so the
              section headers + the row-level recency both read at a
              glance. */}
          <span
            className="text-fan-faint text-[11px] flex-shrink-0 mr-1 tabular-nums"
            data-testid={`text-recent-time-${row.id}`}
          >
            {timestamp}
          </span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" opacity="0.3">
            <path d="M9 18l6-6-6-6" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// TD-only (lg+) artwork-forward card — the grid counterpart to RecentRow.
// Removal lives on a hover affordance instead of swipe (pointer surface).
function RecentCard({
  row,
  timestamp,
  onOpen,
  onRemove,
}: {
  row: FanRecent;
  timestamp: string;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const isRound = row.entityKind === "artist" || row.entityKind === "person" || row.entityKind === "vendor" || row.entityKind === "label";

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onOpen}
        className="w-full flex flex-col gap-2 text-left active:opacity-70 transition-opacity"
        data-testid={`card-recent-${row.id}`}
      >
        <div
          className={`relative w-full aspect-square overflow-hidden flex items-center justify-center ${isRound ? "rounded-full" : "rounded-lg"}`}
          style={{ background: "rgba(255,255,255,0.08)", border: isRound ? "1px solid rgba(255,255,255,0.10)" : undefined }}
        >
          {row.thumbUrl ? (
            <img src={row.thumbUrl} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
          ) : isRound ? (
            <Star size={28} className="text-fan-faint" fill="currentColor" data-testid={`icon-recent-fallback-${row.id}`} />
          ) : null}
        </div>
        <div className="min-w-0 px-0.5">
          <p className="text-fan-primary text-sm font-semibold truncate leading-tight">{row.title}</p>
          <p className="text-fan-secondary text-xs truncate leading-tight mt-0.5">
            {KIND_LABEL[row.entityKind] ?? row.entityKind}
            {timestamp ? ` · ${timestamp}` : ""}
          </p>
        </div>
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${row.title}`}
        className="absolute top-1.5 right-1.5 w-7 h-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
        style={{ background: "rgba(0,6,43,0.72)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
        data-testid={`button-remove-recent-card-${row.id}`}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}
