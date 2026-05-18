import { useEffect, useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { ChevronLeft } from "lucide-react";
import { INSTRUMENTS, type Instrument, type InstrumentVendor } from "@/data/musicData";
import { BottomNav } from "@/components/BottomNav";
import { MiniPlayer } from "@/components/MiniPlayer";

function parseInstrumentAbout(about: string): { prose: string; specs: { label: string; value: string }[] } {
  const lines = about.split(/\r?\n/);
  const proseLines: string[] = [];
  const specs: { label: string; value: string }[] = [];
  const specLine = /^\s*([A-Z][A-Za-z0-9 /()&'.-]{0,40}):\s+(.{1,80})\s*$/;
  for (const raw of lines) {
    const m = raw.match(specLine);
    const looksProse = m && (/[.!?]\s+\S/.test(m[2]) || /[.!?]["')\]]?\s*$/.test(m[2]));
    if (m && !looksProse) {
      specs.push({ label: m[1].trim(), value: m[2].trim() });
    } else {
      proseLines.push(raw);
    }
  }
  const prose = proseLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { prose, specs };
}

export function InstrumentDetail() {
  const [, params] = useRoute<{ id: string }>("/instrument/:id");
  const [, navigate] = useLocation();
  const instrument: Instrument | undefined = params?.id ? INSTRUMENTS[params.id] : undefined;

  const [isBookmarked, setIsBookmarked] = useState<boolean>(() => {
    if (!params?.id || typeof window === "undefined") return false;
    try {
      const raw = window.localStorage.getItem("gt:bookmarked-instruments");
      const ids: string[] = raw ? JSON.parse(raw) : [];
      return ids.includes(params.id);
    } catch { return false; }
  });
  useEffect(() => {
    if (!params?.id) return;
    try {
      const raw = window.localStorage.getItem("gt:bookmarked-instruments");
      const ids: string[] = raw ? JSON.parse(raw) : [];
      setIsBookmarked(ids.includes(params.id));
    } catch { /* ignore */ }
  }, [params?.id]);
  const toggleBookmark = () => {
    if (!params?.id) return;
    try {
      const raw = window.localStorage.getItem("gt:bookmarked-instruments");
      const ids: string[] = raw ? JSON.parse(raw) : [];
      const next = ids.includes(params.id)
        ? ids.filter((x) => x !== params.id)
        : [...ids, params.id];
      window.localStorage.setItem("gt:bookmarked-instruments", JSON.stringify(next));
      setIsBookmarked(next.includes(params.id));
    } catch { /* ignore */ }
  };

  const { prose, specs } = useMemo(
    () => parseInstrumentAbout(instrument?.about ?? ""),
    [instrument?.about],
  );

  if (!instrument) {
    return (
      <main className="relative h-screen w-full flex justify-center overflow-hidden" style={{ background: "#00062B" }}>
        <section className="relative w-full max-w-[390px] h-screen text-white flex flex-col items-center justify-center px-8 text-center">
          <p className="text-white/70 text-[15px]">This bookmark is no longer available.</p>
          <button
            type="button"
            onClick={() => navigate("/account")}
            className="mt-6 px-5 py-2 rounded-full border border-white/20 text-white/80 text-sm font-medium active:opacity-70"
            data-testid="button-instrument-back"
          >
            Back to Account
          </button>
        </section>
      </main>
    );
  }

  const handleVendorOpen = (v: InstrumentVendor) => {
    if (typeof window === "undefined") return;
    window.open(v.affiliateUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <main className="relative h-screen w-full flex justify-center overflow-hidden" style={{ background: "#00062B" }}>
      <section className="relative w-full max-w-[390px] h-screen text-white flex flex-col">
        {/* Top bar — back + bookmark, glass over content */}
        <div
          className="flex-shrink-0 flex items-center justify-between px-3 pb-2"
          style={{ background: "rgba(20,24,48,0.85)", backdropFilter: "blur(20px) saturate(180%)", paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
        >
          <button
            type="button"
            onClick={() => navigate("/account")}
            aria-label="Back"
            className="w-11 h-11 rounded-full flex items-center justify-center text-white active:scale-[0.94]"
            style={{ background: "rgba(255,255,255,0.10)" }}
            data-testid="button-back"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={toggleBookmark}
            aria-label={isBookmarked ? "Remove bookmark" : "Bookmark"}
            aria-pressed={isBookmarked}
            className="w-11 h-11 rounded-full flex items-center justify-center active:scale-[0.94]"
            style={{ background: "rgba(255,255,255,0.10)" }}
            data-testid="button-bookmark"
          >
            <svg
              width="19" height="19" viewBox="0 0 24 24"
              fill={isBookmarked ? "#4AFFCA" : "none"}
              stroke={isBookmarked ? "#4AFFCA" : "currentColor"}
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              className="text-white" aria-hidden="true"
            >
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide pb-[170px]">
          {/* Hero photo */}
          <div className="mx-5 mt-2 rounded-2xl overflow-hidden mb-4" style={{ aspectRatio: "16 / 10", background: "linear-gradient(135deg, #1a1f4a 0%, #2a1156 100%)" }}>
            {instrument.photoUrl ? (
              <img src={instrument.photoUrl} alt={instrument.name} className="w-full h-full object-cover" data-testid="img-instrument-photo" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/35">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M9 18V5l12-2v13" />
                  <circle cx="6" cy="18" r="3" />
                  <circle cx="18" cy="16" r="3" />
                </svg>
              </div>
            )}
          </div>

          {/* Title */}
          <div className="px-5 pb-4">
            <p className="text-[12px] font-medium mb-1" style={{ color: "rgba(235,235,245,0.55)" }} data-testid="text-instrument-category">{instrument.category}</p>
            <h1 className="text-white text-[26px] font-bold leading-tight tracking-tight" data-testid="text-instrument-name">{instrument.name}</h1>
          </div>

          {/* About prose */}
          {prose && (
            <section className="px-5 pt-1 pb-3">
              <h2 className="text-white text-[22px] font-bold leading-tight tracking-tight mb-2">About this {instrument.category.toLowerCase()}</h2>
              <p className="text-[16px] leading-relaxed whitespace-pre-line" style={{ color: "rgba(235,235,245,0.72)" }} data-testid="text-instrument-about">
                {prose}
              </p>
            </section>
          )}

          {/* Artist note */}
          {instrument.artistNote && (
            <section className="px-5 pt-3 pb-3">
              <h2 className="text-white text-[22px] font-bold leading-tight tracking-tight mb-2">Notes from the artist</h2>
              <p className="text-[16px] leading-relaxed italic" style={{ color: "rgba(235,235,245,0.78)" }} data-testid="text-instrument-artist-note">
                "{instrument.artistNote}"
              </p>
            </section>
          )}

          {/* Specs */}
          {specs.length > 0 && (
            <section className="px-5 pt-3 pb-3">
              <h2 className="text-white text-[22px] font-bold leading-tight tracking-tight mb-2">Specs</h2>
              <dl className="text-[15px] leading-snug" data-testid="list-instrument-specs">
                {specs.map((s, i) => (
                  <div
                    key={`${s.label}-${i}`}
                    className="grid grid-cols-[40%_60%] gap-3 py-2"
                    style={{ borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.06)" }}
                  >
                    <dt style={{ color: "rgba(235,235,245,0.55)" }}>{s.label}</dt>
                    <dd className="text-white">{s.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {/* Where to buy */}
          {instrument.vendors && instrument.vendors.length > 0 && (
            <section className="pt-3 pb-2">
              <h2 className="px-5 text-white text-[22px] font-bold leading-tight tracking-tight mb-3">Where to buy</h2>
              <div className="pb-1">
                {instrument.vendors.map((v, i) => (
                  <button
                    key={`${v.name}-${i}`}
                    type="button"
                    onClick={() => handleVendorOpen(v)}
                    className="w-full flex items-center px-5 py-2.5 active:bg-white/5 text-left"
                    data-testid={`row-vendor-${i}`}
                  >
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden"
                      style={{ background: "rgba(255,255,255,0.92)" }}
                    >
                      {v.logoUrl ? (
                        <img src={v.logoUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-[#00062B] text-[13px] font-bold">{v.name.charAt(0)}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0 ml-3">
                      <p className="text-white text-[15px] font-medium truncate">{v.name}</p>
                      {v.tagline && (
                        <p className="text-[12px] truncate" style={{ color: "rgba(235,235,245,0.55)" }}>{v.tagline}</p>
                      )}
                    </div>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/55 flex-shrink-0 ml-2" aria-hidden="true">
                      <path d="M14 4h6v6" />
                      <path d="M20 4L10 14" />
                      <path d="M19 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5" />
                    </svg>
                  </button>
                ))}
              </div>
              <p className="px-5 pt-4 pb-3 text-[11px] text-center leading-relaxed" style={{ color: "rgba(235,235,245,0.45)" }}>
                Outbound links support the artist via Credits Micro-Sponsorships. Artist receives the lion's share; GoodTunes receives a small connection fee.
              </p>
            </section>
          )}
        </div>

        <MiniPlayer />
        <BottomNav />
      </section>
    </main>
  );
}
