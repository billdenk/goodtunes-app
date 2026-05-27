export function Stub() {
  return (
    <div className="min-h-screen flex items-center justify-center p-8" style={{ background: "#06091a" }}>
      <div className="w-[420px] rounded-3xl overflow-hidden flex flex-col" style={{ background: "#00062B", boxShadow: "0 30px 80px rgba(0,0,0,0.7)" }}>
        <div className="w-full aspect-square" style={{ background: "linear-gradient(135deg,#7F10A7 0%,#319ED8 60%,#4AFFCA 100%)" }} />
        {/* Perforation */}
        <div className="relative h-3" style={{ background: "#00062B" }}>
          <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 border-t border-dashed" style={{ borderColor: "rgba(255,255,255,0.28)" }} />
          <div className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full" style={{ background: "#06091a" }} />
          <div className="absolute -right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full" style={{ background: "#06091a" }} />
        </div>
        {/* Stub body — two columns */}
        <div className="px-4 pt-1.5 pb-3 text-white flex items-stretch gap-3">
          {/* Left col — owner */}
          <div className="flex-1 min-w-0 flex flex-col gap-2 pr-3 border-r border-dashed" style={{ borderColor: "rgba(255,255,255,0.18)" }}>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full flex-shrink-0" style={{ background: "rgba(255,255,255,0.32)" }} />
              <div className="flex-1 min-w-0 flex flex-col gap-1">
                <div className="h-2 w-[70%] rounded-full" style={{ background: "rgba(255,255,255,0.32)" }} />
                <div className="h-1.5 w-[45%] rounded-full" style={{ background: "rgba(255,255,255,0.22)" }} />
              </div>
            </div>
            <div className="relative h-7">
              <img src="/__mockup/images/will-signature.png" alt="" className="absolute left-0 bottom-0 h-7 w-auto max-w-full object-contain object-left-bottom" />
            </div>
          </div>
          {/* Right col — serial + QR */}
          <div className="w-[34%] flex flex-col items-end justify-between gap-1.5">
            <div className="flex items-center gap-1.5 text-[8px] tracking-[0.22em] uppercase" style={{ fontFamily: "ui-monospace,SFMono-Regular,monospace", color: "rgba(255,255,255,0.55)" }}>
              <span>No.</span>
              <span className="text-white text-[11px] font-semibold tracking-[0.18em]">07 / 250</span>
            </div>
            <div className="flex items-end gap-2">
              <img src="/__mockup/images/goodtunes-logo-white.png" alt="GoodTunes" className="h-5 w-auto object-contain opacity-90" />
              <div className="w-9 h-9 rounded-[2px]" style={{ background: "rgba(255,255,255,0.32)" }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
