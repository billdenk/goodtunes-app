import type { ReactNode } from "react";

/**
 * Landscape tablet bezel — companion to PhoneBezel for admin previews
 * that want to surface the desktop/tablet fan view alongside the phone
 * one (Task #172). Same visual language as PhoneBezel: rounded outer
 * frame, thin bezel, subtle shadow, optional "Live preview …" caption
 * footer.
 *
 * Outer 700×525 with a 12px bezel ring → inner display 676×501. Sized
 * so the inner display is a clean 4:3 (ish) landscape canvas onto which
 * the consumer scales a 1024-wide virtual desktop view.
 *
 * Children fill the inner display; consumers are responsible for any
 * `transform: scale(…)` to fit a larger virtual layout into the inner
 * area. The bezel clips overflow so an oversize scaled child doesn't
 * leak out past the rounded frame.
 */
export function TabletBezel({
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
        className="relative rounded-[28px] overflow-hidden shadow-2xl"
        style={{
          width: 700,
          height: 525,
          background: "#00062B",
          padding: 12,
          boxShadow:
            "0 0 0 2px rgba(255,255,255,0.08), 0 30px 70px rgba(0,0,0,0.6)",
        }}
        data-testid={testId}
      >
        <div className="w-full h-full rounded-[18px] overflow-hidden bg-[#00062B] relative">
          {children}
        </div>
      </div>
      {footer && (
        <p className="text-slate-400 text-[11px] mt-3 text-center max-w-[640px]">
          {footer}
        </p>
      )}
    </div>
  );
}
