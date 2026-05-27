export function Engraved() {
  return (
    <div className="min-h-screen flex items-center justify-center p-8" style={{ background: "#06091a" }}>
      <div className="w-[420px] rounded-3xl overflow-hidden flex flex-col" style={{ background: "#00062B", boxShadow: "0 30px 80px rgba(0,0,0,0.7)" }}>
        <div className="w-full aspect-square" style={{ background: "linear-gradient(135deg,#7F10A7 0%,#319ED8 60%,#4AFFCA 100%)" }} />
        <div className="px-5 pt-3 pb-3.5 flex flex-col text-white" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
          {/* Eyebrow caption */}
          <div className="flex items-center gap-2 mb-1.5">
            <div className="h-px flex-1" style={{ background: "rgba(255,255,255,0.22)" }} />
            <span className="text-[8px] tracking-[0.28em] uppercase font-semibold" style={{ fontFamily: "ui-sans-serif, system-ui", color: "rgba(255,255,255,0.55)" }}>Certificate of Authenticity</span>
            <div className="h-px flex-1" style={{ background: "rgba(255,255,255,0.22)" }} />
          </div>
          {/* Owner block */}
          <div className="flex items-center justify-between gap-3 mb-1">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className="w-9 h-9 rounded-full flex-shrink-0" style={{ background: "rgba(255,255,255,0.32)" }} />
              <div className="min-w-0">
                <div className="h-2.5 w-28 rounded-full mb-1.5" style={{ background: "rgba(255,255,255,0.34)" }} />
                <div className="h-1.5 w-20 rounded-full" style={{ background: "rgba(255,255,255,0.22)" }} />
              </div>
            </div>
            <img src="/__mockup/images/goodtunes-logo-white.png" alt="GoodTunes" className="h-7 w-auto object-contain flex-shrink-0 opacity-90" />
          </div>
          {/* Hairline rule */}
          <div className="h-px my-2" style={{ background: "rgba(255,255,255,0.18)" }} />
          {/* Signature row */}
          <div className="flex items-end justify-between gap-3">
            <div className="flex-1 min-w-0 relative">
              <img src="/__mockup/images/will-signature.png" alt="" className="h-7 w-auto max-w-[60%] object-contain object-left-bottom block" />
              <div className="text-[7px] tracking-[0.28em] uppercase mt-0.5" style={{ fontFamily: "ui-sans-serif, system-ui", color: "rgba(255,255,255,0.45)" }}>Will Bowen · Founder</div>
            </div>
            <div className="flex flex-col items-end">
              <div className="w-9 h-9 rounded-[2px] flex-shrink-0" style={{ background: "rgba(255,255,255,0.32)" }} />
              <div className="text-[7px] tracking-[0.28em] uppercase mt-0.5" style={{ fontFamily: "ui-sans-serif, system-ui", color: "rgba(255,255,255,0.45)" }}>Verify</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
