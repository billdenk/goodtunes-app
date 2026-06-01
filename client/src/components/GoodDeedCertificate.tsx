import { useState, useRef, useEffect, forwardRef, useMemo, type Ref } from "react";
import { Album } from "@/data/musicData";
import { useAuth } from "@/hooks/useAuth";

export interface ShareIdentities {
  realName?: string | null;
  displayName: string;
  username: string;
}

interface GoodDeedCertificateProps {
  album: Album;
  ownerName: string;
  identities?: ShareIdentities;
  certificateNumber?: number;
  certificateNumbers?: number[];
  onClose: () => void;
}

type IdentityKind = "display" | "username" | "real";
type CardShape = "square" | "portrait" | "story";

export function GoodDeedCertificate({
  album,
  ownerName,
  identities,
  certificateNumber,
  certificateNumbers,
  onClose,
}: GoodDeedCertificateProps) {
  const certs =
    certificateNumbers && certificateNumbers.length > 0
      ? certificateNumbers
      : [certificateNumber ?? 1];
  const [shared, setShared] = useState(false);
  const [savingImage, setSavingImage] = useState(false);
  const [imageSaved, setImageSaved] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [shape, setShape] = useState<CardShape>("story");
  const [stageW, setStageW] = useState(320);
  const [vh, setVh] = useState(720);
  const [identity, setIdentity] = useState<IdentityKind>("display");
  const [showIdentityMenu, setShowIdentityMenu] = useState(false);
  const [addRealOpen, setAddRealOpen] = useState(false);
  const [realDraft, setRealDraft] = useState("");
  const [savingReal, setSavingReal] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const captureRef = useRef<HTMLDivElement | null>(null);

  const { user, updateProfile } = useAuth();

  const safeIdx = Math.min(Math.max(activeIdx, 0), certs.length - 1);
  // Track the active card without retriggering the resize-resync effect so a
  // manual swipe (which updates activeIdx) doesn't fight the user with a snap.
  const activeIdxRef = useRef(0);
  activeIdxRef.current = safeIdx;

  const resolvedIdentities: ShareIdentities = useMemo(
    () =>
      identities ?? {
        realName: null,
        displayName: ownerName,
        username: ownerName.toLowerCase().replace(/[^a-z0-9_]/g, "") || "you",
      },
    [identities, ownerName],
  );

  const displayedName = useMemo(() => {
    if (identity === "real" && resolvedIdentities.realName) return resolvedIdentities.realName;
    if (identity === "username") return `@${resolvedIdentities.username}`;
    return resolvedIdentities.displayName;
  }, [identity, resolvedIdentities]);

  const identityLabel = useMemo(() => {
    if (identity === "real" && resolvedIdentities.realName) return "Real Name";
    if (identity === "username") return "@username";
    return "Display Name";
  }, [identity, resolvedIdentities.realName]);

  const handleScroll = () => {
    const el = scrollerRef.current;
    if (!el || cardRefs.current.length === 0) return;
    const center = el.scrollLeft + el.clientWidth / 2;
    let nearest = 0;
    let nearestDist = Infinity;
    cardRefs.current.forEach((card, i) => {
      if (!card) return;
      const cardCenter = card.offsetLeft + card.offsetWidth / 2;
      const dist = Math.abs(cardCenter - center);
      if (dist < nearestDist) {
        nearest = i;
        nearestDist = dist;
      }
    });
    if (nearest !== activeIdx) setActiveIdx(nearest);
  };

  const goTo = (i: number) => {
    const el = scrollerRef.current;
    const card = cardRefs.current[i];
    if (!el || !card) return;
    const target = card.offsetLeft - (el.clientWidth - card.offsetWidth) / 2;
    el.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Measure the available preview width + viewport height so the on-screen card
  // scales responsively. Capture always happens off-screen at w=1080.
  useEffect(() => {
    const measure = () => {
      const el = scrollerRef.current;
      const avail = el ? el.clientWidth : window.innerWidth;
      setStageW(Math.max(220, Math.min(avail - 24, 360)));
      setVh(window.innerHeight);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const padded = (n: number) => n.toString().padStart(2, "0");

  // On-screen preview width: square fills the stage; the taller portrait (4:5)
  // and story (9:16) cards are capped so they fit the viewport height.
  const previewRatio = shape === "story" ? 16 / 9 : shape === "portrait" ? 5 / 4 : 1;
  const previewW =
    shape === "square"
      ? stageW
      : Math.max(180, Math.min(stageW, Math.round((vh - 300) / previewRatio)));

  // When the card size changes (Story/Portrait/Square switch or a viewport
  // resize re-derives previewW), snap-mandatory can strand the scroll position
  // between two now-resized snap targets, leaving a card half-cut and frozen on
  // iOS. Re-center the active card after the new layout paints so every card
  // stays reachable. Read the index from a ref so a manual swipe doesn't
  // retrigger this and fight the user.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const id = requestAnimationFrame(() => {
      const card = cardRefs.current[activeIdxRef.current];
      if (!card) return;
      const target = card.offsetLeft - (el.clientWidth - card.offsetWidth) / 2;
      el.scrollTo({ left: Math.max(0, target), behavior: "auto" });
    });
    return () => cancelAnimationFrame(id);
  }, [shape, previewW]);

  const handleShare = async () => {
    const n = padded(certs[safeIdx]);
    const params = new URLSearchParams({
      album: album.title,
      artist: album.artist,
      owner: displayedName,
      num: n,
      art: album.artwork,
      albumId: album.id,
    });
    const url = `${window.location.origin}/share/cert?${params.toString()}`;
    const text = `${displayedName} owns No. ${n} of "${album.title}" by ${album.artist} — verified by GoodTunes® GoodDeed®`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "My GoodDeed® Certificate", text, url });
      } else {
        await navigator.clipboard.writeText(`${text}\n${url}`);
      }
      setShared(true);
      setTimeout(() => setShared(false), 1800);
    } catch {}
  };

  const handleSaveImage = async () => {
    if (savingImage) return;
    const node = captureRef.current;
    if (!node) return;
    setSavingImage(true);
    try {
      const { toPng } = await import("html-to-image");
      // Make sure every image on the card is fully decoded before we snapshot,
      // otherwise the first capture can come back with blanks.
      const imgs = Array.from(node.querySelectorAll("img"));
      await Promise.all(
        imgs.map((img) =>
          img.complete && img.naturalWidth > 0
            ? Promise.resolve()
            : img.decode().catch(() => undefined),
        ),
      );
      // Node is already authored at full 1080-scale, so pixelRatio 1 yields an
      // exactly-sized PNG (1080×1080 square / 1080×1350 portrait / 1080×1920 story).
      const dataUrl = await toPng(node, {
        pixelRatio: 1,
        cacheBust: true,
      });
      const blob = await (await fetch(dataUrl)).blob();
      const safeTitle = album.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "album";
      const fileName = `GoodDeed-${safeTitle}-No-${padded(certs[safeIdx])}-${shape}.png`;
      const file = new File([blob], fileName, { type: "image/png" });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "My GoodDeed® Certificate" });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
      setImageSaved(true);
      setTimeout(() => setImageSaved(false), 1800);
    } catch {
      // User cancelled the share sheet, or capture failed — leave the card as-is.
    } finally {
      setSavingImage(false);
    }
  };

  const pickIdentity = (kind: IdentityKind) => {
    if (kind === "real" && !resolvedIdentities.realName) {
      setAddRealOpen(true);
      setRealDraft("");
      return;
    }
    setIdentity(kind);
    setShowIdentityMenu(false);
  };

  const saveRealName = async () => {
    const v = realDraft.trim();
    if (!v) return;
    setSavingReal(true);
    try {
      await updateProfile({ realName: v });
      setIdentity("real");
      setAddRealOpen(false);
      setShowIdentityMenu(false);
    } catch {} finally {
      setSavingReal(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="GoodDeed certificate"
    >
      <div
        className="absolute inset-0 bg-black/75"
        style={{ backdropFilter: "blur(8px)" }}
        onClick={onClose}
      />

      {/* Framed backdrop — for the Square + Portrait previews (which don't fill
          the screen) the surround is a soft, blurred wash of the album art over
          navy instead of flat black, so the card reads as framed. Uses a plain
          `filter: blur` on an <img> (not a second backdrop-filter) to avoid the
          iOS-WebKit stacked-blur crash. Story is full-bleed, so it's skipped. */}
      {shape !== "story" && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
          <img
            src={album.artwork}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            style={{ filter: "blur(48px)", transform: "scale(1.25)", opacity: 0.45 }}
          />
          <div className="absolute inset-0" style={{ background: "rgba(0,6,43,0.55)" }} />
        </div>
      )}

      <div className="relative w-full z-10 animate-slide-up">
        {/* Top controls: close + identity + share */}
        <div className="flex items-center justify-between mb-5 px-5 gap-2">
          <button
            type="button"
            onClick={onClose}
            aria-label={certs.length === 1 ? "Back" : "Close certificate"}
            className="w-11 h-11 rounded-full flex items-center justify-center active:opacity-70 shadow-lg flex-shrink-0"
            style={{ background: "#ffffff", color: "#00062B" }}
            data-testid="button-close-certificate"
          >
            {certs.length === 1 ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            )}
          </button>

          <div className="flex items-center gap-2">
            {/* Identity dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowIdentityMenu((s) => !s)}
                aria-haspopup="menu"
                aria-expanded={showIdentityMenu}
                className="h-11 px-3.5 rounded-full flex items-center gap-1.5 text-xs font-semibold active:opacity-70 transition-opacity shadow-lg"
                style={{ background: "rgba(255,255,255,0.18)", color: "#fff", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.22)" }}
                data-testid="button-identity-toggle"
              >
                <span className="opacity-70">As:</span>
                <span>{identityLabel}</span>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              {showIdentityMenu && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => { setShowIdentityMenu(false); setAddRealOpen(false); }} />
                  <div
                    role="menu"
                    className="absolute right-0 top-full mt-2 z-40 rounded-2xl py-1 min-w-[230px] overflow-hidden"
                    style={{
                      background: "rgba(28, 30, 38, 0.96)",
                      backdropFilter: "blur(28px) saturate(180%)",
                      WebkitBackdropFilter: "blur(28px) saturate(180%)",
                      boxShadow: "0 16px 40px rgba(0,0,0,0.6)",
                      border: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    <IdentityRow
                      label="Display Name"
                      value={resolvedIdentities.displayName}
                      selected={identity === "display"}
                      onClick={() => pickIdentity("display")}
                      testId="identity-display"
                    />
                    <div className="h-px bg-white/8" />
                    <IdentityRow
                      label="Username"
                      value={`@${resolvedIdentities.username}`}
                      selected={identity === "username"}
                      onClick={() => pickIdentity("username")}
                      testId="identity-username"
                    />
                    <div className="h-px bg-white/8" />
                    {addRealOpen ? (
                      <div className="px-3.5 py-3">
                        <p className="text-white/55 text-[11px] font-semibold uppercase tracking-wider mb-2">Add Real Name</p>
                        <input
                          type="text"
                          value={realDraft}
                          onChange={(e) => setRealDraft(e.target.value)}
                          placeholder="Nigel Tufnel"
                          autoFocus
                          className="w-full border border-white/15 rounded-xl px-3 py-2 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#319ED8]"
                          style={{ background: "rgba(255,255,255,0.06)" }}
                          onKeyDown={(e) => { if (e.key === "Enter") saveRealName(); }}
                          data-testid="input-real-name-inline"
                        />
                        <div className="flex gap-2 mt-2.5">
                          <button
                            type="button"
                            onClick={() => setAddRealOpen(false)}
                            className="flex-1 py-2 rounded-xl text-[12px] font-semibold text-white/70 active:opacity-70"
                            style={{ background: "rgba(255,255,255,0.08)" }}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={saveRealName}
                            disabled={!realDraft.trim() || savingReal}
                            className="flex-1 py-2 rounded-xl text-[12px] font-semibold text-white disabled:opacity-50 active:opacity-80"
                            style={{ background: "linear-gradient(135deg, #1D5E8F, #319ED8)" }}
                            data-testid="button-save-real-name"
                          >
                            {savingReal ? "Saving…" : "Save & Use"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <IdentityRow
                        label="Real Name"
                        value={resolvedIdentities.realName || "Add real name…"}
                        selected={identity === "real" && !!resolvedIdentities.realName}
                        ghost={!resolvedIdentities.realName}
                        onClick={() => pickIdentity("real")}
                        testId="identity-real"
                      />
                    )}
                  </div>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={handleSaveImage}
              disabled={savingImage}
              aria-label="Save card as image"
              className="w-11 h-11 rounded-full flex items-center justify-center active:opacity-70 transition-opacity shadow-lg flex-shrink-0 disabled:opacity-60"
              style={{
                background: imageSaved ? "#4AFFCA" : "rgba(255,255,255,0.18)",
                color: imageSaved ? "#00062B" : "#fff",
                backdropFilter: "blur(20px)",
                border: "1px solid rgba(255,255,255,0.22)",
              }}
              data-testid="button-save-certificate-image"
            >
              {savingImage ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="animate-spin">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
              ) : imageSaved ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
                </svg>
              )}
            </button>

            <button
              type="button"
              onClick={handleShare}
              aria-label={shared ? "Link copied" : "Share certificate"}
              className="w-11 h-11 rounded-full flex items-center justify-center active:opacity-70 transition-opacity shadow-lg flex-shrink-0"
              style={{
                background: shared ? "var(--brand-mint)" : "rgba(255,255,255,0.18)",
                color: shared ? "var(--brand-bg)" : "#fff",
                backdropFilter: "blur(20px)",
                border: "1px solid rgba(255,255,255,0.22)",
              }}
              data-testid="button-share-certificate"
            >
              {shared ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Shape toggle: which share format to render + save */}
        <div className="flex justify-center mb-4 px-5">
          <div
            className="inline-flex rounded-full p-1"
            role="tablist"
            aria-label="Card format"
            style={{
              background: "rgba(255,255,255,0.14)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              border: "1px solid rgba(255,255,255,0.2)",
            }}
          >
            {([
              { key: "story", label: "Story" },
              { key: "portrait", label: "Portrait" },
              { key: "square", label: "Square" },
            ] as const).map((opt) => {
              const active = shape === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setShape(opt.key)}
                  className="h-10 px-5 rounded-full text-sm font-semibold transition-colors"
                  style={{
                    background: active ? "#ffffff" : "transparent",
                    color: active ? "var(--brand-bg)" : "rgba(255,255,255,0.78)",
                  }}
                  data-testid={`button-shape-${opt.key}`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Carousel */}
        <div
          ref={scrollerRef}
          onScroll={handleScroll}
          className="overflow-x-auto scrollbar-hide snap-x snap-mandatory"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <div className="flex gap-4 px-1" style={{ minWidth: "100%", justifyContent: "safe center" }}>
            {certs.map((num, i) => (
              <CertCard
                key={num}
                ref={(el) => { cardRefs.current[i] = el; }}
                album={album}
                ownerName={displayedName}
                ownerPhotoUrl={user?.photoUrl ?? null}
                num={num}
                shape={shape}
                w={previewW}
              />
            ))}
          </div>
        </div>

        {/* Dot indicators */}
        {certs.length > 1 && (
          <div className="flex items-center justify-center gap-1.5 mt-4">
            {certs.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => goTo(i)}
                aria-label={`Go to certificate ${i + 1}`}
                className="rounded-full transition-all"
                style={{
                  width: i === safeIdx ? 18 : 6,
                  height: 6,
                  background: i === safeIdx ? "#fff" : "rgba(255,255,255,0.35)",
                }}
                data-testid={`dot-cert-${i}`}
              />
            ))}
          </div>
        )}

        {/* Hidden full-resolution capture stage. handleSaveImage snapshots this
            off-screen node so the exported PNG is always exactly 1080×1080
            (square) / 1080×1350 (portrait) / 1080×1920 (story), independent of
            the preview size. */}
        <div
          aria-hidden
          style={{ position: "fixed", left: -99999, top: 0, opacity: 0, pointerEvents: "none" }}
        >
          <div ref={captureRef}>
            <CertCard
              album={album}
              ownerName={displayedName}
              ownerPhotoUrl={user?.photoUrl ?? null}
              num={certs[safeIdx]}
              shape={shape}
              w={1080}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function IdentityRow({
  label,
  value,
  selected,
  ghost,
  onClick,
  testId,
}: {
  label: string;
  value: string;
  selected: boolean;
  ghost?: boolean;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-between gap-3 px-3.5 py-2.5 text-left active:bg-white/10"
      data-testid={testId}
    >
      <div className="min-w-0">
        <p className="text-white/45 text-[10px] font-semibold uppercase tracking-wider">{label}</p>
        <p className={`text-sm truncate mt-0.5 ${ghost ? "text-white/40 italic" : "text-white"}`}>{value}</p>
      </div>
      <span className="w-4 flex-shrink-0 flex items-center justify-center">
        {selected && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#319ED8" strokeWidth="3" strokeLinecap="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        )}
      </span>
    </button>
  );
}

interface CertCardProps {
  album: Album;
  ownerName: string;
  num: number;
  ownerPhotoUrl?: string | null;
  shape: CardShape;
  /** Render width in px. The whole card is authored at a 1080 base and scaled
      by `u = w / 1080`, so the same component drives both the small on-screen
      preview and the off-screen 1080-scale capture node. */
  w: number;
}

// Export height = w × ratio: square 1080×1080, portrait 1080×1350, story 1080×1920.
const SHAPE_RATIO: Record<CardShape, number> = {
  square: 1,
  portrait: 1350 / 1080,
  story: 1920 / 1080,
};

/** Per-format spec for the approved GoodDeed "bordered" card family. All three
    share one signature — orange (#FF7C06) edge-to-edge frame, the sharp album
    cover filling the whole card behind a translucent darker-navy scrim (the
    approved "D" treatment), owner avatar straddling the seam, then
    certifies → name → [GoodTunes | #NN] pill → caption. Square + portrait use
    SQUARE corners (radius 0); the story keeps the approved rounded curve. Every
    value is in 1080-base units and multiplied by `u = w / 1080`. `artBandU` is
    the height of the transparent top spacer that holds the avatar/text rhythm. */
type CertShapeSpec = {
  radiusU: number;
  artBandU: number | "square";
  avatarU: number;
  avatarMtU: number;
  certFsU: number;
  certMtU: number;
  nameBases: [number, number, number, number, number, number];
  nameMtU: number;
  pillMtU: number;
  pillPadVU: number;
  pillPadHU: number;
  pillGapU: number;
  logoHU: number;
  divHU: number;
  numFsU: number;
  captionFsU: number;
  captionPinBottom: boolean;
  captionMtU: number;
  padXU: number;
  padBU: number;
};

// Approved "D" treatment: a translucent darker-navy scrim laid over the sharp,
// full-bleed album cover. The cover stays clearly visible up top and ramps to
// solid navy at the bottom so the avatar/name/number/caption block stays clean.
const BLEED_SCRIM =
  "linear-gradient(180deg, rgba(0,6,43,0.18) 0%, rgba(0,6,43,0.40) 40%, rgba(0,6,43,0.86) 72%, rgba(0,6,43,1) 100%)";

const CERT_SHAPE_SPECS: Record<CardShape, CertShapeSpec> = {
  square: {
    radiusU: 0,
    artBandU: 470,
    avatarU: 200, avatarMtU: -148,
    certFsU: 33, certMtU: 28,
    nameBases: [84, 72, 63, 54, 48, 42], nameMtU: 8,
    pillMtU: 22, pillPadVU: 22, pillPadHU: 42, pillGapU: 22, logoHU: 60, divHU: 46, numFsU: 40,
    captionFsU: 30, captionPinBottom: true, captionMtU: 0,
    padXU: 56, padBU: 56,
  },
  portrait: {
    radiusU: 0,
    artBandU: 690,
    avatarU: 210, avatarMtU: -170,
    certFsU: 33, certMtU: 34,
    nameBases: [88, 76, 66, 57, 50, 44], nameMtU: 10,
    pillMtU: 26, pillPadVU: 24, pillPadHU: 44, pillGapU: 22, logoHU: 64, divHU: 50, numFsU: 42,
    captionFsU: 30, captionPinBottom: false, captionMtU: 30,
    padXU: 56, padBU: 64,
  },
  story: {
    radiusU: 66,
    artBandU: "square",
    avatarU: 248, avatarMtU: -178,
    certFsU: 38, certMtU: 51,
    nameBases: [95, 83, 73, 64, 54, 48], nameMtU: 19,
    pillMtU: 38, pillPadVU: 29, pillPadHU: 51, pillGapU: 25, logoHU: 76, divHU: 60, numFsU: 48,
    captionFsU: 38, captionPinBottom: true, captionMtU: 0,
    padXU: 76, padBU: 35,
  },
};

// Auto-shrink the owner name so it stays on ONE line across name lengths.
function certNameFontU(name: string, bases: CertShapeSpec["nameBases"], u: number): number {
  const n = name.trim().length;
  const i = n <= 12 ? 0 : n <= 15 ? 1 : n <= 18 ? 2 : n <= 22 ? 3 : n <= 26 ? 4 : 5;
  return bases[i] * u;
}

const CertCard = forwardRef(function CertCard(
  { album, ownerName, num, ownerPhotoUrl, shape, w }: CertCardProps,
  ref: Ref<HTMLDivElement>,
) {
  const certNumStr = num.toString().padStart(2, "0");
  const initial = (ownerName.replace(/^@/, "").trim()[0] || "?").toUpperCase();
  const u = w / 1080;
  const spec = CERT_SHAPE_SPECS[shape];
  const height = Math.round(w * SHAPE_RATIO[shape]);
  const border = Math.max(1, 45 * u);
  const avatarBorder = `${Math.max(1, 6 * u)}px solid rgba(255,255,255,0.18)`;

  const captionOneLine = `${album.title} by ${album.artist} #${certNumStr}`;
  const captionWraps = captionOneLine.length > 34;
  const captionMt = spec.captionPinBottom ? undefined : spec.captionMtU * u;
  const pinClass = spec.captionPinBottom ? "mt-auto" : "";

  return (
    <div
      ref={ref}
      className="flex-shrink-0 snap-start overflow-hidden mx-auto relative flex flex-col"
      style={{
        width: w,
        height,
        boxSizing: "border-box",
        border: `${border}px solid var(--brand-orange)`,
        borderRadius: spec.radiusU * u,
        backgroundColor: "var(--brand-bg)",
        boxShadow: "0 30px 80px rgba(0,0,0,0.7)",
      }}
    >
      {/* Approved "D" treatment: the sharp album cover fills the WHOLE card behind
          a translucent darker-navy scrim that ramps to solid navy at the bottom,
          so the cover reads top-to-bottom while the text block stays legible. */}
      <img
        src={album.artwork}
        alt={album.title}
        className="absolute inset-0 w-full h-full object-cover object-top block"
        style={{ zIndex: 0 }}
        data-testid="img-cert-art"
      />
      <div className="absolute inset-0" style={{ zIndex: 0, background: BLEED_SCRIM }} />

      {/* Transparent top spacer — holds the avatar/text vertical rhythm (the avatar
          is pulled up over this seam) now that the art is a full-bleed layer. */}
      <div
        className="relative w-full shrink-0"
        style={{ zIndex: 1, ...(spec.artBandU === "square" ? { aspectRatio: "1 / 1" } : { height: spec.artBandU * u }) }}
      />

      {/* Ownership block — relative+z so the avatar paints ON TOP of the art seam */}
      <div
        className="relative z-10 flex-1 flex flex-col items-center text-center"
        style={{ paddingLeft: spec.padXU * u, paddingRight: spec.padXU * u, paddingBottom: spec.padBU * u }}
        data-testid="text-cert-owner"
        aria-label={`${ownerName} owns no. ${certNumStr} of ${album.title}`}
      >
        {ownerPhotoUrl ? (
          <img
            src={ownerPhotoUrl}
            alt=""
            className="rounded-full object-cover shrink-0"
            style={{
              width: spec.avatarU * u,
              height: spec.avatarU * u,
              marginTop: spec.avatarMtU * u,
              border: avatarBorder,
              boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            }}
            data-testid="img-cert-owner-photo"
          />
        ) : (
          <div
            className="rounded-full overflow-hidden shrink-0 flex items-center justify-center text-white font-semibold"
            style={{
              width: spec.avatarU * u,
              height: spec.avatarU * u,
              marginTop: spec.avatarMtU * u,
              fontSize: spec.avatarU * 0.42 * u,
              background: "rgba(255,255,255,0.14)",
              border: avatarBorder,
              boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            }}
            aria-hidden
            data-testid="placeholder-cert-owner-avatar"
          >
            {initial}
          </div>
        )}

        <p className="text-white/55 leading-snug" style={{ fontSize: spec.certFsU * u, marginTop: spec.certMtU * u }}>
          This GoodDeed® certifies
        </p>
        <p
          className="text-white font-bold leading-tight max-w-full whitespace-nowrap"
          style={{ fontSize: certNameFontU(ownerName, spec.nameBases, u), marginTop: spec.nameMtU * u }}
          data-testid="text-cert-owner-name"
        >
          {ownerName}
        </p>

        {/* [GoodTunes | #NN] number pill — directly under the name */}
        <div
          className="flex items-center"
          style={{
            marginTop: spec.pillMtU * u,
            gap: spec.pillGapU * u,
            padding: `${spec.pillPadVU * u}px ${spec.pillPadHU * u}px`,
            borderRadius: 999,
            background: "rgba(0,6,43,0.62)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            border: "1px solid rgba(255,255,255,0.18)",
            boxShadow: "0 4px 14px rgba(0,0,0,0.45)",
          }}
        >
          <img src="/goodtunes-logo-white.png" alt="GoodTunes" style={{ height: spec.logoHU * u, width: "auto", display: "block" }} />
          <span style={{ width: 1, height: spec.divHU * u, background: "rgba(255,255,255,0.3)" }} />
          <span className="font-bold text-white" style={{ fontSize: spec.numFsU * u, letterSpacing: 0.2 }} data-testid="text-cert-serial">
            #{certNumStr}
          </span>
        </div>

        {/* Secondary album caption — pinned to the bottom (square/story) or set
            directly under the pill as part of the block (portrait) */}
        {captionWraps ? (
          <div className={`text-white/60 leading-snug ${pinClass}`} style={{ fontSize: spec.captionFsU * u, marginTop: captionMt }} data-testid="text-cert-album">
            <p className="whitespace-nowrap">{album.title} #{certNumStr}</p>
            <p className="whitespace-nowrap">by {album.artist}</p>
          </div>
        ) : (
          <p className={`text-white/60 leading-snug whitespace-nowrap ${pinClass}`} style={{ fontSize: spec.captionFsU * u, marginTop: captionMt }} data-testid="text-cert-album">
            {captionOneLine}
          </p>
        )}
      </div>
    </div>
  );
});
