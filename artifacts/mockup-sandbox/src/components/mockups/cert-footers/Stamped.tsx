export function Stamped() {
  return (
    <div className="min-h-screen flex items-center justify-center p-8" style={{ background: "#06091a" }}>
      <div className="w-[420px] rounded-3xl overflow-hidden flex flex-col" style={{ background: "#00062B", boxShadow: "0 30px 80px rgba(0,0,0,0.7)" }}>
        <div className="w-full aspect-square" style={{ background: "linear-gradient(135deg,#7F10A7 0%,#319ED8 60%,#4AFFCA 100%)" }} />
        <div className="relative p-3" style={{ background: "#00062B" }}>
          {/* Embossed border */}
          <div className="relative rounded-md px-3.5 py-3 text-white overflow-hidden" style={{ boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.16), inset 0 0 0 3px rgba(0,0,0,0.0), inset 0 0 0 4px rgba(255,255,255,0.06)" }}>
            {/* Faint rotated ISSUED stamp */}
            <div className="absolute right-2 top-1/2 -translate-y-1/2 -rotate-[14deg] pointer-events-none select-none" style={{ fontFamily: "ui-monospace,SFMono-Regular,monospace" }}>
              <div className="px-2 py-0.5 rounded-sm text-[8px] tracking-[0.32em] font-bold" style={{ color: "rgba(74,255,202,0.18)", border: "1px solid rgba(74,255,202,0.18)" }}>ISSUED · 2026</div>
            </div>
            <div className="flex items-center justify-between gap-2 mb-2 relative z-10">
              <div className="text-[7px] tracking-[0.32em] uppercase font-semibold" style={{ fontFamily: "ui-monospace,SFMono-Regular,monospace", color: "rgba(255,255,255,0.5)" }}>Archive · GoodDeed</div>
              <img src="/__mockup/images/goodtunes-logo-white.png" alt="GoodTunes" className="h-5 w-auto object-contain opacity-90" />
            </div>
            <div className="flex items-center gap-2.5 relative z-10">
              <div className="w-9 h-9 rounded-full flex-shrink-0" style={{ background: "rgba(255,255,255,0.32)" }} />
              <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                <div className="h-2 w-[60%] rounded-sm" style={{ background: "rgba(255,255,255,0.34)" }} />
                <div className="h-1.5 w-[40%] rounded-sm" style={{ background: "rgba(255,255,255,0.22)" }} />
              </div>
              <div className="text-right" style={{ fontFamily: "ui-monospace,SFMono-Regular,monospace" }}>
                <div className="text-[7px] tracking-[0.28em] uppercase" style={{ color: "rgba(255,255,255,0.5)" }}>Serial</div>
                <div className="text-[12px] font-semibold tracking-[0.14em] text-white">07/250</div>
              </div>
            </div>
            <div className="mt-2 flex items-end justify-between gap-2 relative z-10">
              <img src="/__mockup/images/will-signature.png" alt="" className="h-7 w-auto max-w-[55%] object-contain object-left-bottom" />
              <div className="w-9 h-9 rounded-[2px] flex-shrink-0" style={{ background: "rgba(255,255,255,0.32)" }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
