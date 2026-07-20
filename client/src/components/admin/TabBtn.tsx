import { type ReactNode } from "react";

/**
 * TabBtn — shared underline-style tab button for admin + partner-portal
 * index pages. Extracted from AdminAlbums so press / artist / label portals
 * can render identical chrome — only the data scope differs.
 *
 * Usage:
 *   <div className="border-b border-slate-200 flex items-center gap-6">
 *     <TabBtn active={tab === "all"} onClick={() => setTab("all")} count={albums.length}>All</TabBtn>
 *     …
 *   </div>
 */
export function TabBtn({
  active,
  onClick,
  count,
  children,
  testId,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={[
        "relative py-2.5 text-[13.5px] font-semibold transition-colors inline-flex items-center gap-1.5 flex-shrink-0",
        active ? "text-slate-900" : "text-slate-400 hover:text-slate-700",
      ].join(" ")}
    >
      {children}
      <span
        className={[
          "tabular-nums text-[11.5px] font-bold px-1.5 py-px rounded",
          active ? "bg-slate-100 text-slate-600" : "bg-slate-50 text-slate-400",
        ].join(" ")}
      >
        {count}
      </span>
      {active && (
        <span className="absolute -bottom-px left-0 right-0 h-[2px] bg-[var(--brand-blue)] rounded-full" />
      )}
    </button>
  );
}
