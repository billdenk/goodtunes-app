import type { ReactNode } from "react";

/**
 * StatusDot — canonical Apple-canon status indicator: a small colored
 * dot + a short label, never color alone (docs/apple-canon.md "Status
 * dots (green/gray) + short phrase for item state").
 *
 * Tones map to the canon severity tokens, which brighten automatically
 * under `.gt-admin-dark`:
 *   ready    — green  (--apple-ready)    "Priced — ready to press"
 *   warning  — amber  (--apple-warning)
 *   critical — pink   (--apple-critical)
 *   neutral  — gray   (--apple-faint)    "Draft — no artwork yet"
 *   accent   — blue   (--apple-blue)     in-progress / informational
 */
export type StatusDotTone =
  | "ready"
  | "warning"
  | "critical"
  | "neutral"
  | "accent";

const TONE_VAR: Record<StatusDotTone, string> = {
  ready: "var(--apple-ready)",
  warning: "var(--apple-warning)",
  critical: "var(--apple-critical)",
  neutral: "var(--apple-faint)",
  accent: "var(--apple-blue)",
};

export function StatusDot({
  tone,
  children,
  className = "",
  testId,
}: {
  tone: StatusDotTone;
  /** Short phrase next to the dot — required; the dot never stands alone. */
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[var(--apple-subink)] ${className}`}
      data-testid={testId}
    >
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: TONE_VAR[tone] }}
      />
      {children}
    </span>
  );
}
