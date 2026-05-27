export function Compact() {
  return (
    <div className="min-h-screen flex items-center justify-center p-8" style={{ background: "#06091a" }}>
      <div className="w-[420px] rounded-3xl overflow-hidden flex flex-col" style={{ background: "#00062B", boxShadow: "0 30px 80px rgba(0,0,0,0.7)" }}>
        <div className="w-full aspect-square" style={{ background: "linear-gradient(135deg,#7F10A7 0%,#319ED8 60%,#4AFFCA 100%)" }} />
        {/* Cert band — aspect ~3.67/1 to match the wireframe proportions exactly */}
        <div className="w-full px-5 py-4 flex flex-col justify-between gap-2.5 text-white" style={{ aspectRatio: "11 / 3" }}>
          {/* Top row */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-10 h-10 rounded-full flex-shrink-0" style={{ background: "rgba(255,255,255,0.32)" }} />
              <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                <div className="h-3 w-[58%] rounded-full" style={{ background: "rgba(255,255,255,0.32)" }} />
                <div className="h-3 w-[32%] rounded-full" style={{ background: "rgba(255,255,255,0.32)" }} />
              </div>
            </div>
            <img src="/__mockup/images/goodtunes-logo-white.png" alt="GoodTunes" className="h-9 w-auto object-contain flex-shrink-0" />
          </div>
          {/* Body — 4 stacked bars; signature overlays the bottom bar, QR aligns right */}
          <div className="flex items-end justify-between gap-3">
            <div className="flex-1 min-w-0 flex flex-col gap-1.5 relative">
              <div className="h-3 w-[88%] rounded-full" style={{ background: "rgba(255,255,255,0.32)" }} />
              <div className="h-3 w-[80%] rounded-full" style={{ background: "rgba(255,255,255,0.32)" }} />
              <div className="h-3 w-[68%] rounded-full" style={{ background: "rgba(255,255,255,0.32)" }} />
              <div className="h-3 w-[60%] rounded-full" style={{ background: "rgba(255,255,255,0.32)" }} />
              <img src="/__mockup/images/will-signature.png" alt="" className="absolute left-0 bottom-0 h-10 w-auto max-w-[60%] object-contain object-left-bottom translate-y-1" />
            </div>
            <div className="w-10 h-10 rounded-sm flex-shrink-0" style={{ background: "rgba(255,255,255,0.32)" }} />
          </div>
        </div>
      </div>
    </div>
  );
}
