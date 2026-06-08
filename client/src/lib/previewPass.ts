// Task #1766 — client side of the staged-launch review "preview pass". The
// operator's "See Preview Flow" link lands on the get-host page with the pass
// in the URL fragment (#previewpass=…); main.tsx calls setPreviewPass() before
// React mounts, and queryClient attaches it as the `X-Preview-Pass` header on
// every request so the prepping release resolves in staging mode. AlbumDetail
// reads hasPreviewPass() to show the "Preview mode" banner. The pass NEVER
// allows a real charge — the server's checkout route rejects any request that
// carries it.
//
// Stored in sessionStorage so it survives reloads + in-tab navigation but
// evaporates when the tab closes (a reviewer can't accidentally keep it).
const KEY = "gt:preview-pass";

export function setPreviewPass(token: string): void {
  try {
    sessionStorage.setItem(KEY, token);
  } catch {}
}

export function getPreviewPass(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function hasPreviewPass(): boolean {
  return !!getPreviewPass();
}

export function clearPreviewPass(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {}
}
