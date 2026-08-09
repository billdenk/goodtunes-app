import { useState } from "react";
import { formatUsdCents } from "@shared/money";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { ErrorState } from "@/components/admin/AdminErrorBoundary";
import { ChevronRight, ChevronDown, User as UserIcon, Heart, Factory } from "lucide-react";
import { ScopePicker, SCOPE_CONFIG } from "@/components/admin/RoleScopePicker";

// Task #350 — Invite tree.
//
// Visualises any (artist | non_profit | manufacturer) root and the
// subtree of partners they've brought onto the platform. The server's
// BFS already collapses dup-attribution loops; the client renders the
// flat node list as a collapsible tree using parentId. Each node
// surfaces paid units + pending payout so an operator can see who in
// the tree is actually moving units.
type Node = {
  id: string;
  kind: "artist" | "non_profit" | "manufacturer";
  name: string;
  photoUrl?: string | null;
  logoUrl?: string | null;
  parentId: string | null;
  paidUnits: number;
  pendingCents: number;
};

type TreeResp = { root: { kind: string; id: string }; nodes: Node[] };

const fmt = (c: number) => formatUsdCents(c);

export function AdminInviteTree() {
  const [, navigate] = useLocation();
  const [scopeKind, setScopeKind] = useState<"artist" | "non_profit" | "manufacturer">("artist");
  const [scopeId, setScopeId] = useState<string | null>(null);

  const enabled = !!scopeId;
  const { data, isLoading, isError, error, refetch } = useQuery<TreeResp>({
    queryKey: ["/api/admin/invite-tree", scopeKind, scopeId],
    enabled,
  });

  return (
    <AdminFrame active="invite-tree">
      <div className="max-w-3xl">
        <AdminPageHeader
          title="Invite tree."
          subtitle="Pick any artist, non-profit, or press to see the partners they've referred onto GoodTunes — ambassadors, artists, and the projects those artists shipped. Per-node $ totals show pending referral credit for that artist."
        />

        <div className="bg-white border border-[var(--apple-hairline)] rounded-2xl p-5 mt-5 mb-6">
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--apple-subink)] mb-1">
            Root
          </label>
          <select
            value={scopeKind}
            onChange={(e) => {
              setScopeKind(e.target.value as any);
              setScopeId(null);
            }}
            className="w-full sm:w-64 px-3 py-2 rounded-lg border border-[var(--apple-hairline)] bg-white focus:border-[var(--brand-blue)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]/20"
            data-testid="select-scope-kind"
          >
            <option value="artist">Artist</option>
            <option value="non_profit">Non-profit</option>
            <option value="manufacturer">Press</option>
          </select>
          <ScopePicker
            cfg={SCOPE_CONFIG[scopeKind]}
            value={scopeId}
            onChange={(id) => setScopeId(id)}
            testId="invite-tree-scope"
          />
        </div>

        {!enabled ? (
          <div className="bg-white border border-[var(--apple-hairline)] rounded-2xl" data-testid="empty-invite-tree">
            <AdminEmptyState>Pick a root above to render its invite subtree.</AdminEmptyState>
          </div>
        ) : isLoading ? (
          <div className="text-[13px] text-[var(--apple-subink)]">Loading tree…</div>
        ) : isError ? (
          <ErrorState
            error={error as any}
            onRetry={() => refetch()}
            title="Couldn't load invite tree"
            testId="invite-tree-error"
          />
        ) : !data || data.nodes.length === 0 ? (
          <div className="bg-white border border-[var(--apple-hairline)] rounded-2xl">
            <AdminEmptyState>No descendants yet.</AdminEmptyState>
          </div>
        ) : (
          <div className="bg-white border border-[var(--apple-hairline)] rounded-2xl p-3" data-testid="tree-root">
            <TreeNode nodes={data.nodes} nodeId={data.nodes[0].id} depth={0} navigate={navigate} />
          </div>
        )}
      </div>
    </AdminFrame>
  );
}

function TreeNode({ nodes, nodeId, depth, navigate }: { nodes: Node[]; nodeId: string; depth: number; navigate: (path: string) => void }) {
  const node = nodes.find((n) => n.id === nodeId)!;
  const children = nodes.filter((n) => n.parentId === nodeId);
  const [open, setOpen] = useState(true);
  const thumb = node.photoUrl ?? node.logoUrl ?? null;
  const KindIcon = node.kind === "artist" ? UserIcon : node.kind === "non_profit" ? Heart : Factory;
  const linkHref = node.kind === "artist"
    ? `/admin/people/${node.id}`
    : node.kind === "non_profit"
      ? `/admin/non-profits/${node.id}`
      : `/admin/manufacturers/${node.id}`;

  return (
    <div className="text-sm">
      <div
        className="flex items-center gap-2 py-1.5 px-2 hover:bg-[var(--apple-track)] rounded-md"
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
        data-testid={`tree-node-${node.id}`}
      >
        {children.length > 0 ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="p-0.5 text-[var(--apple-faint)] hover:text-[var(--apple-ink)]"
            aria-label={open ? "Collapse" : "Expand"}
            data-testid={`button-toggle-${node.id}`}
          >
            {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        ) : (
          <div className="w-4" />
        )}
        {thumb ? (
          <img src={thumb} alt="" className="w-7 h-7 rounded-full object-cover bg-[var(--apple-track)] flex-shrink-0" />
        ) : (
          <div className="w-7 h-7 rounded-full bg-[var(--apple-chip)] flex items-center justify-center flex-shrink-0">
            <KindIcon className="w-3.5 h-3.5 text-[var(--apple-subink)]" />
          </div>
        )}
        <button
          type="button"
          onClick={() => navigate(linkHref)}
          className="flex-1 min-w-0 text-left font-medium text-[var(--apple-ink)] truncate hover:underline"
          data-testid={`link-tree-${node.id}`}
        >
          {node.name}
        </button>
        {node.kind === "artist" && (
          <>
            <span className="text-xs text-[var(--apple-subink)] tabular-nums" data-testid={`text-units-${node.id}`}>
              {node.paidUnits} unit{node.paidUnits === 1 ? "" : "s"}
            </span>
            <span className="text-xs font-semibold text-[color:var(--brand-mint)] tabular-nums w-16 text-right" data-testid={`text-pending-${node.id}`}>
              {fmt(node.pendingCents)}
            </span>
          </>
        )}
      </div>
      {open && children.map((c) => (
        <TreeNode key={`${c.kind}:${c.id}`} nodes={nodes} nodeId={c.id} depth={depth + 1} navigate={navigate} />
      ))}
    </div>
  );
}
