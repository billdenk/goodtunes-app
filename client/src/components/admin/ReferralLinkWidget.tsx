// Task #2399 — Reusable referral-link widget used by partner portals
// (NPO, press, label). Shows the entity's shareable /join/:code URL,
// with copy, regenerate, and active-toggle controls.
//
// Props:
//   kind      — "artist" | "non_profit" | "manufacturer" | "label" | "ambassador"
//   scopeId   — the entity's DB id (npoId, pressId, etc.)
//   canEdit   — whether the current user can regenerate / toggle (false = read-only)

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Copy, Check, RefreshCw, Link2, Loader2, ExternalLink } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface ReferralLinkData {
  id: string;
  code: string;
  active: boolean;
  referrerKind: string;
  referrerScopeId: string;
  createdAt: string;
  branding: {
    name: string;
    photoUrl: string | null;
    orgName: string | null;
  };
}

type ReferralKind = "artist" | "non_profit" | "manufacturer" | "label" | "ambassador";

// Reconstruct the public-facing /join/:code URL from the current window origin
// (works for both dev and prod, admin host).
function buildJoinUrl(code: string): string {
  return `${window.location.origin}/join/${code}`;
}

interface Props {
  kind: ReferralKind;
  scopeId: string;
  canEdit?: boolean;
}

export function ReferralLinkWidget({ kind, scopeId, canEdit = false }: Props) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const q = useQuery<ReferralLinkData>({
    queryKey: ["/api/referral-links", kind, scopeId],
    queryFn: async () => {
      const r = await fetch(`/api/referral-links/${kind}/${scopeId}`, {
        credentials: "include",
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message ?? "Could not load referral link");
      return j;
    },
    staleTime: 30_000,
  });

  const regenMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest(
        "POST",
        `/api/referral-links/${kind}/${scopeId}/regenerate`,
      );
      return r.json() as Promise<{ code: string; active: boolean }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/referral-links", kind, scopeId] });
      toast({ title: "New referral link generated", description: "The old URL no longer works." });
    },
    onError: (e: Error) => {
      toast({ title: "Couldn't regenerate", description: e.message, variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (active: boolean) => {
      const r = await apiRequest(
        "PATCH",
        `/api/referral-links/${kind}/${scopeId}`,
        { active },
      );
      return r.json();
    },
    onSuccess: (_, active) => {
      queryClient.invalidateQueries({ queryKey: ["/api/referral-links", kind, scopeId] });
      toast({ title: active ? "Referral link enabled" : "Referral link disabled" });
    },
    onError: (e: Error) => {
      toast({ title: "Couldn't update link", description: e.message, variant: "destructive" });
    },
  });

  async function copyLink() {
    if (!q.data) return;
    try {
      await navigator.clipboard.writeText(buildJoinUrl(q.data.code));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({ title: "Copy failed", description: "Select and copy the URL manually.", variant: "destructive" });
    }
  }

  // ─── Loading state ──────────────────────────────────────────────────────
  if (q.isLoading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 flex items-center gap-2 text-slate-400">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Loading referral link…</span>
      </div>
    );
  }

  if (q.isError || !q.data) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
        <p className="text-sm text-rose-700">Couldn't load referral link.</p>
      </div>
    );
  }

  const link = q.data;
  const joinUrl = buildJoinUrl(link.code);

  return (
    <div
      className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3"
      data-testid="panel-referral-link"
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link2 className="w-4 h-4 text-[var(--brand-blue)] flex-shrink-0" />
          <span className="text-sm font-semibold text-slate-900">Referral link</span>
          {!link.active && (
            <span className="text-xs font-medium bg-slate-100 text-slate-500 rounded-full px-2 py-0.5">
              Disabled
            </span>
          )}
        </div>

        {canEdit && (
          <div className="flex items-center gap-2">
            <Switch
              checked={link.active}
              onCheckedChange={(checked) => toggleMutation.mutate(checked)}
              disabled={toggleMutation.isPending}
              data-testid={`switch-referral-active`}
            />
            <span className="text-xs text-slate-500">
              {link.active ? "Active" : "Off"}
            </span>
          </div>
        )}
      </div>

      {/* URL row */}
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
        <code
          className="flex-1 text-xs text-slate-700 truncate font-mono"
          data-testid="text-referral-url"
        >
          {joinUrl}
        </code>
        <button
          type="button"
          onClick={copyLink}
          className="flex items-center gap-1 text-xs font-semibold text-[var(--brand-blue)] hover:opacity-80 transition-opacity flex-shrink-0"
          data-testid="button-copy-referral-link"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
        <a
          href={joinUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 text-slate-400 hover:text-slate-600 transition-colors"
          data-testid="link-open-referral"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      <p className="text-xs text-slate-500 leading-snug">
        Share this link anywhere — socials, bio, email signature. Anyone who opens it can
        apply to join GoodTunes as an artist. Applications land in the GoodTunes review queue
        before an invite email goes out.
      </p>

      {/* Regenerate */}
      {canEdit && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors"
              data-testid="button-regen-referral"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Generate new link (old link will break)
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Generate a new referral link?</AlertDialogTitle>
              <AlertDialogDescription>
                Anyone using the current link won't be able to reach your referral page anymore.
                This can't be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-regen">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => regenMutation.mutate()}
                disabled={regenMutation.isPending}
                className="bg-rose-600 text-white hover:bg-rose-700"
                data-testid="button-confirm-regen"
              >
                {regenMutation.isPending ? "Generating…" : "Generate new link"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
