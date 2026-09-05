import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The common production-workspace surface. It deliberately owns geometry
 * only: every production body keeps its existing queries, mutations and
 * permissions while Package, Sell and Physical share one edge-to-edge frame.
 */
export function AlbumWorkspacePanel({
  children,
  className,
  testId,
}: {
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <section
      className={cn(
        "w-full min-w-0 rounded-2xl border border-[var(--apple-hairline)] bg-[var(--apple-card)]",
        "px-3 py-4 sm:px-5 sm:py-5 lg:px-6",
        className,
      )}
      data-testid={testId}
    >
      {children}
    </section>
  );
}