import React, { useState, useRef } from "react";
import {
  Video,
  Plus,
  Link2,
  Trash2,
  ImagePlus,
  Play,
  UploadCloud,
  X,
  AlertCircle,
  MoreHorizontal,
  Pencil,
  FileVideo
} from "lucide-react";

interface VideoData {
  id: string;
  title: string;
  videoUrl: string;
  posterUrl: string | null;
  status: "ready" | "uploading";
}

const FAKE_VIDEOS: VideoData[] = [
  {
    id: "v1",
    title: "Live at the Troubadour — 2019",
    videoUrl: "https://example.com/live.mp4",
    posterUrl: null,
    status: "ready",
  },
  {
    id: "v2",
    title: "Behind the album",
    videoUrl: "https://example.com/bts.mp4",
    posterUrl: "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?q=80&w=1600&auto=format&fit=crop",
    status: "ready",
  },
  {
    id: "v3",
    title: "Official video — 'Heart Skip'",
    videoUrl: "https://example.com/official.mp4",
    posterUrl: "https://images.unsplash.com/photo-1614680376593-902f74cf0d41?q=80&w=1600&auto=format&fit=crop",
    status: "ready",
  },
];

export function EditorModal() {
  const [videos, setVideos] = useState<VideoData[]>(FAKE_VIDEOS);
  const [editingVideoId, setEditingVideoId] = useState<string | null>("v1");
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newVideo: VideoData = {
        id: `v_${Date.now()}`,
        title: e.target.files[0].name,
        videoUrl: "",
        posterUrl: null,
        status: "uploading",
      };
      setVideos([newVideo, ...videos]);
      setTimeout(() => {
        setVideos((prev) =>
          prev.map((v) => (v.id === newVideo.id ? { ...v, status: "ready" } : v))
        );
      }, 3000);
    }
  };

  const handleImportUrl = () => {
    if (!importUrl.trim()) return;
    const newVideo: VideoData = {
      id: `v_${Date.now()}`,
      title: "Imported Video",
      videoUrl: importUrl,
      posterUrl: null,
      status: "ready",
    };
    setVideos([...videos, newVideo]);
    setImportModalOpen(false);
    setImportUrl("");
  };

  const handleUpdateVideo = (id: string, updates: Partial<VideoData>) => {
    setVideos((prev) =>
      prev.map((v) => (v.id === id ? { ...v, ...updates } : v))
    );
  };

  const handleDeleteVideo = (id: string) => {
    setVideos((prev) => prev.filter((v) => v.id !== id));
    if (editingVideoId === id) {
      setEditingVideoId(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-8 flex items-start justify-center font-sans text-slate-900">
      <div className="w-full max-w-3xl bg-white rounded-2xl border border-slate-200 shadow-sm p-6 relative">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Video className="w-5 h-5 text-slate-400" />
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">
              Videos
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setImportModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
            >
              <Link2 className="w-4 h-4" />
              Import from URL
            </button>
            <button
              onClick={handleUploadClick}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-[#319ED8] hover:bg-[#2b8cc0] rounded-md transition-colors shadow-sm"
            >
              <UploadCloud className="w-4 h-4" />
              Upload video
            </button>
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept="video/mp4,video/quicktime,video/webm"
              onChange={handleFileChange}
            />
          </div>
        </div>

        {/* List View */}
        <div className="space-y-2">
          {videos.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
              <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm border border-slate-100 mb-3">
                <FileVideo className="w-5 h-5 text-slate-400" />
              </div>
              <p className="text-sm font-medium text-slate-700">No videos yet</p>
              <p className="text-sm text-slate-500 mt-1 max-w-sm text-center">
                Upload short bonus videos, behind-the-scenes clips, or music
                videos. Up to 500MB each.
              </p>
            </div>
          ) : (
            videos.map((video) => (
              <div
                key={video.id}
                className="group flex items-center justify-between p-3 rounded-lg border border-slate-100 hover:border-slate-200 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  {/* Compact Thumbnail */}
                  <div className="w-16 h-9 rounded bg-slate-100 border border-slate-200 overflow-hidden flex-shrink-0 relative">
                    {video.status === "uploading" ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-slate-100">
                        <div className="w-4 h-4 border-2 border-[#319ED8] border-t-transparent rounded-full animate-spin"></div>
                      </div>
                    ) : video.posterUrl ? (
                      <img
                        src={video.posterUrl}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
                        <Video className="w-3.5 h-3.5 text-slate-400" />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-slate-900 truncate max-w-[400px]">
                      {video.title}
                    </span>
                    {video.status === "uploading" ? (
                      <span className="text-xs text-[#319ED8] font-medium">
                        Uploading...
                      </span>
                    ) : (
                      <span className="text-xs text-slate-500">Ready</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => setEditingVideoId(video.id)}
                    disabled={video.status === "uploading"}
                    className="p-1.5 text-slate-400 hover:text-slate-900 hover:bg-white rounded-md disabled:opacity-50"
                    title="Edit video"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Editor Modal Overlay */}
      {editingVideoId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <EditorModalContent
            video={videos.find((v) => v.id === editingVideoId)!}
            onClose={() => setEditingVideoId(null)}
            onUpdate={(updates) => handleUpdateVideo(editingVideoId, updates)}
            onDelete={() => handleDeleteVideo(editingVideoId)}
          />
        </div>
      )}

      {/* Import Modal */}
      {importModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-white rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">
                Import Video
              </h3>
              <button
                onClick={() => setImportModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Video URL
                </label>
                <input
                  type="url"
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  placeholder="https://dropbox.com/s/..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#319ED8]/20 focus:border-[#319ED8] transition-all"
                  autoFocus
                />
                <p className="text-xs text-slate-500 mt-2">
                  Paste a direct link to an MP4, or a Dropbox link.
                </p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setImportModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleImportUrl}
                  disabled={!importUrl.trim()}
                  className="px-4 py-2 text-sm font-medium text-white bg-[#319ED8] hover:bg-[#2b8cc0] rounded-lg disabled:opacity-50"
                >
                  Import
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Sub-component for the detail editor
function EditorModalContent({
  video,
  onClose,
  onUpdate,
  onDelete,
}: {
  video: VideoData;
  onClose: () => void;
  onUpdate: (updates: Partial<VideoData>) => void;
  onDelete: () => void;
}) {
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const posterInputRef = useRef<HTMLInputElement>(null);

  const handlePosterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const url = URL.createObjectURL(file);
      onUpdate({ posterUrl: url });
    }
  };

  return (
    <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50/50">
        <h3 className="text-sm font-medium text-slate-600">Edit Video</h3>
        <button
          onClick={onClose}
          className="p-1.5 text-slate-400 hover:text-slate-900 rounded-md transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="overflow-y-auto p-6 space-y-8 flex-1">
        {/* Large 16:9 Preview */}
        <div>
          <label className="block text-sm font-medium text-slate-900 mb-3">
            Video poster
          </label>
          <div className="relative group rounded-xl overflow-hidden bg-slate-100 border border-slate-200 aspect-video shadow-inner">
            {video.posterUrl ? (
              <img
                src={video.posterUrl}
                alt="Poster"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-slate-100 to-slate-200 flex flex-col items-center justify-center text-slate-400">
                <ImagePlus className="w-8 h-8 mb-2 opacity-50" />
                <span className="text-sm font-medium">No poster selected</span>
              </div>
            )}
            
            {/* Play Button Overlay (Visual only) */}
            {video.posterUrl && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-14 h-14 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center text-white/90 shadow-lg">
                  <Play className="w-6 h-6 ml-1" fill="currentColor" />
                </div>
              </div>
            )}

            {/* Editing Controls Overlay */}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 backdrop-blur-[2px]">
              <button
                onClick={() => posterInputRef.current?.click()}
                className="px-4 py-2 bg-white/90 hover:bg-white text-slate-900 text-sm font-medium rounded-lg shadow-sm transition-colors flex items-center gap-2"
              >
                <ImagePlus className="w-4 h-4" />
                {video.posterUrl ? "Replace poster" : "Upload poster"}
              </button>
              {video.posterUrl && (
                <button
                  onClick={() => onUpdate({ posterUrl: null })}
                  className="px-4 py-2 bg-slate-900/80 hover:bg-slate-900 text-white text-sm font-medium rounded-lg shadow-sm transition-colors"
                >
                  Remove
                </button>
              )}
            </div>
            <input
              type="file"
              ref={posterInputRef}
              className="hidden"
              accept="image/png,image/jpeg,image/webp"
              onChange={handlePosterChange}
            />
          </div>
          <p className="text-xs text-slate-500 mt-2">
            16:9 recommended. JPG, PNG, or WebP.
          </p>
        </div>

        {/* Title Input */}
        <div>
          <label className="block text-sm font-medium text-slate-900 mb-1.5">
            Title
          </label>
          <input
            type="text"
            value={video.title}
            onChange={(e) => onUpdate({ title: e.target.value })}
            className="w-full px-3 py-2 text-base border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#319ED8]/20 focus:border-[#319ED8] transition-all"
          />
        </div>
      </div>

      {/* Footer Bar */}
      <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
        {deleteConfirm ? (
          <div className="flex items-center gap-3 bg-red-50 px-3 py-2 rounded-lg border border-red-100">
            <AlertCircle className="w-4 h-4 text-red-600" />
            <span className="text-sm font-medium text-red-900">
              Delete this video?
            </span>
            <div className="flex items-center gap-2 ml-2">
              <button
                onClick={() => setDeleteConfirm(false)}
                className="text-sm text-red-600 hover:text-red-800 font-medium px-2 py-1"
              >
                Cancel
              </button>
              <button
                onClick={onDelete}
                className="text-sm bg-red-600 hover:bg-red-700 text-white font-medium px-3 py-1 rounded-md shadow-sm"
              >
                Delete
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setDeleteConfirm(true)}
            className="flex items-center gap-1.5 text-sm font-medium text-red-600 hover:bg-red-50 px-3 py-2 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Delete video
          </button>
        )}

        <button
          onClick={onClose}
          className="px-6 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg shadow-sm transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  );
}
