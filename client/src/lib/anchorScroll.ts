// Keep an in-place UI change (collapsing a row, switching a tab) from
// jumping the page. When a state change swaps in a panel of a different
// height — or the incoming panel autofocuses an input / runs a deep-link
// scroll on mount — the content under the cursor reflows and the viewport
// lurches. We anchor on the element the user actually clicked: capture its
// viewport offset before the state change, then after the DOM has
// re-laid-out restore the window scroll so that element sits at exactly the
// same screen position.
//
// The restore runs across two frames on purpose: the first
// requestAnimationFrame fixes the reflow from the height swap; the second
// catches a focus-driven scroll (autofocus / ref.focus() in an effect) that
// can fire a frame later, after the first restore has already run. For
// callers whose panel doesn't steal focus the second pass computes a ~0
// delta and is a harmless no-op.
//
// Originated as the package-collapse anchor in SellPanel (Task #700); lifted
// here so the album tab bar (Task #709) can reuse the exact same behaviour.
export function anchorScrollToElement(
  el: HTMLElement | null | undefined,
  apply: () => void,
) {
  if (!el) {
    apply();
    return;
  }
  const before = el.getBoundingClientRect().top;
  apply();
  const restore = () => {
    const after = el.getBoundingClientRect().top;
    const delta = after - before;
    if (delta) window.scrollBy(0, delta);
  };
  requestAnimationFrame(() => {
    restore();
    requestAnimationFrame(restore);
  });
}
