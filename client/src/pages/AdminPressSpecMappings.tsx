// Task #3394 — god-view canonical spec mapping review (cross-press import).
//
// Operator-only surface: reviews and adjusts the press-neutral canonical
// tags on one press's catalog options (color tiers → effect family, colors
// → color family, jackets → construction). These tags drive the cross-press
// translation engine; the per-press names stay untouched, and nothing here
// touches pricing. "Derived" shows the heuristic guess; picking a value
// stores it operator-confirmed. Server side fails closed to platform staff
// (requireAdmin admits partners; the routes re-check the raw users.role).

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRoute, Link } from 'wouter';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { AdminFrame } from '@/components/admin/AdminFrame';

type Stored<T extends string> = { [K in T]?: string } & { confirmed?: boolean };
type MappingRow = { id: string; name: string; format?: string; tierId?: string; derived: string | null; stored: Record<string, unknown> | null };
type MappingsPayload = {
  vocab: { effectFamilies: string[]; colorFamilies: string[]; jacketConstructions: string[] };
  tiers: MappingRow[];
  colors: MappingRow[];
  jackets: MappingRow[];
};

function storedValue(row: MappingRow, key: string): string | null {
  const v = row.stored?.[key];
  return typeof v === 'string' ? v : null;
}

function MappingTable({
  title,
  rows,
  vocabulary,
  attrKey,
  edits,
  onEdit,
}: {
  title: string;
  rows: MappingRow[];
  vocabulary: string[];
  attrKey: string;
  edits: Record<string, string>;
  onEdit: (id: string, value: string) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      <table className="mt-3 w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
            <th className="py-1 pr-3 font-medium">Name</th>
            <th className="py-1 pr-3 font-medium">Derived</th>
            <th className="py-1 pr-3 font-medium">Canonical tag</th>
            <th className="py-1 font-medium">Reviewed</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const stored = storedValue(r, attrKey);
            const current = edits[r.id] ?? stored ?? '';
            const confirmed = r.stored?.confirmed === true;
            return (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="py-1.5 pr-3 text-slate-800">
                  {r.name}
                  {r.format ? <span className="ml-2 text-xs text-slate-400">{r.format}</span> : null}
                </td>
                <td className="py-1.5 pr-3 text-slate-500">{r.derived ?? '—'}</td>
                <td className="py-1.5 pr-3">
                  <select
                    className="rounded border border-slate-200 bg-white px-2 py-1 text-sm text-slate-800"
                    value={current}
                    onChange={(e) => onEdit(r.id, e.target.value)}
                    data-testid={`select-${attrKey}-${r.id}`}
                  >
                    <option value="">(untagged — use derived)</option>
                    {vocabulary.map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </td>
                <td className="py-1.5 text-xs text-slate-500">{confirmed ? 'Operator' : r.stored ? 'Seeded' : '—'}</td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr><td colSpan={4} className="py-3 text-slate-400">Nothing here.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminPressSpecMappings() {
  const [, params] = useRoute('/admin/manufacturers/:id/spec-mappings');
  const pressId = params?.id ?? '';
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const mappingsKey = `/api/admin/presses/${pressId}/canonical-mappings`;

  const { data, isLoading } = useQuery<MappingsPayload>({
    queryKey: [mappingsKey],
    enabled: !!pressId,
    retry: false,
  });

  const [tierEdits, setTierEdits] = useState<Record<string, string>>({});
  const [colorEdits, setColorEdits] = useState<Record<string, string>>({});
  const [jacketEdits, setJacketEdits] = useState<Record<string, string>>({});
  const dirty = useMemo(
    () => Object.keys(tierEdits).length + Object.keys(colorEdits).length + Object.keys(jacketEdits).length > 0,
    [tierEdits, colorEdits, jacketEdits],
  );

  const save = useMutation({
    mutationFn: async () => {
      await apiRequest('PUT', mappingsKey, {
        tiers: Object.entries(tierEdits).map(([id, v]) => ({ id, effectFamily: v || null })),
        colors: Object.entries(colorEdits).map(([id, v]) => ({ id, colorFamily: v || null })),
        jackets: Object.entries(jacketEdits).map(([id, v]) => ({ id, construction: v || null })),
      });
    },
    onSuccess: async () => {
      setTierEdits({});
      setColorEdits({});
      setJacketEdits({});
      await queryClient.invalidateQueries({ queryKey: [mappingsKey] });
      toast({ title: 'Mappings saved' });
    },
    onError: (e: any) => toast({ title: 'Save failed', description: e?.message ?? 'Try again.', variant: 'destructive' }),
  });

  return (
    <AdminFrame active="manufacturers">
      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900" data-testid="heading-spec-mappings">Canonical spec mappings</h1>
            <p className="mt-1 text-sm text-slate-500 max-w-2xl">
              Press-neutral tags on this press's catalog options, used by the cross-press
              project import to translate specs between presses. Names and pricing are never
              touched here. Untagged rows fall back to the derived guess.
            </p>
            <p className="mt-1 text-sm">
              <Link href={`/admin/manufacturers/${pressId}`} className="text-blue-600 hover:underline">
                ← Back to press
              </Link>
            </p>
          </div>
          <button
            type="button"
            disabled={!dirty || save.isPending}
            onClick={() => save.mutate()}
            data-testid="button-save-mappings"
            className={`rounded-full px-5 py-2 text-sm font-semibold ${dirty && !save.isPending ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}
          >
            {save.isPending ? 'Saving…' : 'Save changes'}
          </button>
        </div>

        {isLoading && <p className="mt-8 text-sm text-slate-500">Loading…</p>}
        {data && (
          <div className="mt-6 grid gap-5">
            <MappingTable
              title="Finishes (color tiers) — effect family"
              rows={data.tiers}
              vocabulary={data.vocab.effectFamilies}
              attrKey="effectFamily"
              edits={tierEdits}
              onEdit={(id, v) => setTierEdits((p) => ({ ...p, [id]: v }))}
            />
            <MappingTable
              title="Colors — color family"
              rows={data.colors}
              vocabulary={data.vocab.colorFamilies}
              attrKey="colorFamily"
              edits={colorEdits}
              onEdit={(id, v) => setColorEdits((p) => ({ ...p, [id]: v }))}
            />
            <MappingTable
              title="Jackets — construction"
              rows={data.jackets}
              vocabulary={data.vocab.jacketConstructions}
              attrKey="construction"
              edits={jacketEdits}
              onEdit={(id, v) => setJacketEdits((p) => ({ ...p, [id]: v }))}
            />
          </div>
        )}
      </div>
    </AdminFrame>
  );
}
