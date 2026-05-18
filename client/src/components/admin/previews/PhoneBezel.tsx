import type { ReactNode } from "react";

/**
 * Shared phone bezel used by every admin preview card so the new
 * Album / Person / Gear / Vendor previews share visual chrome with the
 * older LabelPreviewCard (which still draws its own bezel inline — left
 * untouched on purpose, no reason to risk regressing the demo surface).
 *
 * Renders a 360×760 rounded-pill device frame with the iOS status bar
 * and an inner overflow-y scroll column. Passes its content the brand
 * navy as a base so dark fan-style surfaces don't need to re-declare it.
 *
 * `footer` is rendered OUTSIDE the device frame (below it), matching
 * the "Live preview of the in-app …" caption pattern from
 * LabelPreviewCard.
 */
export function PhoneBezel({
  testId,
  children,
  footer,
}: {
  testId?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center">
      <p className="text-slate-400 text-[10.5px] font-semibold uppercase tracking-[0.12em] mb-3">
        Live preview
      </p>
      <div
        className="relative rounded-[42px] overflow-hidden shadow-2xl"
        style={{
          width: 360,
          height: 760,
          background: "#00062B",
          padding: 10,
          boxShadow:
            "0 0 0 2px rgba(255,255,255,0.08), 0 30px 70px rgba(0,0,0,0.6)",
        }}
        data-testid={testId}
      >
        <div className="w-full h-full rounded-[32px] overflow-hidden bg-[#00062B] flex flex-col">
          <div className="flex-shrink-0 flex items-center justify-between px-5 pt-3 pb-1 text-[11px] font-medium text-white">
            <span>9:41</span>
            <span>● ● ●</span>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-hide relative">
            {children}
          </div>
        </div>
      </div>
      {footer && (
        <p className="text-slate-400 text-[11px] mt-3 text-center max-w-[320px]">
          {footer}
        </p>
      )}
    </div>
  );
}
