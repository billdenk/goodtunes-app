import { Check, Trash2, GripVertical, Plus, Search } from "lucide-react";

export function Stacked() {
  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans antialiased">
      <div className="max-w-[640px] mx-auto">
        <div className="flex items-baseline justify-between mb-3">
          <h3 className="text-slate-500 text-[11px] font-semibold uppercase tracking-wider">
            Credits <span className="text-slate-300 font-normal normal-case tracking-normal">(1)</span>
          </h3>
          <button className="text-[#319ED8] text-[12px] font-medium hover:underline flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" /> Credit
          </button>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
            <GripVertical className="w-4 h-4 text-slate-300 -ml-1 flex-shrink-0" />
            <img
              src="https://i.pravatar.cc/64?img=12"
              alt=""
              className="w-9 h-9 rounded-full object-cover flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <p className="text-slate-900 text-[14px] font-semibold leading-tight truncate">
                Nick Carter
              </p>
              <button className="text-slate-400 text-[11px] hover:text-slate-600">
                Change person
              </button>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-sky-50 text-[#319ED8] text-[10px] font-semibold tracking-wide">
              PERFORMER
            </span>
            <button className="text-slate-300 hover:text-red-500 transition-colors p-1">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          <div className="px-4 py-3">
            <label className="block text-slate-400 text-[10px] font-semibold uppercase tracking-wider mb-1.5">
              Role on this track
            </label>
            <input
              defaultValue="Lead vocal"
              className="w-full text-[13px] text-slate-900 bg-transparent border-0 border-b border-slate-200 focus:border-[#319ED8] focus:outline-none pb-1"
            />
          </div>

          <div className="px-4 pb-3">
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-3">
              <p className="text-slate-400 text-[10px] font-semibold uppercase tracking-wider">
                Gear used on this track
              </p>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-300 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  placeholder="Search gear by name or category…"
                  className="w-full rounded-md border border-slate-200 bg-white pl-8 pr-3 py-2 text-[12.5px] placeholder:text-slate-300 focus:outline-none focus:border-[#319ED8]"
                />
              </div>
              <input
                placeholder="Tuning / setup notes (e.g. DADGAD, capo 3)"
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-[12.5px] placeholder:text-slate-300 focus:outline-none focus:border-[#319ED8]"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-1.5 px-4 py-2 border-t border-slate-100 bg-slate-50/60">
            <Check className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-emerald-600 text-[11px] font-medium">Saved</span>
          </div>
        </div>

        <p className="mt-4 text-slate-400 text-[11px] leading-relaxed">
          <span className="font-semibold text-slate-500">Idea:</span> three clear bands — who, what they did, and the gear they used. Auto-saves on blur, so no inline Save / red-x buttons fighting with data fields. Drag handle hints reordering. Trash sits at top-right where destructive actions belong.
        </p>
      </div>
    </div>
  );
}
