// Translate percentage for a horizontally-swiped photo carousel (the gear
// PhotoLightbox). The slide track is `count * 100%` wide — each slide fills one
// viewport — and we slide it with CSS `translateX(%)`. The catch: a percentage
// translate is relative to the TRANSLATED element's own width, not its
// container. So to advance one slide the track must move `100 / count` percent
// of itself, not a flat 100%.
//
// The old code used the viewport-relative offset (`-(index * 100)`) directly,
// which shifted the `count`×-wide track `count`× too far and parked every slide
// after the first off-screen — a blank frame. This only ever bit gear with 2+
// photos (the common single-photo case has a 100%-wide track where the two
// frames of reference coincide), which is why it stayed hidden until an
// instrument carried a second gallery shot.
//
//   viewportRelative = -(index * 100) + drag-as-percent-of-viewport
//   trackRelative    = viewportRelative / count
export function lightboxTranslatePct(
  index: number,
  dragX: number,
  viewportWidth: number,
  count: number,
): number {
  if (count <= 0) return 0;
  const width = viewportWidth || 1;
  const viewportRelative = -(index * 100) + (dragX / width) * 100;
  return viewportRelative / count;
}
