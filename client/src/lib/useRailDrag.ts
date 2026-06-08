import { useCallback, useRef, useState } from "react";

/**
 * Robust drag-to-set rail for the fan player's scrubber + volume sliders.
 *
 * Two input paths, deliberately split by device:
 *
 * 1. Mouse / pen → Pointer Events. On pointerdown we bind move/up/cancel to
 *    `window` for the life of one gesture and read geometry off the rail's
 *    ref. Touch is explicitly ignored on this path (see below).
 *
 * 2. Touch → native `touchstart`/`touchmove`/`touchend`/`touchcancel`,
 *    registered NON-passive directly on the rail node so the move can be
 *    `preventDefault`-ed. We do NOT route touch through Pointer Events because
 *    iPadOS WKWebView (the native iPad app) does not reliably deliver the
 *    window-bound `pointermove`/`pointerup` stream for touch — so the bar was
 *    completely dead there. `setPointerCapture` is worse still: calling it in
 *    `pointerdown` makes WebKit fire an immediate `pointercancel` and stop
 *    delivering events to the captured element. Raw touch events are the one
 *    path WKWebView delivers, and React's synthetic touch listeners are passive
 *    at the root (so `preventDefault` wouldn't take) — hence the manual
 *    non-passive binding via the callback ref.
 *
 * The rail element MUST still carry `touch-action: none` so a finger drag over
 * the thin bar scrubs/sets instead of scrolling the page.
 *
 * - `live: true`  → fires `onChange` continuously while dragging (volume).
 * - `live: false` → fires `onChange` only on release; a plain tap still
 *   commits at the tap position (scrubber, defer-to-release).
 *
 * `previewRatio` (0–1) is the live finger position while `dragging` so the
 * caller can paint the fill/knob ahead of the committed value.
 *
 * `railRef` is a callback ref (not a RefObject) so the non-passive touch
 * listener is attached/detached exactly when the rail mounts/unmounts —
 * important because several rails render conditionally.
 */
export function useRailDrag(
  onChange: (ratio: number) => void,
  { live = false }: { live?: boolean } = {},
) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [previewRatio, setPreviewRatio] = useState(0);

  // Keep the latest onChange / live without re-binding the touch listener.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const liveRef = useRef(live);
  liveRef.current = live;

  // Identifier of the touch currently driving the gesture, so a second finger
  // can't hijack the drag and we only respond to our own touch's move/end.
  const activeTouchId = useRef<number | null>(null);
  // The native touchstart handler currently bound to elRef, for detach.
  const touchStartRef = useRef<((e: TouchEvent) => void) | null>(null);

  const ratioFromX = useCallback((clientX: number) => {
    const el = elRef.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    if (r.width <= 0) return 0;
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width));
  }, []);

  const begin = useCallback(
    (clientX: number) => {
      const startRatio = ratioFromX(clientX);
      setDragging(true);
      setPreviewRatio(startRatio);
      if (liveRef.current) onChangeRef.current(startRatio);
    },
    [ratioFromX],
  );

  // ── Mouse / pen path (Pointer Events) ──────────────────────────────────────
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Touch is handled by the native touch path below; ignore it here so a
      // tap/drag never commits twice on devices that fire both event streams.
      if (e.pointerType === "touch") return;
      // Ignore secondary mouse buttons; allow primary mouse + pen.
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.preventDefault();
      begin(e.clientX);

      const onMove = (ev: PointerEvent) => {
        const r = ratioFromX(ev.clientX);
        setPreviewRatio(r);
        if (liveRef.current) onChangeRef.current(r);
      };
      const onFinish = (ev: PointerEvent) => {
        const r = ratioFromX(ev.clientX);
        setDragging(false);
        if (!liveRef.current) onChangeRef.current(r);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onFinish);
        window.removeEventListener("pointercancel", onFinish);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onFinish);
      window.addEventListener("pointercancel", onFinish);
    },
    [begin, ratioFromX],
  );

  // ── Touch path (native, NON-passive, bound to the rail node) ────────────────
  const railRef = useCallback(
    (node: HTMLDivElement | null) => {
      // Detach the previous node's listener (mount→unmount or node swap).
      if (elRef.current && touchStartRef.current) {
        elRef.current.removeEventListener("touchstart", touchStartRef.current);
        touchStartRef.current = null;
      }
      elRef.current = node;
      if (!node) return;

      const onTouchStart = (e: TouchEvent) => {
        // One gesture at a time — don't let a second finger restart it.
        if (activeTouchId.current !== null) return;
        const t = e.changedTouches[0];
        if (!t) return;
        activeTouchId.current = t.identifier;
        // Stop the page from scrolling / synthesizing a mouse event.
        e.preventDefault();
        begin(t.clientX);

        const trackedTouch = (ev: TouchEvent) =>
          Array.from(ev.changedTouches).find(
            (x) => x.identifier === activeTouchId.current,
          );

        const onMove = (ev: TouchEvent) => {
          const touch = trackedTouch(ev);
          if (!touch) return;
          ev.preventDefault();
          const r = ratioFromX(touch.clientX);
          setPreviewRatio(r);
          if (liveRef.current) onChangeRef.current(r);
        };
        const onFinish = (ev: TouchEvent) => {
          const touch = trackedTouch(ev);
          if (!touch) return;
          const r = ratioFromX(touch.clientX);
          setDragging(false);
          if (!liveRef.current) onChangeRef.current(r);
          activeTouchId.current = null;
          window.removeEventListener("touchmove", onMove);
          window.removeEventListener("touchend", onFinish);
          window.removeEventListener("touchcancel", onFinish);
        };
        window.addEventListener("touchmove", onMove, { passive: false });
        window.addEventListener("touchend", onFinish, { passive: false });
        window.addEventListener("touchcancel", onFinish, { passive: false });
      };

      touchStartRef.current = onTouchStart;
      node.addEventListener("touchstart", onTouchStart, { passive: false });
    },
    [begin, ratioFromX],
  );

  return { railRef, dragging, previewRatio, onPointerDown };
}
