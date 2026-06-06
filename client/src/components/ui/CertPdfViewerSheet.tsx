// In-page GoodDeed certificate PDF viewer (Task #1418).
//
// Tapping "Download GoodDeed PDF" used to navigate the browser to the raw
// `/api/orders/:id/cert/pdf` URL. That broke twice: a plain navigation
// can't carry the fan's Bearer token (auth is a header, not a cookie), so
// even signed-in owners hit "Sign in required"; and it replaced the
// current page, killing whatever was playing.
//
// This overlay fetches the PDF as a blob WITH the auth header attached
// (via `fetchBlob`), shows it inline over the current page, and offers a
// Download action — so the player keeps running and the page is never
// replaced. The object URL is created on success and revoked on close.
//
// Task #1467 — digital-only owners (no physical signed-cert add-on, so no
// `signed_cert_certificates` row) get an inline "name on certificate"
// editor here. The server synthesizes the recipient name from the fan's
// realName → displayName → username; imported gogoods fans in particular
// may want to override it. Editing persists to a lightweight per-order
// field and re-renders the PDF. The physical signed-cert confirm flow is
// untouched — `editable` comes back false for those certs.
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { apiRequest, fetchBlob, FetchBlobError } from "@/lib/queryClient";
import { SheetClose } from "@/components/ui/SheetChrome";
import { IconButton } from "@/components/ui/IconButton";

interface CertPdfViewerSheetProps {
  /** Owning order id — drives `GET /api/orders/:orderId/cert/pdf`. */
  orderId: string;
  /** Filename suggested for the saved download. */
  filename?: string;
  onClose: () => void;
}

interface DigitalNameInfo {
  editable: boolean;
  confirmed: boolean;
  currentName: string;
  defaultName: string;
}

