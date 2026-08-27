---
name: Mock scroll offsets vs portal scroller
description: Sticky tops / scrollMarginTop authored against a window-scrolling mock are 56px too large inside portal/admin inner scrollers; and scrollIntoView silently ignores margins when the scroller bottom-clamps.
---

**Rule:** Handoff-mock scroll geometry (sticky `top`, `scrollMarginTop`) is usually authored against WINDOW scrolling where the 56px app header is inside the viewport. The operator/partner shells (OperatorShell, AdminFrame) scroll an INNER container that starts *below* the header, so pasting mock values verbatim rests all content 56px lower relative to any in-page sticky strip — controls end up sliced behind it. Subtract the header height (56) from every mock offset when the surface mounts in a portal scroller.

**Also:** `scrollIntoView` + `scroll-margin-top` is silently ignored when the scroller bottom-clamps (scrollTop == scrollMax) — the last section can't reach its rest position and whatever sits above it straddles the sticky strip. Fix by adding end-of-page padding so every margin can be honored; raising the margin does nothing at a clamp.

**How to apply:** Any Apple-buy-flow style page with a sticky summary strip inside a portal (press estimate/package builders, future artist configurators). Audit empirically with headless chromium (playwright-browsers chromium at /nix/store/*playwright-browsers-chromium/chromium-*/chrome-linux/chrome works with puppeteer-core; the ungoogled-chromium 98 store paths fail to launch) checking for elements straddling the strip's bottom edge after each auto-scroll settles.
