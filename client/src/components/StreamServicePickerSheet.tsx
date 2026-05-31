import {
  STREAMING_SERVICES,
  type StreamingServiceId,
} from "@/lib/streamingService";
import { ServiceGlyphBadge } from "@/components/ui/ServiceGlyph";
import { motion, useReducedMotion } from "framer-motion";
import { sheetOpen, sheetClose, scrimFade } from "@/lib/motion";

interface StreamServicePickerSheetProps {
  // Only services with a usable link are tappable; the rest are dimmed so
  // the fan still sees the full menu but can't pick a dead handoff.
  available: StreamingServiceId[];
  heading?: string;
  subtitle?: string;
  onPick: (id: StreamingServiceId) => void;
  onClose: () => void;
}

// Task #734 — first-tap streaming-service picker. Shown the first time a fan
// hands off a stream-only track/album (and again any time they reset their
// favorite in settings). Picking a service streams immediately AND saves the
// choice so future taps skip straight to it.
export function StreamServicePickerSheet({
  available,
  heading = "Stream on",
  subtitle,
  onPick,
  onClose,
}: StreamServicePickerSheetProps) {
  const reduceMotion = useReducedMotion();
  return (
    <div
      className="fixed inset-0 flex items-end justify-center"
      style={{ zIndex: 80 }}
      data-testid="sheet-stream-service-picker"
    >
      <motion.div
        className="absolute inset-0 bg-black/60"
        style={{ backdropFilter: "blur(6px)" }}
        onClick={onClose}
        data-testid="overlay-stream-service-picker"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={scrimFade(!!reduceMotion)}
      />
      <motion.div
        className="relative w-full rounded-t-3xl p-5 pb-10"
        style={{
          background: "#0D1B4B",
          zIndex: 81,
          boxShadow: "0 -8px 40px rgba(0,0,0,0.5)",
        }}
        onClick={(e) => e.stopPropagation()}
        initial={{ y: "100%" }}
        animate={{ y: 0, transition: sheetOpen(!!reduceMotion) }}
        exit={{ y: "100%", transition: sheetClose(!!reduceMotion) }}
      >
        <div
          className="w-10 h-1 rounded-full mx-auto mb-5"
          style={{ background: "rgba(255,255,255,0.2)" }}
        />
        <h3 className="text-white font-semibold text-base mb-0.5">{heading}</h3>
        {subtitle && (
          <p className="text-white/40 text-sm mb-5 truncate">{subtitle}</p>
        )}
        {!subtitle && <div className="mb-5" />}

        <div className="space-y-2">
          {STREAMING_SERVICES.map((svc) => {
            const enabled = available.includes(svc.id);
            return (
              <button
                key={svc.id}
                type="button"
                disabled={!enabled}
                onClick={() => enabled && onPick(svc.id)}
                className="w-full flex items-center gap-3 py-3.5 px-4 rounded-2xl text-left transition-all active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
                data-testid={`row-stream-service-${svc.id}`}
              >
                <ServiceGlyphBadge id={svc.id} />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium leading-tight">
                    {svc.label}
                  </p>
                  {!enabled && (
                    <p className="text-white/40 text-xs leading-tight mt-0.5">
                      Not available for this release
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}
