import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AlertCircle, RotateCcw, Trash2 } from "lucide-react";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// Soft-delete Trash, super-admin only. Lists every row across the
// 14 admin-deletable entities that has `deleted_at` set and was
// deleted *as a root* (children that cascaded with a parent are
// hidden — they come back when the parent is restored). Rows are
// grouped by entity type. The daily sweeper hard-deletes anything
// past 30 days.

interface TrashRow {
  type: string;
  id: string;
  label: string;
  deletedAt: string;
  deletedByUserId: string | null;
  deletedByUserName: string | null;
}

interface PurgePreview {
  kind: string;
  id: string;
  children: { table: string; count: number }[];
  totalChildren: number;
}

const TYPE_LABEL: Record<string, string> = {
  album: "Albums",
  song: "Songs",
  album_video: "Album videos",
  album_photo: "Album photos",
  album_credit: "Album credits",
  person: "People",
  band_member: "Band members",
  instrument: "Gear",
  label: "Labels",
  vendor: "Makers & Resellers",
  manufacturer: "Presses",
  fulfillment_partner: "Fulfillment partners",
  track_writer: "Track writers",
  track_performer: "Track performers",
};

const GROUP_ORDER = [
  "album",
  "song",
  "album_video",
  "album_photo",
  "album_credit",
  "person",
  "band_member",
  "instrument",
  "label",
  "vendor",
  "manufacturer",
  "fulfillment_partner",
  "track_writer",
  "track_performer",
];

function daysLeft(deletedAt: string): number {
  const ms = new Date(deletedAt).getTime() + 30 * 86400_000 - Date.now();
  return Math.max(0, Math.ceil(ms / 86400_000));
}

function prettyTable(t: string): string {
  return t.replace(/_/g, " ");
}

