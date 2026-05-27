export function Compact() {
  return (
    <div className="min-h-screen flex items-center justify-center p-8" style={{ background: "#06091a" }}>
      <div className="w-[420px] rounded-3xl overflow-hidden flex flex-col" style={{ background: "#00062B", boxShadow: "0 30px 80px rgba(0,0,0,0.7)" }}>
        <div className="w-full aspect-square" style={{ background: "linear-gradient(135deg,#7F10A7 0%,#319ED8 60%,#4AFFCA 100%)" }} />
        <div className="px-4 py-3 flex flex-col gap-2 aspect-[4/1] justify-between text-white">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div className="w-8 h-8 rounded-full flex-shrink-0" style={{ background: "rgba(255,255,255,0.32)" }} />
              <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                <div className="h-2 w-[55%] rounded-full" style={{ background: "rgba(255,255,255,0.32)" }} />
                <div className="h-2 w-[32%] rounded-full" style={{ background: "rgba(255,255,255,0.32)" }} />
              </div>
            </div>
            <img src="/__mockup/images/goodtunes-logo-white.png" alt="GoodTunes" className="h-8 w-auto object-contain flex-shrink-0" />
          </div>
          <div className="flex items-end justify-between gap-3">
            <div className="flex-1 min-w-0 relative">
              <div className="h-2 w-[60%] rounded-full" style={{ background: "rgba(255,255,255,0.32)" }} />
              <img src="/__mockup/images/will-signature.png" alt="" className="absolute left-0 bottom-0 h-8 w-auto max-w-[55%] object-contain object-left-bottom" />
            </div>
            <div className="w-8 h-8 rounded-sm flex-shrink-0" style={{ background: "rgba(255,255,255,0.32)" }} />
          </div>
        </div>
      </div>
    </div>
  );
}
