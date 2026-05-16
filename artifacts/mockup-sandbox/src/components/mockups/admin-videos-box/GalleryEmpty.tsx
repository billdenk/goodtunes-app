import React, { useState } from "react";
import { Plus } from "lucide-react";

export function GalleryEmpty() {
  const [_, setOpen] = useState(false);
  return (
    <div className="min-h-screen bg-slate-50 p-8 flex items-start justify-center font-sans text-slate-900">
      <div className="w-full max-w-3xl bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-baseline gap-3">
            <h2 className="text-lg font-semibold text-slate-900">Videos</h2>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex items-center gap-1.5 text-sm font-medium text-[#319ED8] hover:text-[#2b8cc0] transition-colors"
          >
            Add video
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full aspect-[16/9] rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-slate-300 transition-colors flex flex-col items-center justify-center group"
        >
          <div className="w-12 h-12 rounded-full bg-white border border-slate-200 group-hover:border-[#319ED8]/30 flex items-center justify-center mb-3 transition-colors shadow-sm">
            <Plus className="w-5 h-5 text-slate-400 group-hover:text-[#319ED8] transition-colors" />
          </div>
          <p className="text-sm font-medium text-slate-700">
            Click to add your first video
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Upload an MP4, or paste a link
          </p>
        </button>
      </div>
    </div>
  );
}