export default function AdminTrash() {
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [pendingPurge, setPendingPurge] = useState<TrashRow | null>(null);

  const { data: rows = [], isLoading, error } = useQuery<TrashRow[]>({
    queryKey: ["/api/admin/trash"],
  });

  // Group rows by entity type, ordered so the page reads like the
  // sidebar instead of a flat audit dump.
  const grouped = useMemo(() => {
    const m = new Map<string, TrashRow[]>();
    for (const r of rows) {
      const arr = m.get(r.type) ?? [];
      arr.push(r);
      m.set(r.type, arr);
    }
    return GROUP_ORDER.filter((k) => m.has(k)).map((k) => ({
      kind: k,
      label: TYPE_LABEL[k] ?? k,
      rows: m.get(k)!,
    }));
  }, [rows]);

  const previewQ = useQuery<PurgePreview>({
    queryKey: pendingPurge
      ? ["/api/admin/trash", pendingPurge.type, pendingPurge.id, "preview"]
      : ["/api/admin/trash", "preview", "idle"],
    enabled: !!pendingPurge,
  });

  const restoreM = useMutation({
    mutationFn: async (row: TrashRow) => {
      await apiRequest("POST", `/api/admin/trash/${row.type}/${row.id}/restore`);
    },
    onMutate: (row) => setBusy(`r:${row.id}`),
    onSettled: () => setBusy(null),
    onSuccess: (_d, row) => {
      toast({ title: "Restored", description: `${prettyTable(row.type)} restored.` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/trash"] });
    },
    onError: (e: any) => {
      toast({
        title: "Restore failed",
        description: e?.message ?? "Unknown error",
        variant: "destructive",
      });
    },
  });

  const purgeM = useMutation({
    mutationFn: async (row: TrashRow) => {
      await apiRequest("DELETE", `/api/admin/trash/${row.type}/${row.id}`);
    },
    onMutate: (row) => setBusy(`p:${row.id}`),
    onSettled: () => {
      setBusy(null);
      setPendingPurge(null);
    },
    onSuccess: (_d, row) => {
      toast({
        title: "Purged",
        description: `${prettyTable(row.type)} permanently deleted.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/trash"] });
    },
    onError: (e: any) => {
      toast({
        title: "Purge failed",
        description: e?.message ?? "Unknown error",
        variant: "destructive",
      });
    },
  });

  return (
    <AdminFrame active="trash">
      <div className="px-6 py-8 max-w-[1200px] mx-auto">
        <div className="mb-6">
          <AdminPageHeader
            title="Deleted items."
            subtitle="Deleted records live here for 30 days, then are permanently removed. Restore brings the row back exactly as it was, including any children that were deleted with it."
            testId="text-trash-title"
          />
        </div>

        {isLoading && (
          <div className="text-[13px] text-[var(--apple-subink)]" data-testid="text-trash-loading">
            Loading…
          </div>
        )}
        {!!error && (
          <div className="flex items-start gap-2 rounded-xl border border-[var(--apple-critical)]/30 bg-[var(--apple-critical)]/10 px-3 py-2 text-sm text-[var(--apple-critical)]">
            <AlertCircle className="w-4 h-4 mt-0.5" />
            <div>{(error as any)?.message ?? "Failed to load."}</div>
          </div>
        )}

        {!isLoading && !error && grouped.length === 0 && (
          <div
            className="rounded-2xl border border-[var(--apple-hairline)] bg-white"
            data-testid="text-trash-empty"
          >
            <AdminEmptyState>Nothing here.</AdminEmptyState>
          </div>
        )}

        {!isLoading && grouped.length > 0 && (
          <div className="space-y-6">
            {grouped.map((g) => (
              <section
                key={g.kind}
                className="rounded-2xl border border-[var(--apple-hairline)] bg-white overflow-hidden"
                data-testid={`section-trash-${g.kind}`}
              >
                <header className="flex items-baseline justify-between px-3 py-2 bg-[var(--apple-track)] border-b border-[var(--apple-hairline)]">
                  <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--apple-subink)]">
                    {g.label}
                  </h2>
                  <span className="text-xs text-[var(--apple-subink)]">{g.rows.length}</span>
                </header>
                <table className="w-full text-sm">
                  <thead className="text-[var(--apple-subink)] text-[11px] font-semibold uppercase tracking-wider">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold">Name</th>
                      <th className="text-left px-3 py-2 font-semibold">Deleted</th>
                      <th className="text-left px-3 py-2 font-semibold">By</th>
                      <th className="text-left px-3 py-2 font-semibold">Auto-purge in</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map((row) => {
                      const dLeft = daysLeft(row.deletedAt);
                      return (
                        <tr
                          key={`${row.type}:${row.id}`}
                          className="border-t border-[var(--apple-hairline)]"
                          data-testid={`row-trash-${row.type}-${row.id}`}
                        >
                          <td className="px-3 py-2 text-[var(--apple-ink)] font-medium">
                            {row.label}
                          </td>
                          <td className="px-3 py-2 text-[var(--apple-subink)]">
                            {new Date(row.deletedAt).toLocaleString()}
                          </td>
                          <td className="px-3 py-2 text-[var(--apple-subink)]">
                            {row.deletedByUserName ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-[var(--apple-subink)]">
                            {dLeft} {dLeft === 1 ? "day" : "days"}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy === `r:${row.id}`}
                                onClick={() => restoreM.mutate(row)}
                                data-testid={`button-restore-${row.type}-${row.id}`}
                              >
                                <RotateCcw className="w-3.5 h-3.5 mr-1" />
                                Restore
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-[var(--apple-critical)] hover:text-[var(--apple-critical)] hover:border-[var(--apple-critical)]/40"
                                disabled={busy === `p:${row.id}`}
                                onClick={() => setPendingPurge(row)}
                                data-testid={`button-purge-${row.type}-${row.id}`}
                              >
                                <Trash2 className="w-3.5 h-3.5 mr-1" />
                                Purge
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>
            ))}
          </div>
        )}
      </div>

      <AlertDialog
        open={!!pendingPurge}
        onOpenChange={(open) => !open && setPendingPurge(null)}
      >
        <AlertDialogContent className="rounded-2xl overflow-hidden border border-[var(--apple-hairline)]" data-testid="dialog-purge-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[17px] font-semibold text-[var(--apple-ink)]">Permanently delete this record?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingPurge && (
                <span className="block">
                  <strong className="text-[var(--apple-ink)]">{pendingPurge.label}</strong>{" "}
                  ({prettyTable(pendingPurge.type)}) will be removed from the
                  database. This cannot be undone.
                </span>
              )}
              {previewQ.isLoading && (
                <span className="block mt-2 text-[var(--apple-subink)]">
                  Counting what else will be deleted…
                </span>
              )}
              {previewQ.data && previewQ.data.totalChildren > 0 && (
                <span className="block mt-3 rounded-lg border border-[var(--apple-critical)]/30 bg-[var(--apple-critical)]/10 p-2 text-[var(--apple-critical)] text-sm">
                  <span className="block font-medium mb-1">
                    Also deletes {previewQ.data.totalChildren} child row{previewQ.data.totalChildren === 1 ? "" : "s"}:
                  </span>
                  <ul className="list-disc list-inside" data-testid="list-purge-children">
                    {previewQ.data.children.map((c) => (
                      <li key={c.table}>
                        {c.count} {prettyTable(c.table)}
                      </li>
                    ))}
                  </ul>
                </span>
              )}
              {previewQ.data && previewQ.data.totalChildren === 0 && (
                <span className="block mt-2 text-[var(--apple-subink)]">
                  No child records will be affected.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-purge-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-full border-0 bg-[var(--apple-critical)]/10 text-[var(--apple-critical)] hover:bg-[var(--apple-critical)]/20"
              disabled={!pendingPurge || busy === `p:${pendingPurge.id}`}
              onClick={() => pendingPurge && purgeM.mutate(pendingPurge)}
              data-testid="button-purge-confirm"
            >
              Permanently delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminFrame>
  );
}
