import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Disc3,
  User,
  Guitar,
  Store,
  Tag,
  ArrowLeft,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import gtLogo from "@assets/2025_GoodTunes_Logo-dark.1_1778271422870.png";

const PREVIEW_OPEN_KEY = "gt:admin-preview-open";

/**
 * Shared chrome for the new admin: top bar with GoodTunes wordmark +
 * admin chip + back-to-player link, and left entity sidebar with live
 * counts. Wrap any admin page in this and pass which entity is active.
 *
 * Albums + People + Gear + Vendors + Labels all have new-admin pages
 * now — every sidebar row routes into the new frame. The classic admin
 * is reached only via per-page "Open in classic admin" jump-offs that
 * set their own focus keys.
 */
export type EntityKey = "albums" | "people" | "gear" | "vendors" | "labels";

export function AdminFrame({
  active,
  preview,
  children,
}: {
  active: EntityKey;
  /**
   * Optional fan-side preview to render in the collapsible right pane.
   * When omitted (list pages, loading/error states) the pane is hidden
   * entirely so the editor gets the full main column.
   */
  preview?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  // Toggle state for the right preview pane. Persisted so once you tuck
  // it away it stays tucked across navigations / refreshes — matches
  // the macOS Mail / VS Code sidebar pattern.
  const [previewOpen, setPreviewOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    try {
      const raw = window.localStorage.getItem(PREVIEW_OPEN_KEY);
      return raw === null ? true : raw === "1";
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(PREVIEW_OPEN_KEY, previewOpen ? "1" : "0");
    } catch {}
  }, [previewOpen]);

  const { data: albums = [] } = useQuery<unknown[]>({
    queryKey: ["/api/albums"],
    enabled: !!user?.isAdmin,
  });
  const { data: people = [] } = useQuery<unknown[]>({
    queryKey: ["/api/people"],
    enabled: !!user?.isAdmin,
  });
  const { data: instruments = [] } = useQuery<unknown[]>({
    queryKey: ["/api/instruments"],
    enabled: !!user?.isAdmin,
  });
  const { data: vendors = [] } = useQuery<unknown[]>({
    queryKey: ["/api/vendors"],
    enabled: !!user?.isAdmin,
  });
  const { data: labels = [] } = useQuery<unknown[]>({
    queryKey: ["/api/labels"],
    enabled: !!user?.isAdmin,
  });

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans antialiased">
      {/* TOP BAR */}
      <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 sm:px-6 flex-shrink-0">
        <Link
          href="/admin/albums"
          className="flex items-center"
          data-testid="link-admin-home"
        >
          <img src={gtLogo} alt="GoodTunes" className="h-8 w-auto" />
        </Link>
        <div className="flex items-center gap-3">
          <span
            className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#319ED8]/10 text-[#319ED8] text-[10.5px] font-bold uppercase tracking-wider"
            data-testid="badge-admin"
          >
            Admin
          </span>
        </div>
      </header>

      {/* BODY */}
      <div className="flex-1 flex min-h-0">
        <aside className="w-[220px] flex-shrink-0 border-r border-slate-200 bg-white py-4 hidden md:block">
          <nav className="px-2 space-y-0.5" data-testid="nav-admin-entities">
            <SidebarLink
              icon={Disc3}
              label="Albums"
              count={albums.length}
              active={active === "albums"}
              onClick={() => navigate("/admin/albums")}
              testId="nav-albums"
            />
            <SidebarLink
              icon={User}
              label="People"
              count={people.length}
              active={active === "people"}
              onClick={() => navigate("/admin/people")}
              testId="nav-people"
            />
            <SidebarLink
              icon={Guitar}
              label="Gear"
              count={instruments.length}
              active={active === "gear"}
              onClick={() => navigate("/admin/instruments")}
              testId="nav-gear"
            />
            <SidebarLink
              icon={Store}
              label="Vendors"
              count={vendors.length}
              active={active === "vendors"}
              onClick={() => navigate("/admin/vendors")}
              testId="nav-vendors"
            />
            <SidebarLink
              icon={Tag}
              label="Labels"
              count={labels.length}
              active={active === "labels"}
              onClick={() => navigate("/admin/labels")}
              testId="nav-labels"
            />
          </nav>
        </aside>

        <main className="flex-1 min-w-0 p-6 sm:p-8 overflow-x-hidden">
          <div className="max-w-[1180px]">{children}</div>
        </main>

        {/* RIGHT PREVIEW PANE — rendered only when the page passes
            preview content. Toggle persists in localStorage. Collapsed
            state leaves a 44px rail with the toggle so it's always one
            tap to bring the preview back. */}
        {preview && (
          <aside
            className={[
              "border-l border-slate-200 bg-white flex-shrink-0 transition-[width] duration-200 ease-out hidden lg:flex flex-col",
              previewOpen ? "w-[440px]" : "w-11",
            ].join(" ")}
            data-testid="admin-preview-pane"
            data-open={previewOpen ? "true" : "false"}
          >
            <div
              className={[
                "h-12 flex-shrink-0 border-b border-slate-100 flex items-center",
                previewOpen ? "justify-between px-3" : "justify-center px-0",
              ].join(" ")}
            >
              <button
                type="button"
                onClick={() => setPreviewOpen((v) => !v)}
                className="w-8 h-8 rounded-md flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                title={previewOpen ? "Hide preview" : "Show preview"}
                aria-label={previewOpen ? "Hide preview" : "Show preview"}
                aria-pressed={previewOpen}
                data-testid="button-toggle-preview"
              >
                {previewOpen ? (
                  <PanelRightClose className="w-4 h-4" />
                ) : (
                  <PanelRightOpen className="w-4 h-4" />
                )}
              </button>
              {previewOpen && (
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                  Preview
                </span>
              )}
            </div>
            {previewOpen && (
              <div
                className="flex-1 overflow-y-auto p-6"
                data-testid="admin-preview-content"
              >
                {preview}
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

function SidebarLink({
  icon: Icon,
  label,
  count,
  active,
  onClick,
  testId,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={[
        "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13.5px] font-medium transition-colors",
        active
          ? "bg-[#319ED8]/10 text-[#319ED8]"
          : "text-slate-700 hover:bg-slate-100",
      ].join(" ")}
    >
      <Icon
        className={[
          "w-4 h-4 flex-shrink-0",
          active ? "text-[#319ED8]" : "text-slate-400",
        ].join(" ")}
      />
      <span className="flex-1 text-left">{label}</span>
      <span
        className={[
          "tabular-nums text-[11.5px] font-bold",
          active ? "text-[#319ED8]" : "text-slate-400",
        ].join(" ")}
      >
        {count}
      </span>
    </button>
  );
}
