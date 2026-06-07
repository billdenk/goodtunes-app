// In-page GoodDeed certificate PDF viewer (Task #1418).
//
// Tapping "Download GoodDeed PDF" used to navigate the browser to the raw
// `/api/orders/:id/cert/pdf` URL. That broke twice: a plain navigation
// can't carry the fan's Bearer token (auth is a header, not a cookie), so
// even signed-in owners hit "Sign in required"; and it replaced the
// current page, killing whatever was playing.
//
// This overlay fetches the PDF as a blob WITH the auth header attached
// (via `fetchBlob`), and offers a Download action — so the player keeps
// running and the page is never replaced. The object URL is created on
// success and revoked on close.
//
// Task #1604 — the old `<iframe src=blob>` rendered the native PDF chrome,
// which on mobile WebKit shows a fixed-width page you can't fit or
// pinch-zoom. We now rasterize the PDF with pdf.js onto a canvas, fit it
// to the viewport width, and add pinch / double-tap zoom + drag-to-pan so
// the certificate is legible on a phone. The blob is still kept for the
// Download button.
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

// pdf.js is loaded LAZILY (dynamic import), and so is its worker URL — the
// `?url` suffix is a Vite-only feature that the node/tsx test runner can't
// resolve at module-eval time. Keeping both imports inside an async helper
// means components that merely import this file (e.g. AlbumDetail under the
// test suite) never trip over them; the worker only resolves in the browser
// when a fan actually opens a certificate.
let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;
function getPdfjs(): Promise<typeof import("pdfjs-dist")> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const lib = await import("pdfjs-dist");
      const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
      lib.GlobalWorkerOptions.workerSrc = workerUrl;
      return lib;
    })();
  }
  return pdfjsPromise;
}

interface CertPdfViewerSheetProps {
  /** Owning order id — drives `GET /api/orders/:orderId/cert/pdf`. */
  orderId: string;
  /** Filename suggested for the saved download. */
  filename?: string;
  onClose: () => void;
}

const MIN_SCALE = 1;
const MAX_SCALE = 4;

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

