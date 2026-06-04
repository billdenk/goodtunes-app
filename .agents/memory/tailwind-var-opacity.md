---
name: Tailwind opacity modifier vs CSS-var brand colors
description: Why `bg-[var(--brand-x)]/NN` silently fails on fan surfaces, and the working patterns for translucent brand fills / glows.
---

On fan (non-admin) surfaces, brand colors must be reached through CSS vars
(`var(--brand-blue|purple|mint|pink)`) — design-lint R1 fails on raw brand hex.
But Tailwind's `/NN` opacity modifier CANNOT compute alpha on an arbitrary CSS
var, so `bg-[var(--brand-mint)]/10`, `ring-[var(--brand-blue)]/40`,
`border-[var(--brand-mint)]/20` all produce NO color (silent, no error).

**Why:** Tailwind only injects alpha when it controls the color literal; a var
is opaque to it at build time.

**How to apply (working patterns):**
- Translucent brand FILL → solid `bg-[var(--brand-x)]` on its own element +
  the element-level `opacity-NN` utility (a soft glow div: absolute,
  `bg-[var(--brand-mint)] opacity-20 blur-2xl`).
- Soft focus/glow RING → arbitrary shadow that takes a var:
  `focus:shadow-[0_0_0_4px_var(--brand-blue-soft)]` (`--brand-blue-soft` is the
  prebaked rgba(.10) var) or a colored drop `boxShadow:
  "0 18px 38px -16px var(--brand-blue)"` via inline `style`.
- Gradient text numerals → `bg-gradient-to-br from-[var(--brand-mint)]
  to-[var(--brand-blue)] bg-clip-text text-transparent`.
- Neutral translucent pills/cards (no brand tint needed) → plain
  `bg-white/[0.06]`, `border-white/[0.08]` are fine and NOT flagged (R12 only
  flags `text-white/NN` and `text-slate-*`).
- `#1D5E8F` (deep petrol blue, used in CTA gradients) is NOT in design-lint's
  BRAND_HEX set, but prefer its var `--primarypetrol-blue-02` anyway.
