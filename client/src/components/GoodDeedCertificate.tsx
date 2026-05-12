import { useState, useRef, useEffect, forwardRef, useMemo, type Ref } from "react";
import { Album } from "@/data/musicData";
import { useAuth } from "@/hooks/useAuth";
import certBgUrl from "@assets/Digital_GoodDeed_-_Nick_Carter_1778545442175.svg";

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
  const [activeIdx, setActiveIdx] = useState(0);
  const [identity, setIdentity] = useState<IdentityKind>("display");
  const [showIdentityMenu, setShowIdentityMenu] = useState(false);
  const [addRealOpen, setAddRealOpen] = useState(false);
  const [realDraft, setRealDraft] = useState("");
  const [savingReal, setSavingReal] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  const { updateProfile } = useAuth();

  const safeIdx = Math.min(Math.max(activeIdx, 0), certs.length - 1);

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

  const padded = (n: number) => n.toString().padStart(2, "0");

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

      <div className="relative w-full z-10 animate-slide-up">
        {/* Top controls: close + identity + share */}
        <div className="flex items-center justify-between mb-5 px-5 gap-2">
          <button
            type="button"
            onClick={onClose}
            aria-label={certs.length === 1 ? "Back" : "Close certificate"}
            className="w-10 h-10 rounded-full flex items-center justify-center active:opacity-70 shadow-lg flex-shrink-0"
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
                className="h-10 px-3.5 rounded-full flex items-center gap-1.5 text-xs font-semibold active:opacity-70 transition-opacity shadow-lg"
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
                          placeholder="Tina Banner"
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
              onClick={handleShare}
              className="h-10 px-4 rounded-full flex items-center justify-center gap-1.5 text-sm font-semibold active:opacity-70 transition-opacity shadow-lg flex-shrink-0"
              style={{
                background: shared ? "#4AFFCA" : "#ffffff",
                color: "#00062B",
              }}
              data-testid="button-share-certificate"
            >
              {shared ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                  Copied
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />
                  </svg>
                  Share
                </>
              )}
            </button>
          </div>
        </div>

        {/* Carousel */}
        <div
          ref={scrollerRef}
          onScroll={handleScroll}
          className="overflow-x-auto scrollbar-hide snap-x snap-mandatory"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <div className="flex gap-4 px-1">
            {certs.map((num, i) => (
              <CertCard
                key={num}
                ref={(el) => { cardRefs.current[i] = el; }}
                album={album}
                ownerName={displayedName}
                num={num}
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
}

const CertCard = forwardRef(function CertCard(
  { album, ownerName, num }: CertCardProps,
  ref: Ref<HTMLDivElement>,
) {
  const certNumStr = num.toString().padStart(2, "0");
  return (
    <div
      ref={ref}
      className="flex-shrink-0 snap-start rounded-3xl overflow-hidden shadow-2xl mx-auto"
      style={{
        width: "min(100%, calc((100dvh - 200px) * 9 / 16))",
        aspectRatio: "9 / 16",
        boxShadow: "0 30px 80px rgba(0,0,0,0.7)",
        backgroundColor: "#00062B",
        backgroundImage: `url(${certBgUrl})`,
        backgroundSize: "100% 100%",
        backgroundRepeat: "no-repeat",
      }}
    >
      {/* Top: full-bleed artwork */}
      <div className="relative w-full" style={{ height: "50%" }}>
        <img src={album.artwork} alt={album.title} className="w-full h-full object-cover" />
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(to bottom, transparent 70%, rgba(13,32,96,0.4) 100%)" }}
        />
      </div>

      {/* Bottom: SVG ambient background shows through */}
      <div
        className="relative w-full px-6 py-6 flex flex-col"
        style={{ height: "50%" }}
      >
        <div>
          <p className="text-white text-xl font-bold leading-tight">{album.title}</p>
          <p className="text-white/65 text-sm mt-0.5">{album.artist}</p>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center text-center px-2">
          <p className="text-white/75 text-[13px]">This GoodDeed® certifies that</p>
          <p className="text-white text-2xl font-bold mt-1.5 leading-tight" data-testid="text-cert-owner">{ownerName}</p>
          <p className="text-white/75 text-[13px] mt-1.5">
            owns number {certNumStr} of this series.
          </p>
        </div>

        <div className="flex items-end justify-between">
          <p
            className="text-white text-3xl font-bold leading-none"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            No. {certNumStr}
          </p>
          <img
            src="/goodtunes-logo-white.png"
            alt="GoodTunes"
            className="h-9 w-auto object-contain"
          />
        </div>
      </div>
    </div>
  );
});
