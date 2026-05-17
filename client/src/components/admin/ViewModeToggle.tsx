import { useEffect, useState } from "react";
import { LayoutGrid, List } from "lucide-react";

/**
 * Apple-Music-style Grid / List segmented control for the admin
 * index pages (Albums, People, Gear, Vendors, Labels). The mode is
 * persisted per-entity in localStorage so it survives reloads and
 * tab switches — Bill expects "list mode on Vendors stays list mode
 * on Vendors" while Gear can stay on grid.
 *
 * Hook + presentational button live in the same file because they
 * always ship together; consumers just do:
 *
 *   const [view, setView] = useViewMode("albums");
 *   <ViewModeToggle value={view} onChange={setView} />
 *   {view === "grid" ? <Grid /> : <List />}
 */
export type ViewMode = "grid" | "list";

const storageKey = (entity: string) => `gt:admin:view:${entity}`;

export function useViewMode(
  entity: string,
  fallback: ViewMode = "grid",
): readonly [ViewMode, (m: ViewMode) => void] {
  const [mode, setMode] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return fallback;
    try {
      const v = localStorage.getItem(storageKey(entity));
      return v === "list" || v === "grid" ? v : fallback;
    } catch {
      return fallback;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(storageKey(entity), mode);
    } catch {
      // localStorage can be blocked (Safari private mode etc.) — the
      // user just loses persistence, the UI keeps working.
    }
  }, [entity, mode]);
  return [mode, setMode] as const;
}

export function ViewModeToggle({
  value,
  onChange,
  testIdPrefix = "view-mode",
}: {
  value: ViewMode;
  onChange: (m: ViewMode) => void;
  testIdPrefix?: string;
}) {
  return (
    <div
      className="inline-flex items-center bg-slate-100 rounded-md p-0.5"
      role="group"
      aria-label="View mode"
    >
      <SegBtn
        active={value === "grid"}
        onClick={() => onChange("grid")}
        label="Grid"
        testId={`${testIdPrefix}-grid`}
      >
        <LayoutGrid className="w-4 h-4" />
      </SegBtn>
      <SegBtn
        active={value === "list"}
        onClick={() => onChange("list")}
        label="List"
        testId={`${testIdPrefix}-list`}
      >
        <List className="w-4 h-4" />
      </SegBtn>
    </div>
  );
}

function SegBtn({
  active,
  onClick,
  label,
  testId,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={`${label} view`}
      title={label}
      data-testid={testId}
      className={[
        "w-8 h-8 inline-flex items-center justify-center rounded transition-colors",
        active
          ? "bg-white text-slate-900 shadow-sm"
          : "text-slate-500 hover:text-slate-900",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
