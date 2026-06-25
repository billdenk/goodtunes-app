---
name: Admin access-denied guard covers /admin/login too
description: Why a "sign in to admin" CTA from the access-denied screen must exempt the admin auth paths
---

On the admin host a signed-in *fan* resolves `user=null` (host/kind mismatch makes `/api/me` 401), so App.tsx's `showAccessGuard = onAdminShell && !isLoading && !user` is true for **every** `/admin/*` path — including `/admin/login`, `/admin/register`, `/admin/forgot-password`, `/admin/reset-password`.

**Why:** Any recovery action that routes a fan to `/admin/login` (e.g. the access-denied dialog's "Sign in to GoodTunes Admin" button) would just re-render the access-denied dialog over the login form unless those auth paths are explicitly exempted from `showAccessGuard`.

**How to apply:** Keep an `onAdminAuthPath` exemption on `showAccessGuard` (mirrors the per-partner-role guards lower in App.tsx that already allow `/admin/login|logout|register|forgot-password|reset-password`). The access-denied screen lives at `client/src/components/admin/AccessNotAuthorizedDialog.tsx` (under `components/admin/` so design-lint treats it as an admin/slate surface, not a fan navy one).
