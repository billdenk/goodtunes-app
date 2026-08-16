---
name: Prod-only missing runtime tool + durable-failure markers
description: Deploy image lacks a CLI the workspace runtime provides for free; renders fail only in prod and durable failure markers never retry.
---

The deploy image only ships what `replit.nix` declares. The dev workspace runtime adds extra tools on PATH (e.g. poppler's `pdftoppm`), so a server feature shelling out to such a tool can work perfectly in dev and fail on every prod request.

**Why:** Template PDF preview rendering failed silently in production because `replit.nix` only had ffmpeg; dev got pdftoppm from the runtime path. Worse, the lazy-backfill pattern persists failures durably (`preview_urls=[]` / `previewUrl=""`) so fixing the tool alone didn't heal anything — the markers suppressed all retries forever.

**How to apply:**
- Any server `execFile`/spawn of a CLI must have that package in `replit.nix` (`installSystemDependencies`), not just work in dev. Verify with the tool name in replit.nix, not "dev works".
- Durable "attempted-and-failed" markers need a bounded retry path (e.g. once per instance lifetime, marker set before the attempt) so prod self-heals after the underlying cause is fixed, without re-download storms on autoscale GETs.
