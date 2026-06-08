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

// Shared fan top-chrome vertical inset (Task #1601). The floating back caret,
// share button, and ••• capsule on fan surfaces (album detail, artist, label)
// pin their `top` to this single token so every surface's top chrome sits on
// ONE line — tucked just below the status bar / Dynamic Island with a small,
// deliberate margin (Apple Music's placement). Expressed off the device safe
// area (NOT a hard-coded `top-14`, which ignored the safe area and sat too low
// on notched phones / too low everywhere else) so it clears the notch on every
// device, and kept equal to SHEET_SAFE_TOP so page chrome and sheet chrome
// align to the same line.
export const FAN_TOP_CHROME_INSET = SHEET_SAFE_TOP;

// Apple-Music-style soft top fade for a scrollable sheet region (Task #1693).
// Applied as a CSS mask on the scroll container so content dissolves as it
// scrolls up under the pinned top chrome (back chevron / close X) instead of
// hard-cutting at a sharp horizontal line. The fade reaches full opacity by
// 64px, so pair it with ~64px (`pt-16`) of top padding on the scrolled content
// (the person hero already adds a little more on top of that) — that way the
// first row rests *below* the fade and the chrome, fully opaque at rest, and
// only the act of scrolling pulls content up into the soft fade. Because the
// mask also fades the scroll region's own background, the host's surface color
// must match the panel/card behind it (it does on every fan sheet) so the
// faded band reveals an identical color, not a seam.
export const SHEET_TOP_FADE =
  "linear-gradient(to bottom, transparent 0px, rgba(0,0,0,0.4) 40px, #000 64px)";

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
 * Quiet glass treatment to match the `SheetBack` chevron — a translucent
 * white scrim on the dark sheet, pinned top-right, sized `lg`. The X glyph
 * stays large and unmistakable; only its background is muted from the old
 * opaque light-gray `fill` chip so close + back read as one chrome pair.
 * Callers can still pass `variant="fill"` for the rare high-contrast case.
 */
export function SheetClose({
  onClick,
  label = "Close",
  variant = "glass",
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