export function CertPdfViewerSheet({
  orderId,
  filename = "GoodDeed-Certificate.pdf",
  onClose,
}: CertPdfViewerSheetProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const urlRef = useRef<string | null>(null);

  // Task #1467 — digital cert name editing.
  const [nameInfo, setNameInfo] = useState<DigitalNameInfo | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadPdf = useCallback(async (signal?: { cancelled: boolean }) => {
    setLoading(true);
    setError(null);
    try {
      const blob = await fetchBlob(`/api/orders/${orderId}/cert/pdf`);
      if (signal?.cancelled) return;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      setObjectUrl(url);
    } catch (e: unknown) {
      if (signal?.cancelled) return;
      if (e instanceof FetchBlobError && (e.status === 401 || e.status === 403)) {
        setError(
          "We couldn't open this certificate. Make sure you're signed in to the account that owns this GoodDeed, then try again.",
        );
      } else if (e instanceof FetchBlobError && e.status === 404) {
        setError("This certificate isn't available yet. It appears once your order is finalized.");
      } else {
        setError("Something went wrong loading your certificate. Please try again in a moment.");
      }
    } finally {
      if (!signal?.cancelled) setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    const signal = { cancelled: false };
    loadPdf(signal);
    // Best-effort: fetch whether this digital cert's name is editable.
    // Physical signed-cert orders come back { editable: false } and we
    // simply never show the editor.
    apiRequest("GET", `/api/orders/${orderId}/cert/digital-name`)
      .then((r) => r.json())
      .then((info: DigitalNameInfo) => {
        if (signal.cancelled) return;
        setNameInfo(info);
        setDraft(info.currentName ?? "");
      })
      .catch(() => {
        /* non-fatal — the PDF still renders without the editor */
      });
    return () => {
      signal.cancelled = true;
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };
  }, [orderId, loadPdf]);

  // Escape closes the viewer (mirrors the X / scrim dismiss on desktop).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleDownload = () => {
    if (!objectUrl) return;
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleSaveName = async () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      setSaveError("A name is required.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const r = await apiRequest("POST", `/api/orders/${orderId}/cert/digital-name`, {
        name: trimmed,
      });
      const data = await r.json();
      const saved = (data?.confirmedName as string) ?? trimmed;
      setNameInfo((prev) =>
        prev ? { ...prev, currentName: saved, confirmed: true } : prev,
      );
      setDraft(saved);
      setEditing(false);
      // Re-render the PDF with the confirmed name.
      await loadPdf();
    } catch (e: unknown) {
      let msg = "Couldn't save that name. Please try again.";
      try {
        if (e && typeof e === "object" && "message" in e) {
          const parsed = String((e as { message?: string }).message ?? "");
          // apiRequest throws "<status>: <json>"; pull the message field.
          const jsonStart = parsed.indexOf("{");
          if (jsonStart >= 0) {
            const body = JSON.parse(parsed.slice(jsonStart));
            if (body?.message) msg = body.message;
          } else if (parsed) {
            msg = parsed;
          }
        }
      } catch {
        /* keep default */
      }
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
  };

  const showNameEditor = !!nameInfo?.editable && !loading && !error;

  return createPortal(
    <div
      className="fixed inset-0 z-[120] bg-[var(--brand-bg)] flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="GoodDeed certificate"
      data-testid="overlay-cert-pdf"
    >
      <div
        className="flex items-center justify-between gap-2 px-4 pb-3"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
      >
        <span className="text-white text-base font-semibold" data-testid="text-cert-pdf-title">
          GoodDeed® Certificate
        </span>
        <div className="flex items-center gap-2">
          {objectUrl && (
            <IconButton
              variant="glass"
              size="lg"
              label="Download certificate PDF"
              onClick={handleDownload}
              data-testid="button-download-cert-pdf"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 3v12" />
                <path d="M7 10l5 5 5-5" />
                <path d="M5 21h14" />
              </svg>
            </IconButton>
          )}
          <SheetClose onClick={onClose} data-testid="button-close-cert-pdf" />
        </div>
      </div>

      {showNameEditor && (
        <div className="px-4 pb-3" data-testid="cert-name-editor">
          {!editing ? (
            <div className="flex items-center gap-3 rounded-xl bg-white/5 border border-white/10 px-3 py-2.5">
              <div className="flex-1 min-w-0">
                <div className="text-xs uppercase tracking-wider text-fan-secondary">
                  Name on certificate
                </div>
                <div
                  className="text-sm font-medium text-white truncate"
                  data-testid="text-cert-name"
                >
                  {nameInfo?.currentName}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDraft(nameInfo?.currentName ?? "");
                  setSaveError(null);
                  setEditing(true);
                }}
                className="flex-shrink-0 text-sm font-semibold active:opacity-70"
                style={{ color: "var(--brand-mint)" }}
                data-testid="button-edit-cert-name"
              >
                Edit
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2 rounded-xl bg-white/5 border border-white/10 px-3 py-3">
              <label
                htmlFor="cert-name-input"
                className="text-xs uppercase tracking-wider text-fan-secondary"
              >
                Name on certificate
              </label>
              <input
                id="cert-name-input"
                type="text"
                value={draft}
                maxLength={80}
                autoFocus
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !saving) handleSaveName();
                }}
                placeholder="e.g. Jane Doe"
                className="bg-white/10 text-white text-base rounded-lg px-3 py-2 outline-none focus:bg-white/15"
                data-testid="input-cert-name"
              />
              {saveError && (
                <div className="text-xs" style={{ color: "var(--brand-pink)" }} data-testid="text-cert-name-error">
                  {saveError}
                </div>
              )}
              <div className="flex items-center gap-2 mt-0.5">
                <button
                  type="button"
                  onClick={handleSaveName}
                  disabled={saving || !draft.trim()}
                  className="px-3 py-1.5 rounded-full bg-[var(--brand-mint)] text-[var(--brand-bg)] text-sm font-semibold disabled:opacity-50 active:opacity-80"
                  data-testid="button-save-cert-name"
                >
                  {saving ? "Saving…" : "Save name"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setSaveError(null);
                    setDraft(nameInfo?.currentName ?? "");
                  }}
                  disabled={saving}
                  className="text-sm text-fan-secondary active:opacity-70 disabled:opacity-50"
                  data-testid="button-cancel-cert-name"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="relative flex-1 overflow-hidden">
        {loading && (
          <div
            className="absolute inset-0 flex items-center justify-center text-fan-secondary text-sm"
            data-testid="status-cert-pdf-loading"
          >
            Loading certificate…
          </div>
        )}
        {!loading && error && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center"
            data-testid="status-cert-pdf-error"
          >
            <p className="text-white text-sm leading-relaxed max-w-xs">{error}</p>
          </div>
        )}
        {!loading && !error && objectUrl && (
          <iframe
            src={objectUrl}
            title="GoodDeed certificate"
            className="w-full h-full border-0 bg-white"
            data-testid="iframe-cert-pdf"
          />
        )}
      </div>
    </div>,
    document.body,
  );
}
