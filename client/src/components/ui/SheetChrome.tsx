import { createContext, useContext } from "react";
import { IconButton, type IconButtonVariant } from "./IconButton";

/**
 * Shared sheet chrome (Task #817).
 *
 * One close button, one back chevron, and one "room at the top" inset for
 * every fan-facing mobile sheet so they all dismiss the same way — the
 * Apple-Card / Apple-Ads pattern: a circular gray chip floating in the
 * whitespace above the content, a back chevron top-left on drill-downs,
 * and generous breathing room before the content begins.
 *
 * The close / back glyphs render through `IconButton` (the canonical 44pt
 * chrome primitive) so size, press-feedback, and tint stay consistent with
 * the rest of the player shell. Prefer the X glyph over a translated
 * "Done"/"Cancel" string — it survives Android + localization unchanged.
 */

// Generous, consistent top inset. Full-screen sheets add this to their
// toolbar's top padding so the close button clears the device safe-area
// and still has "room at the top" before content begins.
export const SHEET_SAFE_TOP = "calc(env(safe-area-inset-top, 0px) + 12px)";

// --- self-managed dismiss context ----------------------------------------
//
// `SheetShell` exposes its animated dismiss through this context so the
// shared close / back buttons (and any in-sheet control) trigger the slide-
// out + scrim fade rather than yanking the sheet off-screen instantly. The
// value is a function that optionally takes the final unmount action to run
// once the close animation finishes (drill-downs pass `closeAll` to the X so
// it tears the whole stack down, while the back chevron pops one level).
type SheetDismiss = (final?: () => void) => void;

const SheetDismissContext = createContext<SheetDismiss | null>(null);

export function useSheetDismiss(): SheetDismiss | null {
  return useContext(SheetDismissContext);
}

export function SheetDismissProvider({
  value,
  children,
}: {
  value: SheetDismiss;
  children: React.ReactNode;
}) {
  return (
    <SheetDismissContext.Provider value={value}>
      {children}
    </SheetDismissContext.Provider>
  );
}

// --- shared buttons -------------------------------------------------------

interface SheetChromeButtonProps {
  /** Explicit handler. When omitted, the button auto-wires to the enclosing
   *  SheetShell's animated dismiss. */
  onClick?: () => void;
  label?: string;
  variant?: IconButtonVariant;
  className?: string;
  "data-testid"?: string;
}

/**
 * The one shared circular close ("X") chip used by every fan sheet.
 *
 * Apple's `xmark.circle.fill`: a large opaque light-gray circle with a dark
 * glyph, pinned top-right. Defaults to `fill` + `lg` so every sheet closes
 * with the same big, unmistakable X — callers no longer hand-pick a variant.
 */
export function SheetClose({
  onClick,
  label = "Close",
  variant = "fill",
  className,
  "data-testid": testId = "button-sheet-close",
}: SheetChromeButtonProps) {
  const dismiss = useSheetDismiss();
  const handle = onClick ?? (dismiss ? () => dismiss() : () => {});
  return (
    <IconButton
      variant={variant}
      size="lg"
      label={label}
      onClick={handle}
      className={className}
      data-testid={testId}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M18 6L6 18M6 6l12 12" />
      </svg>
    </IconButton>
  );
}

/** Shared back chevron for drill-down sheets — pairs with `SheetClose`. */
export function SheetBack({
  onClick,
  label = "Back",
  variant = "glass",
  className,
  "data-testid": testId = "button-sheet-back",
}: SheetChromeButtonProps) {
  const dismiss = useSheetDismiss();
  const handle = onClick ?? (dismiss ? () => dismiss() : () => {});
  return (
    <IconButton
      variant={variant}
      label={label}
      onClick={handle}
      className={className}
      data-testid={testId}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M15 6l-6 6 6 6" />
      </svg>
    </IconButton>
  );
}
