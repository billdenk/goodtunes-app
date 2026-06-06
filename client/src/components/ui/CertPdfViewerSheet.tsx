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
import { fetchBlob, FetchBlobError } from "@/lib/queryClient";
import { SheetClose } from "@/components/ui/SheetChrome";
import { IconButton } from "@/components/ui/IconButton";
import { CertNameConfirmCard } from "@/components/ui/CertNameConfirmCard";

interface CertPdfViewerSheetProps {
  /** Owning order id — drives `GET /api/orders/:orderId/cert/pdf`. */
  orderId: string;
  /** Filename suggested for the saved download. */
  filename?: string;
  onClose: () => void;
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

  const showNameEditor = !loading && !error;

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
        <CertNameConfirmCard
          orderId={orderId}
          variant="bar"
          onSaved={() => loadPdf()}
        />
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
