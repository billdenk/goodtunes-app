import { Trash2, GripVertical, Plus, Check, ChevronDown } from "lucide-react";

export function TwoColumn() {
  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans antialiased">
      <div className="max-w-[680px] mx-auto">
        <div className="flex items-baseline justify-between mb-3">
          <h3 className="text-slate-500 text-[11px] font-semibold uppercase tracking-wider">
            Credits <span className="text-slate-300 font-normal normal-case tracking-normal">(1)</span>
          </h3>
          <button className="text-[#319ED8] text-[12px] font-medium hover:underline flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" /> Credit
          </button>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-stretch divide-x divide-slate-200">
            <button className="flex items-center justify-center px-1.5 text-slate-300 hover:text-slate-500 hover:bg-slate-50">
              <GripVertical className="w-4 h-4" />
            </button>

            <div className="flex-1 grid grid-cols-[1fr_1fr] gap-px bg-slate-200">
              <div className="bg-white px-3 py-3">
                <p className="text-slate-400 text-[10px] font-semibold uppercase tracking-wider mb-1.5">
                  Performer
                </p>
                <div className="flex items-center gap-2">
                  <img
                    src="https://i.pravatar.cc/64?img=12"
                    alt=""
                    className="w-7 h-7 rounded-full object-cover"
                  />
                  <div className="min-w-0">
                    <p className="text-slate-900 text-[13px] font-semibold truncate">Nick Carter</p>
                    <p className="text-slate-400 text-[11px] truncate">Lead vocal</p>
                  </div>
                </div>
              </div>

              <div className="bg-white px-3 py-3">
                <p className="text-slate-400 text-[10px] font-semibold uppercase tracking-wider mb-1.5">
                  Gear
                </p>
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded bg-gradient-to-br from-amber-700 to-amber-950 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-slate-900 text-[13px] font-semibold truncate">
                      1973 Martin D-28
                    </p>
                    <p className="text-slate-400 text-[11px] truncate">DADGAD, capo 3</p>
                  </div>
                </div>
              </div>
            </div>

            <button className="flex items-center justify-center px-2 text-slate-300 hover:text-slate-500 hover:bg-slate-50">
              <ChevronDown className="w-4 h-4" />
            </button>
            <button className="flex items-center justify-center px-2 text-slate-300 hover:text-red-500 hover:bg-red-50">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          <div className="border-t border-slate-200 px-3 py-3 bg-slate-50/40">
            <div className="grid grid-cols-2 gap-3">
              <input
                defaultValue="Lead vocal"
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-[12.5px] text-slate-900 focus:outline-none focus:border-[#319ED8]"
              />
              <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1.5">
                <div className="w-6 h-6 rounded bg-gradient-to-br from-amber-700 to-amber-950 flex-shrink-0" />
                <span className="flex-1 text-slate-900 text-[12.5px] truncate">1973 Martin D-28</span>
                <button className="text-slate-400 text-[11px] hover:text-slate-700">Change</button>
              </div>
              <input
                placeholder="Tuning / setup notes"
                defaultValue="DADGAD, capo 3"
                className="col-span-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-[12.5px] text-slate-900 focus:outline-none focus:border-[#319ED8]"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-1.5 px-3 py-2 border-t border-slate-100 bg-white rounded-b-xl">
            <Check className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-emerald-600 text-[11px] font-medium">Saved just now</span>
          </div>
        </div>

        <p className="mt-4 text-slate-400 text-[11px] leading-relaxed">
          <span className="font-semibold text-slate-500">Idea:</span> who-did-what on one tidy line — performer on the left, gear on the right, columns visually separated. Drag handle and destructive actions live on their own rails outside the data, not inline. Chevron toggles the editor drawer; collapsed, you can scan ten credits at a glance.
        </p>
      </div>
    </div>
  );
}
