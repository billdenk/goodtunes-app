import { useCallback, useRef, useState } from "react";

/**
 * Robust drag-to-set rail for the fan player's scrubber + volume sliders.
 *
 * Why not `setPointerCapture`: on iOS/iPadOS WKWebView, calling
 * `setPointerCapture()` inside a `pointerdown` handler makes Safari fire an
 * immediate `pointercancel` and stop delivering `pointermove`/`pointerup` to
 * the captured element — so the bar could be neither tapped nor dragged on an
 * iPad. Instead we bind move/up/cancel to `window` for the life of one gesture
 * and read geometry off the rail's ref. That delivers every move plus the
 * release on both touch and mouse, with no capture quirk.
 *
 * The rail element MUST carry `touch-action: none` so a finger drag over the
 * thin bar scrubs/sets instead of scrolling the page.
 *
 * - `live: true`  → fires `onChange` continuously while dragging (volume).
 * - `live: false` → fires `onChange` only on release; a plain tap still
 *   commits at the tap position (scrubber, defer-to-release).
 *
 * `previewRatio` (0–1) is the live finger position while `dragging` so the
 * caller can paint the fill/knob ahead of the committed value.
 */
export function useRailDrag(
  onChange: (ratio: number) => void,
  { live = false }: { live?: boolean } = {},
) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [previewRatio, setPreviewRatio] = useState(0);

  const ratioFromX = useCallback((clientX: number) => {
    const el = railRef.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    if (r.width <= 0) return 0;
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width));
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Ignore secondary mouse buttons; allow primary mouse + any touch/pen.
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.preventDefault();
      const startRatio = ratioFromX(e.clientX);
      setDragging(true);
      setPreviewRatio(startRatio);
      if (live) onChange(startRatio);

      const onMove = (ev: PointerEvent) => {
        const r = ratioFromX(ev.clientX);
        setPreviewRatio(r);
        if (live) onChange(r);
      };
      const onFinish = (ev: PointerEvent) => {
        const r = ratioFromX(ev.clientX);
        setDragging(false);
        if (!live) onChange(r);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onFinish);
        window.removeEventListener("pointercancel", onFinish);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onFinish);
      window.addEventListener("pointercancel", onFinish);
    },
    [live, onChange, ratioFromX],
  );

  return { railRef, dragging, previewRatio, onPointerDown };
}
