import { Trash2, GripVertical, Plus, Check, ChevronDown, ChevronUp, Search } from "lucide-react";

export function Progressive() {
  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans antialiased">
      <div className="max-w-[640px] mx-auto">
        <div className="flex items-baseline justify-between mb-3">
          <h3 className="text-slate-500 text-[11px] font-semibold uppercase tracking-wider">
            Credits <span className="text-slate-300 font-normal normal-case tracking-normal">(4)</span>
          </h3>
          <button className="text-[#319ED8] text-[12px] font-medium hover:underline flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" /> Credit
          </button>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm divide-y divide-slate-100">
          {/* Collapsed row — quick scan */}
          <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50/60 group">
            <GripVertical className="w-4 h-4 text-slate-200 group-hover:text-slate-400 flex-shrink-0" />
            <img src="https://i.pravatar.cc/64?img=8" alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
            <div className="flex-1 min-w-0 flex items-baseline gap-2 text-[13px]">
              <span className="text-slate-900 font-semibold truncate">Stuart Crichton</span>
              <span className="text-slate-300">·</span>
              <span className="text-slate-600 truncate">Producer</span>
            </div>
            <ChevronDown className="w-4 h-4 text-slate-300" />
          </div>

          {/* Expanded row — focused editor */}
          <div className="bg-[#FAFBFC]">
            <div className="flex items-center gap-3 px-3 py-2.5">
              <GripVertical className="w-4 h-4 text-slate-300 flex-shrink-0" />
              <img src="https://i.pravatar.cc/64?img=12" alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
              <div className="flex-1 min-w-0 flex items-baseline gap-2 text-[13px]">
                <span className="text-slate-900 font-semibold truncate">Nick Carter</span>
                <span className="text-slate-300">·</span>
                <span className="text-slate-600 truncate">Lead vocal</span>
                <span className="text-slate-300 text-[11px] truncate">— 1973 Martin D-28</span>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-sky-50 text-[#319ED8] text-[10px] font-semibold tracking-wide">
                PERFORMER
              </span>
              <ChevronUp className="w-4 h-4 text-slate-400" />
            </div>

            <div className="px-3 pb-3 ml-10 mr-2 space-y-2.5">
              <div>
                <label className="block text-slate-400 text-[10px] font-semibold uppercase tracking-wider mb-1">
                  Role on this track
                </label>
                <input
                  defaultValue="Lead vocal"
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[13px] text-slate-900 focus:outline-none focus:border-[#319ED8]"
                />
              </div>

              <div className="grid grid-cols-[1.4fr_1fr] gap-2">
                <div>
                  <label className="block text-slate-400 text-[10px] font-semibold uppercase tracking-wider mb-1">
                    Gear
                  </label>
                  <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1.5">
                    <div className="w-6 h-6 rounded bg-gradient-to-br from-amber-700 to-amber-950 flex-shrink-0" />
                    <span className="flex-1 text-slate-900 text-[12.5px] truncate">1973 Martin D-28</span>
                    <button className="text-slate-400 text-[11px] hover:text-slate-700">Change</button>
                  </div>
                </div>
                <div>
                  <label className="block text-slate-400 text-[10px] font-semibold uppercase tracking-wider mb-1">
                    Tuning / notes
                  </label>
                  <input
                    defaultValue="DADGAD, capo 3"
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[13px] text-slate-900 focus:outline-none focus:border-[#319ED8]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-0.5">
                <div className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-emerald-600 text-[11px] font-medium">Saved</span>
                </div>
                <button className="text-slate-300 hover:text-red-500 transition-colors p-1">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Two more collapsed rows */}
          <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50/60 group">
            <GripVertical className="w-4 h-4 text-slate-200 group-hover:text-slate-400 flex-shrink-0" />
            <img src="https://i.pravatar.cc/64?img=33" alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
            <div className="flex-1 min-w-0 flex items-baseline gap-2 text-[13px]">
              <span className="text-slate-900 font-semibold truncate">Tommy Lee James</span>
              <span className="text-slate-300">·</span>
              <span className="text-slate-600 truncate">Co-writer</span>
            </div>
            <ChevronDown className="w-4 h-4 text-slate-300" />
          </div>

          <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50/60 group">
            <GripVertical className="w-4 h-4 text-slate-200 group-hover:text-slate-400 flex-shrink-0" />
            <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 text-[11px] font-semibold flex-shrink-0">
              JT
            </div>
            <div className="flex-1 min-w-0 flex items-baseline gap-2 text-[13px]">
              <span className="text-slate-900 font-semibold truncate">Jamie Taylor</span>
              <span className="text-slate-300">·</span>
              <span className="text-slate-600 truncate">Drums</span>
              <span className="text-slate-300 text-[11px] truncate">— Ludwig Vistalite 1976</span>
            </div>
            <ChevronDown className="w-4 h-4 text-slate-300" />
          </div>
        </div>

        <p className="mt-4 text-slate-400 text-[11px] leading-relaxed">
          <span className="font-semibold text-slate-500">Idea:</span> a long song might have 8+ credits — keep each one to a single readable line until you tap it. Only the active row shows the full editor; everyone else stays calm and scannable. Saves implicitly, no Save buttons anywhere.
        </p>
      </div>
    </div>
  );
}
