import React, { useState, useRef, useEffect } from "react";
import {
  Video,
  Plus,
  Link2,
  Trash2,
  ImagePlus,
  Play,
  UploadCloud,
  MoreHorizontal,
  Pencil,
  X,
  Loader2,
  Check,
} from "lucide-react";

interface VideoData {
  id: string;
  title: string;
  videoUrl: string;
  posterUrl: string | null;
  status: "idle" | "uploading";
}

const INITIAL_VIDEOS: VideoData[] = [
  {
    id: "v1",
    title: "Live at the Troubadour — 2019",
    videoUrl: "https://example.com/live.mp4",
    posterUrl: "https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?auto=format&fit=crop&q=80&w=1600&h=900",
    status: "idle",
  },
  {
    id: "v2",
    title: "Behind the album",
    videoUrl: "https://example.com/bts.mp4",
    posterUrl: null,
    status: "idle",
  },
];

export function GalleryGrid() {
  const [videos, setVideos] = useState<VideoData[]>(INITIAL_VIDEOS);
  const [dragActive, setDragActive] = useState(false);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [editingTitleValue, setEditingTitleValue] = useState("");

  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importUrl, setImportUrl] = useState("");

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const posterInputRef = useRef<HTMLInputElement>(null);
  const [activePosterVideoId, setActivePosterVideoId] = useState<string | null>(null);

  // Handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      simulateUpload(e.dataTransfer.files[0].name);
    }
  };
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      simulateUpload(e.target.files[0].name);
    }
  };

  const simulateUpload = (filename: string) => {
    const id = Math.random().toString(36).substring(7);
    const newVid: VideoData = {
      id,
      title: filename.replace(/\.[^/.]+$/, ""),
      videoUrl: "",
      posterUrl: null,
      status: "uploading",
    };
    setVideos((prev) => [...prev, newVid]);
    setTimeout(() => {
      setVideos((prev) =>
        prev.map((v) =>
          v.id === id ? { ...v, status: "idle", videoUrl: "https://example.com/new.mp4" } : v
        )
      );
    }, 2000);
  };

  const handleImportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!importUrl) return;
    setImportModalOpen(false);
    setImportUrl("");
    const id = Math.random().toString(36).substring(7);
    const newVid: VideoData = {
      id,
      title: "Imported video",
      videoUrl: importUrl,
      posterUrl: null,
      status: "uploading",
    };
    setVideos((prev) => [...prev, newVid]);
    setTimeout(() => {
      setVideos((prev) =>
        prev.map((v) =>
          v.id === id ? { ...v, status: "idle" } : v
        )
      );
    }, 1500);
  };

  const saveTitle = (id: string) => {
    setVideos((prev) =>
      prev.map((v) => (v.id === id ? { ...v, title: editingTitleValue || "Untitled" } : v))
    );
    setEditingTitleId(null);
  };

  const confirmDelete = (id: string) => {
    setVideos((prev) => prev.filter((v) => v.id !== id));
    setDeleteConfirmId(null);
  };

  const handlePosterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && activePosterVideoId) {
      const url = URL.createObjectURL(e.target.files[0]);
      setVideos((prev) =>
        prev.map((v) => (v.id === activePosterVideoId ? { ...v, posterUrl: url } : v))
      );
    }
    setActivePosterVideoId(null);
    if (posterInputRef.current) posterInputRef.current.value = "";
  };

  const removePoster = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setVideos((prev) => prev.map((v) => (v.id === id ? { ...v, posterUrl: null } : v)));
  };

  return (
    <div className="min-h-screen bg-slate-50 p-8 flex items-start justify-center font-sans text-slate-900">
      <div className="w-full max-w-3xl bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Videos</h2>
          <span className="text-sm text-slate-500">{videos.length} items</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Add Tile */}
          <div className="flex flex-col rounded-xl overflow-hidden border border-slate-200 bg-slate-50 relative aspect-[16/9] sm:aspect-auto sm:h-auto">
            {/* Top Half: Drop / Browse */}
            <div
              className={`flex-1 flex flex-col items-center justify-center p-4 transition-colors cursor-pointer border-b border-slate-200 group ${
                dragActive ? "bg-blue-50 border-[#319ED8]" : "hover:bg-slate-100"
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <UploadCloud
                className={`w-6 h-6 mb-2 transition-colors ${
                  dragActive ? "text-[#319ED8]" : "text-slate-400 group-hover:text-slate-600"
                }`}
              />
              <span className="text-sm font-medium text-slate-700">Upload video</span>
              <span className="text-xs text-slate-500 mt-1 hidden sm:block">
                Drag file here or click to browse
              </span>
              <span className="text-xs text-slate-400 mt-0.5 hidden sm:block">Up to 500MB</span>
            </div>

            {/* Bottom Half: Import URL */}
            <div
              className="flex-1 flex items-center justify-center p-4 bg-white hover:bg-slate-50 cursor-pointer transition-colors group"
              onClick={() => setImportModalOpen(true)}
            >
              <div className="flex items-center gap-2">
                <Link2 className="w-5 h-5 text-slate-400 group-hover:text-slate-600 transition-colors" />
                <span className="text-sm font-medium text-slate-700">Import from URL</span>
              </div>
            </div>

            {/* Hidden inputs */}
            <input
              type="file"
              className="hidden"
              ref={fileInputRef}
              accept="video/mp4,video/quicktime,video/webm"
              onChange={handleFileChange}
            />
          </div>

          {/* Video Tiles */}
          {videos.map((vid) => (
            <div key={vid.id} className="flex flex-col gap-3 group">
              <div className="relative aspect-[16/9] rounded-xl overflow-hidden border border-slate-200 bg-slate-100 shadow-sm">
                {vid.status === "uploading" ? (
                  <div className="absolute inset-0 bg-slate-50 flex flex-col items-center justify-center">
                    <Loader2 className="w-6 h-6 text-[#319ED8] animate-spin mb-3" />
                    <span className="text-sm font-medium text-slate-600">Importing video...</span>
                  </div>
                ) : (
                  <>
                    {/* Poster */}
                    {vid.posterUrl ? (
                      <img
                        src={vid.posterUrl}
                        alt={vid.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-slate-200 to-slate-100 flex items-center justify-center">
                        <Video className="w-8 h-8 text-slate-300" strokeWidth={1.5} />
                      </div>
                    )}

                    {/* Play Overlay (visual only) */}
                    <div className="absolute inset-0 bg-black/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                      <div className="w-12 h-12 bg-white/90 rounded-full flex items-center justify-center shadow-lg backdrop-blur-sm">
                        <Play className="w-5 h-5 text-slate-900 ml-1" fill="currentColor" />
                      </div>
                    </div>

                    {/* Poster Picker Pill */}
                    <div className="absolute top-3 left-3 z-10">
                      {vid.posterUrl ? (
                        <div className="flex items-center bg-white/90 backdrop-blur-md rounded-md p-1 shadow-sm border border-black/5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => {
                              setActivePosterVideoId(vid.id);
                              posterInputRef.current?.click();
                            }}
                            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-sm transition-colors"
                            title="Change poster"
                          >
                            <ImagePlus className="w-3.5 h-3.5" />
                          </button>
                          <div className="w-px h-4 bg-slate-200 mx-0.5" />
                          <button
                            onClick={(e) => removePoster(vid.id, e)}
                            className="p-1.5 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-sm transition-colors"
                            title="Remove poster"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setActivePosterVideoId(vid.id);
                            posterInputRef.current?.click();
                          }}
                          className="flex items-center gap-1.5 bg-white/90 backdrop-blur-md rounded-md px-2.5 py-1.5 shadow-sm border border-black/5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white text-slate-700 text-xs font-medium"
                        >
                          <ImagePlus className="w-3.5 h-3.5 text-slate-500" />
                          Add poster
                        </button>
                      )}
                    </div>

                    {/* Delete button */}
                    <div className="absolute top-3 right-3 z-10">
                      <button
                        onClick={() => setDeleteConfirmId(vid.id)}
                        className="p-2 bg-white/90 backdrop-blur-md rounded-md shadow-sm border border-black/5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white hover:text-red-600 text-slate-600"
                        title="Delete video"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Title & Metadata */}
              <div className="px-1 flex flex-col">
                {editingTitleId === vid.id ? (
                  <form
                    className="flex items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      saveTitle(vid.id);
                    }}
                  >
                    <input
                      autoFocus
                      className="flex-1 text-sm font-medium bg-white border border-[#319ED8] rounded-md px-2 py-1 outline-none ring-2 ring-[#319ED8]/20"
                      value={editingTitleValue}
                      onChange={(e) => setEditingTitleValue(e.target.value)}
                      onBlur={() => saveTitle(vid.id)}
                    />
                  </form>
                ) : (
                  <div
                    className="group/title flex items-start justify-between gap-4 cursor-pointer"
                    onClick={() => {
                      if (vid.status === "uploading") return;
                      setEditingTitleId(vid.id);
                      setEditingTitleValue(vid.title);
                    }}
                  >
                    <h3
                      className={`text-sm font-medium line-clamp-2 ${
                        vid.status === "uploading" ? "text-slate-400" : "text-slate-900 group-hover/title:text-[#319ED8]"
                      } transition-colors`}
                    >
                      {vid.title}
                    </h3>
                    {vid.status !== "uploading" && (
                      <Pencil className="w-3.5 h-3.5 text-slate-300 opacity-0 group-hover/title:opacity-100 shrink-0 mt-0.5" />
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Hidden Poster Input */}
        <input
          type="file"
          className="hidden"
          ref={posterInputRef}
          accept="image/jpeg,image/png,image/webp"
          onChange={handlePosterChange}
        />

        {/* Import URL Modal */}
        {importModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <div
              className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-semibold text-slate-900">Import Video</h3>
                <button
                  onClick={() => setImportModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleImportSubmit} className="p-5">
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Video URL
                </label>
                <input
                  type="url"
                  autoFocus
                  required
                  placeholder="https://dropbox.com/... or .mp4 link"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-[#319ED8] focus:ring-1 focus:ring-[#319ED8]/30 mb-6"
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                />
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setImportModalOpen(false)}
                    className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm font-medium text-white bg-[#319ED8] hover:bg-[#2b8cc0] rounded-lg shadow-sm transition-colors"
                  >
                    Import
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {deleteConfirmId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <div
              className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200"
            >
              <div className="p-6">
                <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-4">
                  <Trash2 className="w-6 h-6 text-red-600" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">Delete this video?</h3>
                <p className="text-sm text-slate-500 mb-6">
                  This will remove the video from the album. This action cannot be undone.
                </p>
                <div className="flex gap-3 w-full">
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmId(null)}
                    className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => confirmDelete(deleteConfirmId)}
                    className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
