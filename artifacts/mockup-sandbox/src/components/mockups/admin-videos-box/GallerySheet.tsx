import React, { useState, useRef } from "react";
import {
  Plus,
  Link2,
  Trash2,
  ImagePlus,
  Play,
  UploadCloud,
  X,
  Video,
  ChevronRight,
} from "lucide-react";

// State preset: shows the GalleryGrid Vimeo-style "Add a video" sheet open
// on top of an empty Videos panel. Mirrors the sheet inside GalleryGrid.tsx
// so reviewers can see the add flow at a glance.

export function GallerySheet() {
  const [source, setSource] = useState<"upload" | "url">("upload");
  const [importLink, setImportLink] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const posterInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="min-h-screen bg-slate-50 p-8 flex items-start justify-center font-sans text-slate-900 relative">
      {/* Faded panel behind */}
      <div className="w-full max-w-3xl bg-white rounded-2xl border border-slate-200 shadow-sm p-6 opacity-50">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Videos</h2>
          <span className="flex items-center gap-1.5 text-sm font-medium text-[#319ED8]">
            Add video <Plus className="w-4 h-4" />
          </span>
        </div>
        <div className="w-full aspect-[16/9] rounded-xl border-2 border-dashed border-slate-200 bg-slate-50" />
      </div>

      {/* Sheet */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
          {/* Header */}
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
            <h3 className="font-semibold text-slate-900">Add a video</h3>
            <button className="text-slate-400 hover:text-slate-600 p-1 -m-1 rounded-md hover:bg-slate-100">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* Source toggle + dropzone */}
            <div className="p-5 pb-4">
              <div className="inline-flex p-0.5 rounded-lg bg-slate-100 mb-3 text-xs font-medium">
                <button
                  onClick={() => setSource("upload")}
                  className={
                    "px-3 py-1.5 rounded-md transition-colors " +
                    (source === "upload"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-700")
                  }
                >
                  Upload file
                </button>
                <button
                  onClick={() => setSource("url")}
                  className={
                    "px-3 py-1.5 rounded-md transition-colors " +
                    (source === "url"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-700")
                  }
                >
                  Import from URL
                </button>
              </div>

              {source === "upload" ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragActive(true);
                  }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragActive(false);
                  }}
                  className={
                    "w-full aspect-video rounded-xl border-2 border-dashed flex flex-col items-center justify-center transition-colors " +
                    (dragActive
                      ? "border-[#319ED8] bg-blue-50"
                      : "border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-slate-300")
                  }
                >
                  <UploadCloud className="w-8 h-8 mb-3 text-slate-400" />
                  <p className="text-sm font-medium text-slate-700">
                    Drop a video here, or click to browse
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    MP4, MOV, or WebM · up to 500MB
                  </p>
                </button>
              ) : (
                <div className="w-full aspect-video rounded-xl border border-slate-200 bg-slate-50 flex flex-col items-center justify-center p-6">
                  <Link2 className="w-7 h-7 text-slate-400 mb-3" />
                  <p className="text-sm font-medium text-slate-700 mb-3">
                    Paste a video link
                  </p>
                  <input
                    type="url"
                    placeholder="https://dropbox.com/… or direct .mp4 link"
                    value={importLink}
                    onChange={(e) => setImportLink(e.target.value)}
                    className="w-full max-w-md text-sm bg-white border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#319ED8] focus:ring-1 focus:ring-[#319ED8]/30"
                  />
                </div>
              )}
              <input ref={fileInputRef} type="file" className="hidden" />
            </div>

            {/* Details */}
            <div className="px-5 pb-2 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wide">
                  Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Live at the Troubadour — 2019"
                  className="w-full text-sm text-slate-900 bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#319ED8] focus:ring-1 focus:ring-[#319ED8]/30"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wide">
                  Description
                  <span className="ml-2 normal-case tracking-normal text-slate-400 text-[11px] font-normal">
                    optional
                  </span>
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="A short note that shows under the video on the album page."
                  rows={2}
                  className="w-full text-sm text-slate-900 bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#319ED8] focus:ring-1 focus:ring-[#319ED8]/30 resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wide">
                  Thumbnail
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => posterInputRef.current?.click()}
                    className="aspect-video w-28 rounded-lg border-2 border-dashed border-slate-200 hover:border-slate-300 hover:bg-slate-50 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                  {posterUrl ? (
                    <div className="relative aspect-video w-28 rounded-lg overflow-hidden border-2 border-[#319ED8]">
                      <img src={posterUrl} alt="" className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="aspect-video w-28 rounded-lg border border-slate-200 bg-gradient-to-br from-slate-100 to-slate-50 flex items-center justify-center text-slate-300">
                      <ImagePlus className="w-5 h-5" strokeWidth={1.5} />
                    </div>
                  )}
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="aspect-video w-28 rounded-lg border border-slate-200 bg-gradient-to-br from-slate-100 to-slate-50 opacity-40 flex items-center justify-center"
                    >
                      <Video className="w-4 h-4 text-slate-400" strokeWidth={1.5} />
                    </div>
                  ))}
                </div>
                <p className="text-xs text-slate-400 mt-2">
                  Pick a frame from the video — coming soon. For now, upload a still
                  (16:9, JPG or PNG).
                </p>
                <input ref={posterInputRef} type="file" className="hidden" />
              </div>
            </div>
          </div>

          {/* Footer — mirrors GalleryGrid's sheet footer (justify-between
              with a left slot reserved for "Delete video" in edit mode). */}
          <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between bg-slate-50/50 flex-shrink-0">
            <div />
            <div className="flex items-center gap-2">
              <button className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                Cancel
              </button>
              <button className="px-4 py-2 text-sm font-medium text-white bg-[#319ED8] hover:bg-[#2b8cc0] rounded-lg shadow-sm transition-colors flex items-center gap-1">
                Add video <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