export function CertPdfViewerSheet({
  orderId,
  filename = "GoodDeed-Certificate.pdf",
  onClose,
}: CertPdfViewerSheetProps) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const objectUrlRef = useRef<string | null>(null);
  const [downloadReady, setDownloadReady] = useState(false);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const docRef = useRef<any>(null);
  const renderTaskRef = useRef<any>(null);

  // Zoom/pan transform state lives in a ref (gesture math runs every
  // pointer move) and is applied imperatively to the stage element.
  const transformRef = useRef({ scale: 1, tx: 0, ty: 0 });
  const applyTransform = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const { scale, tx, ty } = transformRef.current;
    stage.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  }, []);

  // Clamp the pan so the (scaled) page can't be dragged completely off
  // screen. Centered when it fits; otherwise bounded to its edges.
  const clampPan = useCallback(() => {
    const vp = viewportRef.current;
    const stage = stageRef.current;
    if (!vp || !stage) return;
    const t = transformRef.current;
    const baseW = stage.offsetWidth;
    const baseH = stage.offsetHeight;
    const scaledW = baseW * t.scale;
    const scaledH = baseH * t.scale;
    const vw = vp.clientWidth;
    const vh = vp.clientHeight;
    const maxX = Math.max(0, (scaledW - vw) / 2);
    const maxY = Math.max(0, (scaledH - vh) / 2);
    t.tx = clamp(t.tx, -maxX, maxX);
    t.ty = clamp(t.ty, -maxY, maxY);
  }, []);

  // ── Render the (single-page) certificate to the canvas, fit to width ──
  const renderPage = useCallback(async () => {
    const doc = docRef.current;
    const canvas = canvasRef.current;
    const vp = viewportRef.current;
    if (!doc || !canvas || !vp) return;
    const page = await doc.getPage(1);
    const unscaled = page.getViewport({ scale: 1 });
    const cssWidth = vp.clientWidth;
    const fitScale = cssWidth / unscaled.width;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const viewport = page.getViewport({ scale: fitScale * dpr });
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    // CSS size = fit-to-width; the canvas backing store is DPR-crisp.
    canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
    canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (renderTaskRef.current) {
      try {
        renderTaskRef.current.cancel();
      } catch {
        /* ignore */
      }
    }
    const task = page.render({ canvasContext: ctx, viewport });
    renderTaskRef.current = task;
    try {
      await task.promise;
    } catch {
      /* cancelled re-render — ignore */
    }
  }, []);

  const loadPdf = useCallback(
    async (signal?: { cancelled: boolean }) => {
      setLoading(true);
      setError(null);
      try {
        const blob = await fetchBlob(`/api/orders/${orderId}/cert/pdf`);
        if (signal?.cancelled) return;
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = URL.createObjectURL(blob);
        setDownloadReady(true);
        const buf = await blob.arrayBuffer();
        if (signal?.cancelled) return;
        if (docRef.current) {
          try {
            await docRef.current.destroy();
          } catch {
            /* ignore */
          }
        }
        const pdfjsLib = await getPdfjs();
        const doc = await pdfjsLib.getDocument({ data: buf }).promise;
        if (signal?.cancelled) {
          try {
            await doc.destroy();
          } catch {
            /* ignore */
          }
          return;
        }
        docRef.current = doc;
        // Reset zoom for the freshly-loaded doc.
        transformRef.current = { scale: 1, tx: 0, ty: 0 };
        applyTransform();
        setLoading(false);
        // Render after the loading state clears so the viewport has size.
        requestAnimationFrame(() => {
          if (!signal?.cancelled) renderPage();
        });
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
        setLoading(false);
      }
    },
    [orderId, applyTransform, renderPage],
  );

  useEffect(() => {
    const signal = { cancelled: false };
    loadPdf(signal);
    return () => {
      signal.cancelled = true;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          /* ignore */
        }
      }
      if (docRef.current) {
        try {
          docRef.current.destroy();
        } catch {
          /* ignore */
        }
        docRef.current = null;
      }
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [orderId, loadPdf]);

  // Re-render at the new fit width on viewport resize / rotation.
  useEffect(() => {
    const onResize = () => {
      transformRef.current = { scale: 1, tx: 0, ty: 0 };
      applyTransform();
      renderPage();
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, [applyTransform, renderPage]);

  // Escape closes the viewer (mirrors the X / scrim dismiss on desktop).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // ── Pinch / double-tap zoom + drag-to-pan ─────────────────────────────
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ dist: number; scale: number } | null>(null);
  const lastTapRef = useRef(0);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 2) {
      const pts = [...pointersRef.current.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      pinchRef.current = { dist, scale: transformRef.current.scale };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const pts = pointersRef.current;
    if (!pts.has(e.pointerId)) return;
    const prev = pts.get(e.pointerId)!;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pts.size === 2 && pinchRef.current) {
      const [a, b] = [...pts.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const next = clamp(
        (pinchRef.current.scale * dist) / pinchRef.current.dist,
        MIN_SCALE,
        MAX_SCALE,
      );
      transformRef.current.scale = next;
      clampPan();
      applyTransform();
    } else if (pts.size === 1 && transformRef.current.scale > 1) {
      transformRef.current.tx += e.clientX - prev.x;
      transformRef.current.ty += e.clientY - prev.y;
      clampPan();
      applyTransform();
    }
  };

  const endPointer = (e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
  };

  const onPointerUp = (e: React.PointerEvent) => {
    // Double-tap toggles fit ↔ 2.5× (only count single-finger taps).
    if (pointersRef.current.size === 1) {
      const now = Date.now();
      if (now - lastTapRef.current < 300) {
        const t = transformRef.current;
        if (t.scale > 1) {
          transformRef.current = { scale: 1, tx: 0, ty: 0 };
        } else {
          transformRef.current.scale = 2.5;
          clampPan();
        }
        applyTransform();
        lastTapRef.current = 0;
      } else {
        lastTapRef.current = now;
      }
    }
    endPointer(e);
  };

  const handleDownload = () => {
    if (!objectUrlRef.current) return;
    const a = document.createElement("a");
    a.href = objectUrlRef.current;
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
          {downloadReady && (
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

      <div
        ref={viewportRef}
        className="relative flex-1 overflow-hidden select-none"
        style={{ touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={endPointer}
      >
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
        <div
          className="absolute inset-0 flex items-start justify-center"
          style={{ visibility: loading || error ? "hidden" : "visible" }}
        >
          <div
            ref={stageRef}
            style={{ transformOrigin: "center center", willChange: "transform" }}
            data-testid="stage-cert-pdf"
          >
            <canvas
              ref={canvasRef}
              className="block bg-white shadow-lg"
              data-testid="canvas-cert-pdf"
            />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
