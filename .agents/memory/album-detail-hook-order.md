---
name: AlbumDetail mobile hook-order (React #310)
description: AlbumDetailMobile crashes with React #310 when a hook is placed after its loading/not-found guards
---

# AlbumDetail mobile hook order

`client/src/pages/AlbumDetail.tsx` holds two big sibling components — `AlbumDetailMobile` and (in `AlbumDetailDesktop.tsx`) `AlbumDetailDesktop` — each with ~30+ hooks. Both end with loading/not-found early-return guards:
- mobile: `if (!album && isAlbumLoading) return <AlbumDetailMobileSkeleton/>` then `if (!album) return <AlbumNotFound variant="mobile"/>`
- desktop: the equivalent guards sit AFTER all hooks (correct).

**Rule:** EVERY hook in these components must be declared above those guards. The first render is always `album` undefined + loading → the skeleton path runs fewer hooks; once data loads the full body renders more hooks → React minified error **#310 "rendered more hooks than during the previous render"**, which crashes the whole fan app (propagates past the error boundary).

**Why:** A `useEffect` (the "force Buy sheet closed during a Sales-Begin locked preview" effect) had drifted below the guards, so it only ran on the loaded render. Production `my.goodtunes.music` crashed reliably on every album open.

**How to apply:** When adding/moving a hook in either component, keep it above the `if (!album ...) return` guards. If the hook needs values computed lower down (e.g. `salesPending`), inline the computation inside the hook from raw inputs (`isOwned`, `apiAlbum?.goodTunesReleaseDate`, state) rather than referencing a const defined after the guard.

**Debugging minified prod React errors here:** the deployed bundle has no usable source map (the served `.js.map` is a ~16KB stub), but it keeps `a(fn,"DisplayName")` registrations — `curl` the bundle, `sed -n '<line>p' | cut -c<col>` the offsets from the stack, and `grep -o 'a(<minName>,"[^"]*")'` to map minified names (rKe=AlbumDetailMobile, eKe=AlbumDetailDesktop, iq=AlbumDetail$1, vBe=FanPreviewProvider).
