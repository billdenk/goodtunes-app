import { type ElementType, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Shared geometry for operator and partner content pages. Rails own scrolling
 * and clipping; this component only centers the page body inside that space.
 */
export function PageColumn({
  children,
  className,
  padded = true,
  testId,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
  testId?: string;
}) {
  return (
    <div
      className={cn("mx-auto w-full max-w-[1240px]", padded && "px-4 sm:px-10 pt-8 pb-24", className)}
      data-testid={testId}
    >
      {children}
    </div>
  );
}

/**
 * Canon title rhythm: title, one secondary-size subtitle, then a real content
 * gap. It is deliberately color-token based so the same primitive works in
 * light partner portals and charcoal super-admin.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  titleExtras,
  as: Heading = "h1",
  divider = false,
  contentGap = true,
  className,
  testId = "text-page-title",
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  titleExtras?: ReactNode;
  as?: ElementType;
  divider?: boolean;
  contentGap?: boolean;
  className?: string;
  testId?: string;
}) {
  return (
    <header className={cn(contentGap && "mb-[var(--apple-space-header-content)]", className)}>
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <div className="flex items-baseline gap-4 flex-wrap">
            <Heading
              className="text-[length:var(--apple-type-page)] leading-[var(--apple-leading-page)] font-semibold tracking-[-0.02em] text-[var(--apple-ink)]"
              data-testid={testId}
            >
              {title}
            </Heading>
            {titleExtras}
          </div>
          {subtitle && (
            <div className="mt-1.5 max-w-[640px] text-[length:var(--apple-type-secondary)] leading-[1.5] font-medium text-[var(--apple-subink)]">
              {subtitle}
            </div>
          )}
        </div>
        {actions && <div className="flex flex-shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {divider && <div className="mt-4 border-b border-[var(--apple-hairline)]" aria-hidden="true" />}
    </header>
  );
}