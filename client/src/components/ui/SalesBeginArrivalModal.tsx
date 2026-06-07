import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

// Task #1628 — first-arrival modal for a staged ("Sales Begin {date}")
// release. Welcomes the visitor before sales open and previews what ships in
// the package. Dismissible (X or tap-scrim) and stays dismissed for the rest
// of the visit (sessionStorage, per album) so it never nags on every render.
//
// Brand: navy surface, blue + mint accents (all via var(--brand-*)), subtly
// rounded card. The scrim is an opaque dim (no backdrop-filter) so it never
// stacks a second blur surface over the scrolling album page — the
// iOS-WebKit one-blur-per-region rule.

export interface SalesBeginArrivalModalProps {
  albumId: string;
  albumTitle: string;
  artist: string;
  /** Terse "M/D" sales-begin date, e.g. "6/8". */
  salesBeginLabel: string;
}

const DISMISS_KEY_PREFIX = "gt:salesBeginModalDismissed:";

function alreadyDismissed(albumId: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    return (
      window.sessionStorage.getItem(DISMISS_KEY_PREFIX + albumId) === "1"
    );
  } catch {
    return false;
  }
}

export function SalesBeginArrivalModal({
  albumId,
  albumTitle,
  artist,
  salesBeginLabel,
}: SalesBeginArrivalModalProps) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(() => !alreadyDismissed(albumId));

  // Re-evaluate if the album changes within the same mounted page.
  useEffect(() => {
    setOpen(!alreadyDismissed(albumId));
  }, [albumId]);

  const dismiss = () => {
    try {
      window.sessionStorage.setItem(DISMISS_KEY_PREFIX + albumId, "1");
    } catch {
      /* private mode — fall back to in-memory dismiss for this mount */
    }
    setOpen(false);
  };

  // The placeholder package copy. Bill will swap real fulfillment details in
  // later; kept generic so it reads honestly for any staged release.
  const PACKAGE_ITEMS = [
    "Limited-edition vinyl pressing",
    "Numbered GoodDeed™ certificate of ownership",
    "Full digital album, yours the moment sales open",
  ];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-center justify-center px-5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.18 }}
          data-testid="modal-sales-begin"
        >
          {/* Opaque dim scrim — no backdrop-filter (one-blur-per-region). */}
          <button
            type="button"
            aria-label="Dismiss"
            onClick={dismiss}
            className="absolute inset-0 bg-black/70"
            data-testid="scrim-sales-begin"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={`${albumTitle} — sales begin ${salesBeginLabel}`}
            className="relative w-full max-w-[400px] rounded-[28px] overflow-hidden text-white shadow-2xl"
            style={{
              background: "var(--brand-bg)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
            initial={{ opacity: 0, scale: reduce ? 1 : 0.94, y: reduce ? 0 : 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: reduce ? 1 : 0.96, y: reduce ? 0 : 8 }}
            transition={{ duration: reduce ? 0 : 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Top accent band */}
            <div
              className="px-6 pt-7 pb-5"
              style={{
                background:
                  "linear-gradient(135deg, rgba(49,158,216,0.22), rgba(127,16,167,0.18))",
              }}
            >
              <div
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
                style={{
                  background: "rgba(74,255,202,0.14)",
                  color: "var(--brand-mint)",
                }}
                data-testid="badge-sales-begin"
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <path d="M16 2v4M8 2v4M3 10h18" />
                </svg>
                Sales Begin {salesBeginLabel}
              </div>
              <h2
                className="mt-3 text-xl font-bold leading-tight"
                data-testid="text-sales-begin-title"
              >
                {albumTitle}
              </h2>
              <p className="mt-1 text-sm text-fan-secondary">{artist}</p>
            </div>

            <div className="px-6 pt-5 pb-6">
              <p className="text-sm leading-relaxed text-fan-secondary">
                You're early — sales for this release open on{" "}
                <span className="font-semibold text-white">
                  {salesBeginLabel}
                </span>
                . Press play to preview the album now, and here's what arrives
                in the package when sales begin:
              </p>
              <ul className="mt-4 space-y-2.5">
                {PACKAGE_ITEMS.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-2.5 text-sm text-fan-secondary"
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--brand-blue)"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="mt-0.5 flex-shrink-0"
                    >
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={dismiss}
                className="mt-6 w-full h-12 rounded-full font-semibold text-base text-white active:scale-[0.98] transition-transform"
                style={{
                  background: "linear-gradient(135deg, #1D5E8F, var(--brand-blue))",
                }}
                data-testid="button-sales-begin-dismiss"
              >
                Got it
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
