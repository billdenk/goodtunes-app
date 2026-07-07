import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import {
  PublishingPipelineStrip,
  type PublishingAlbumState,
} from "./PublishingPipelineStrip";

// Task #295 — shared "Albums" tab rendered on each entity-detail
// admin page (NPO / Reseller / Press). The connection logic (which
// albums tie to this entity, and why) lives server-side; this
// component just renders the In queue / Released split and a
// pipeline strip per row.

export type EntityAlbumPress = { id: string; name: string; status: string };

export type EntityAlbumRow = {
  id: string;
  title: string;
  artistName: string | null;
  coverUrl: string | null;
  connectionReason: string | null;
  firstSoldAt: string | null;
  state: PublishingAlbumState;
  presses?: EntityAlbumPress[];
  awaitingPressingOrder?: boolean;
};

export type EntityAlbumsResponse = {
  inQueue: EntityAlbumRow[];
  released: EntityAlbumRow[];
};

export interface EntityAlbumsTabProps {
  apiPath: string;
  testIdPrefix: string;
  emptyHint?: string;
  /**
   * When true (Reseller use), render a "Presses" subsection that
   * rolls every connected album up by the press(es) it was sent to.
   * Server must include row.presses for this to render anything.
   */
  showPressesSubsection?: boolean;
}

export function EntityAlbumsTab({
  apiPath,
  testIdPrefix,
  emptyHint = "No connected albums yet.",
  showPressesSubsection = false,
}: EntityAlbumsTabProps) {
  const { data, isLoading } = useQuery<EntityAlbumsResponse>({
    queryKey: [apiPath],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }
  const inQueue = data?.inQueue ?? [];
  const released = data?.released ?? [];
  const empty = inQueue.length === 0 && released.length === 0;
  if (empty) {
    return (
      <div
        className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500"
        data-testid={`empty-${testIdPrefix}-albums`}
      >
        {emptyHint}
      </div>
    );
  }
  return (
    <div className="space-y-6" data-testid={`tab-${testIdPrefix}-albums`}>
      <AlbumSection
        title="In queue"
        rows={inQueue}
        testIdPrefix={`${testIdPrefix}-inqueue`}
      />
      <AlbumSection
        title="Released"
        rows={released}
        testIdPrefix={`${testIdPrefix}-released`}
      />
      {showPressesSubsection && (
        <PressesSubsection
          rows={[...inQueue, ...released]}
          testIdPrefix={testIdPrefix}
        />
      )}
    </div>
  );
}

function PressesSubsection({
  rows,
  testIdPrefix,
}: {
  rows: EntityAlbumRow[];
  testIdPrefix: string;
}) {
  // Roll albums up by press: each press shows the albums it's pressing
  // for this reseller's connected gear. Skips the section entirely
  // when no album has a press snapshot (most rows won't, since not
  // every artist who features this gear has run "Go to Press!" yet).
  const byPress = new Map<string, { name: string; albums: EntityAlbumRow[] }>();
  for (const row of rows) {
    for (const p of row.presses ?? []) {
      const entry = byPress.get(p.id) ?? { name: p.name, albums: [] };
      if (!entry.albums.find((a) => a.id === row.id)) entry.albums.push(row);
      byPress.set(p.id, entry);
    }
  }
  if (byPress.size === 0) return null;
  const entries = Array.from(byPress.entries()).sort(
    (a, b) => b[1].albums.length - a[1].albums.length,
  );
  return (
    <section data-testid={`section-${testIdPrefix}-presses`}>
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-xs uppercase tracking-wide font-semibold text-slate-500">
          Presses
        </h3>
        <span className="text-xs text-slate-400 tabular-nums">
          {entries.length}
        </span>
      </div>
      <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
        {entries.map(([pressId, info]) => (
          <li
            key={pressId}
            className="px-3 py-2"
            data-testid={`row-${testIdPrefix}-press-${pressId}`}
          >
            <div className="flex items-center justify-between gap-3">
              <Link href={`/admin/manufacturers/${pressId}`} className="text-sm font-semibold transition-colors hover:text-[color:var(--brand-blue)] hover:underline underline-offset-2">
                {info.name}
              </Link>
              <span className="text-xs text-slate-500 tabular-nums">
                {info.albums.length} album{info.albums.length === 1 ? "" : "s"}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500 truncate">
              {info.albums.map((a) => a.title).join(" · ")}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AlbumSection({
  title,
  rows,
  testIdPrefix,
}: {
  title: string;
  rows: EntityAlbumRow[];
  testIdPrefix: string;
}) {
  if (rows.length === 0) return null;
  return (
    <section data-testid={`section-${testIdPrefix}`}>
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-xs uppercase tracking-wide font-semibold text-slate-500">
          {title}
        </h3>
        <span className="text-xs text-slate-400 tabular-nums">
          {rows.length}
        </span>
      </div>
      <ul className="space-y-2">
        {rows.map((row) => (
          <li
            key={row.id}
            className="rounded-2xl border border-slate-200 bg-white p-3"
            data-testid={`row-${testIdPrefix}-${row.id}`}
          >
            <div className="flex items-center gap-3">
              {row.coverUrl ? (
                <img
                  src={row.coverUrl}
                  alt=""
                  className="w-12 h-12 rounded-md object-cover bg-slate-100"
                />
              ) : (
                <div className="w-12 h-12 rounded-md bg-slate-100" />
              )}
              <div className="flex-1 min-w-0">
                <Link href={`/admin/albums/${row.id}`} className="block text-sm font-semibold truncate transition-colors hover:text-[color:var(--brand-blue)] hover:underline underline-offset-2" data-testid={`link-album-${row.id}`}>
                  {row.title}
                </Link>
                <p className="text-xs text-slate-500 truncate">
                  {row.artistName ?? "—"}
                </p>
                {row.awaitingPressingOrder && (
                  <div
                    className="mt-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                    data-testid={`badge-awaiting-pressing-${row.id}`}
                  >
                    Awaiting pressing order
                  </div>
                )}
              </div>
              {row.connectionReason && (
                <span
                  className="hidden md:inline text-xs uppercase tracking-wide font-medium text-slate-400"
                  data-testid={`reason-${row.id}`}
                  title={row.connectionReason}
                >
                  {row.connectionReason}
                </span>
              )}
            </div>
            <div className="mt-2 pl-15">
              <PublishingPipelineStrip state={row.state} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
