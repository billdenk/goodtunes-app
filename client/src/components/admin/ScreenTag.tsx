import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Copy, Check } from "lucide-react";

/**
 * Super-admin-only screen tag.
 *
 * Tiny fixed-position chip in the bottom-right that shows a stable
 * short code for the current screen. When Nick screenshots us a page
 * and includes the code in the message, we know exactly which route /
 * component to touch — no ambiguity from "this page" or "that screen
 * I was on yesterday."
 *
 * The code is a base-36 hash of the *normalized* pathname (concrete
 * ids replaced with `:id`), so `/admin/labels/<uuid>` and
 * `/admin/labels/<other-uuid>` produce the same code — the underlying
 * file is the same.
 *
 * Click to copy. Persisted-collapsed if it ever gets in the way.
 */

const COLLAPSED_KEY = "gt:screen-tag-collapsed";

function normalizePath(path: string): string {
  // Replace UUIDs, ULIDs, and other long-id-shaped segments with `:id`
  // so the hash is per-route, not per-record. A "long id" here means
  // anything ≥8 chars containing a digit or a dash (covers uuids,
  // nanoids, slugged ids like `abc-123`).
  return path
    .split("/")
    .map((seg) => {
      if (!seg) return seg;
      const looksLikeId =
        seg.length >= 8 && /[-0-9]/.test(seg) && !/^[a-z]+$/i.test(seg);
      return looksLikeId ? ":id" : seg;
    })
    .join("/");
}

function hashCode(input: string): string {
  // djb2-ish — small, stable, good enough for a 4-char debug code.
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  }
  // Force unsigned, base36, pad to 4 chars.
  const u = h >>> 0;
  return u.toString(36).slice(-4).toUpperCase().padStart(4, "0");
}

export function ScreenTag() {
  const { user } = useAuth();
  const [location] = useLocation();

  // Only render for super-admins. Other admin roles (label / artist /
  // non-profit scoped admins) don't need this tool yet.
  const { data: roleInfo } = useQuery<{ role: string }>({
    queryKey: ["/api/me/role"],
    enabled: !!user?.isAdmin,
  });
  const isSuperAdmin = roleInfo?.role === "super_admin";

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
    } catch {}
  }, [collapsed]);

  const [copied, setCopied] = useState(false);

  const { code, normalized } = useMemo(() => {
    const norm = normalizePath(location);
    return { normalized: norm, code: hashCode(norm) };
  }, [location]);

  if (!isSuperAdmin) return null;

  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(`#${code}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard may be blocked — silent */
    }
  };

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="fixed bottom-3 right-3 z-[9999] h-6 w-6 rounded-full bg-slate-900/80 text-white text-[10px] font-bold inline-flex items-center justify-center hover:bg-slate-900 shadow-lg"
        title="Show screen tag"
        data-testid="button-screen-tag-expand"
      >
        #
      </button>
    );
  }

  return (
    <div
      className="fixed bottom-3 right-3 z-[9999] flex items-center gap-1.5 rounded-full bg-slate-900/90 text-white pl-2.5 pr-1 py-1 shadow-lg backdrop-blur-sm font-mono text-[11px] tabular-nums select-none"
      data-testid="screen-tag"
      data-screen-code={code}
      data-screen-route={normalized}
      title={`Screen ${code} — route: ${normalized}\nClick to copy`}
    >
      <button
        type="button"
        onClick={copy}
        className="inline-flex items-center gap-1 hover:text-[var(--brand-mint)] transition-colors"
        data-testid="button-screen-tag-copy"
      >
        <span className="opacity-60">#</span>
        <span className="font-bold tracking-wide">{code}</span>
        {copied ? (
          <Check className="w-3 h-3 text-[var(--brand-mint)]" />
        ) : (
          <Copy className="w-3 h-3 opacity-60" />
        )}
      </button>
      <span className="opacity-30">·</span>
      <span
        className="opacity-60 max-w-[180px] truncate"
        title={normalized}
      >
        {normalized}
      </span>
      <button
        type="button"
        onClick={() => setCollapsed(true)}
        className="ml-0.5 w-5 h-5 rounded-full inline-flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10"
        title="Hide"
        aria-label="Hide screen tag"
        data-testid="button-screen-tag-collapse"
      >
        ×
      </button>
    </div>
  );
}
