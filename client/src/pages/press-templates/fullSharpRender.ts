// ── Full-Template sharp-render controller (Task #3212) ──────────────────────
// The Full Template view starts from a fixed 1400px base raster; at 200–400%
// zoom (× Retina devicePixelRatio) a pure CSS scale of it goes blurry, so the
// viewers lazily re-render the full page at a zoom-sized resolution. Those
// renders are async and slow — this controller owns the invalidation rules so
// a stale render can NEVER land over a newer state:
//
//  • every render attempt takes a token via begin(); the token goes stale the
//    moment ANY newer begin() or invalidate() happens (zoom change, zoom-out,
//    view switch, template swap — the effects call begin() on every run);
//  • invalidate() also clears the per-template cache (a replaced template
//    must never serve a prior template's raster, at any zoom tier).
//
// Pure and DOM-free so the regression rules are testable under plain node
// (delayed render completing across a template swap / zoom-out must be
// rejected — completion-review scenario, Task #3212).

export type FullSharpToken = { isCurrent(): boolean };

export type FullSharpController = {
  /** Start a render attempt (or any state change) — stales all prior tokens. */
  begin(): FullSharpToken;
  /** Template/document changed: stale all tokens AND drop every cached tier. */
  invalidate(): void;
  /** Cached sharp renders, keyed per zoom tier within ONE template. */
  cache: Map<string, string>;
};

export function createFullSharpController(): FullSharpController {
  let seq = 0;
  const cache = new Map<string, string>();
  return {
    cache,
    begin() {
      const s = ++seq;
      return { isCurrent: () => s === seq };
    },
    invalidate() {
      seq++;
      cache.clear();
    },
  };
}
