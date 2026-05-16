import React, { useState, useRef } from "react";
import {
  Plus,
  Link2,
  Trash2,
  ImagePlus,
  Play,
  UploadCloud,
  Pencil,
  X,
  Loader2,
  Video,
  ChevronRight,
} from "lucide-react";

interface VideoData {
  id: string;
  title: string;
  description: string;
  videoUrl: string;
  posterUrl: string | null;
  status: "idle" | "uploading";
}

const INITIAL_VIDEOS: VideoData[] = [
  {
    id: "v1",
    title: "Live at the Troubadour — 2019",
    description:
      "Closing the second set with Heart Skip. Recorded by the venue and lightly remastered.",
    videoUrl: "https://example.com/live.mp4",
    posterUrl:
      "https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?auto=format&fit=crop&q=80&w=1600&h=900",
    status: "idle",
  },
];

type SheetMode =
  | { kind: "closed" }
  | { kind: "new" }
  | { kind: "edit"; id: string };

export function GalleryGrid() {
  const [videos, setVideos] = useState<VideoData[]>(INITIAL_VIDEOS);
  const [sheet, setSheet] = useState<SheetMode>({ kind: "closed" });
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-slate-50 p-8 flex items-start justify-center font-sans text-slate-900">
      <div className="w-full max-w-3xl bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        {/* Header: title + count + Add video button */}
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-baseline gap-3">
            <h2 className="text-lg font-semibold text-slate-900">Videos</h2>
            {videos.length > 0 && (
              <span className="text-sm text-slate-400">
                {videos.length} {videos.length === 1 ? "item" : "items"}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setSheet({ kind: "new" })}
            className="flex items-center gap-1.5 text-sm font-medium text-[#319ED8] hover:text-[#2b8cc0] transition-colors"
          >
            Add video
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Empty state OR grid */}
        {videos.length === 0 ? (
          <button
            type="button"
            onClick={() => setSheet({ kind: "new" })}
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
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-6">
            {videos.map((vid) => (
              <VideoTile
                key={vid.id}
                video={vid}
                onEdit={() => setSheet({ kind: "edit", id: vid.id })}
                onDelete={() => setDeleteConfirmId(vid.id)}
              />
            ))}
          </div>
        )}

        {/* Add / Edit Sheet */}
        {sheet.kind !== "closed" && (
          <VideoSheet
            video={
              sheet.kind === "edit"
                ? videos.find((v) => v.id === sheet.id) ?? null
                : null
            }
            onClose={() => setSheet({ kind: "closed" })}
            onSave={(next) => {
              if (sheet.kind === "edit") {
                setVideos((prev) =>
                  prev.map((v) => (v.id === sheet.id ? { ...v, ...next } : v)),
                );
              } else {
                const id = Math.random().toString(36).slice(2, 8);
                setVideos((prev) => [...prev, { id, ...next }]);
              }
              setSheet({ kind: "closed" });
            }}
            onDelete={() => {
              if (sheet.kind === "edit") {
                setDeleteConfirmId(sheet.id);
              }
            }}
          />
        )}

        {/* Delete confirmation */}
        {deleteConfirmId && (
          <DeleteSheet
            onCancel={() => setDeleteConfirmId(null)}
            onConfirm={() => {
              setVideos((prev) => prev.filter((v) => v.id !== deleteConfirmId));
              setDeleteConfirmId(null);
              setSheet({ kind: "closed" });
            }}
          />
        )}
      </div>
    </div>
  );
}

/* -------------------------- VideoTile -------------------------- */

function VideoTile({
  video,
  onEdit,
  onDelete,
}: {
  video: VideoData;
  onEdit: () => void;
  onDelete: () => void;
}) {
  // Thumbnail is a non-interactive surface so the hover-action buttons
  // (Edit / Delete) can be real <button> elements without nesting one
  // interactive element inside another. The title below remains the
  // primary keyboard target for opening the editor.
  return (
    <div className="flex flex-col gap-2.5 group/tile focus-within:[&_[data-hover-controls]]:opacity-100">
      <div className="relative aspect-[16/9] rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
        {video.status === "uploading" ? (
          <div className="absolute inset-0 bg-slate-50 flex flex-col items-center justify-center">
            <Loader2 className="w-5 h-5 text-[#319ED8] animate-spin mb-2" />
            <span className="text-xs font-medium text-slate-600">
              Importing video…
            </span>
          </div>
        ) : (
          <>
            {video.posterUrl ? (
              <img
                src={video.posterUrl}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-slate-200 to-slate-100 flex items-center justify-center">
                <Video
                  className="w-7 h-7 text-slate-300"
                  strokeWidth={1.5}
                />
              </div>
            )}

            {/* Play overlay — purely decorative */}
            <div className="absolute inset-0 bg-black/10 flex items-center justify-center opacity-0 group-hover/tile:opacity-100 transition-opacity pointer-events-none">
              <div className="w-11 h-11 bg-white/90 rounded-full flex items-center justify-center shadow-lg backdrop-blur-sm">
                <Play
                  className="w-4 h-4 text-slate-900 ml-0.5"
                  fill="currentColor"
                />
              </div>
            </div>

            {/* Hover-revealed controls. focus-within on the parent also
                reveals them so keyboard users can see + reach them. */}
            <div
              data-hover-controls
              className="absolute top-2.5 right-2.5 flex items-center gap-1 opacity-0 group-hover/tile:opacity-100 transition-opacity"
            >
              <button
                type="button"
                onClick={onEdit}
                aria-label={`Edit ${video.title}`}
                className="p-1.5 bg-white/90 backdrop-blur-md rounded-md shadow-sm border border-black/5 text-slate-600 hover:text-[#319ED8] hover:bg-white focus:outline-none focus:ring-2 focus:ring-[#319ED8]/40"
                title="Edit video"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={onDelete}
                aria-label={`Delete ${video.title}`}
                className="p-1.5 bg-white/90 backdrop-blur-md rounded-md shadow-sm border border-black/5 text-slate-600 hover:text-red-600 hover:bg-white focus:outline-none focus:ring-2 focus:ring-red-500/40"
                title="Delete video"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Title — primary keyboard target for opening the editor. */}
      <button
        type="button"
        onClick={onEdit}
        disabled={video.status === "uploading"}
        className="group/title flex items-start justify-between gap-3 text-left px-0.5 rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#319ED8]/40"
      >
        <h3
          className={
            "text-sm font-medium line-clamp-2 transition-colors " +
            (video.status === "uploading"
              ? "text-slate-400"
              : "text-slate-900 group-hover/title:text-[#319ED8]")
          }
        >
          {video.title}
        </h3>
        {video.status !== "uploading" && (
          <Pencil className="w-3.5 h-3.5 text-slate-300 opacity-0 group-hover/title:opacity-100 shrink-0 mt-0.5" />
        )}
      </button>
    </div>
  );
}

/* -------------------------- VideoSheet (Vimeo-style add/edit) -------------------------- */

function VideoSheet({
  video,
  onClose,
  onSave,
  onDelete,
}: {
  video: VideoData | null; // null = new
  onClose: () => void;
  onSave: (next: Omit<VideoData, "id">) => void;
  onDelete: () => void;
}) {
  const isEdit = !!video;
  const [title, setTitle] = useState(video?.title ?? "");
  const [description, setDescription] = useState(video?.description ?? "");
  const [posterUrl, setPosterUrl] = useState<string | null>(
    video?.posterUrl ?? null,
  );
  const [videoUrl, setVideoUrl] = useState(video?.videoUrl ?? "");
  // "source" only matters in "new" mode — controls which input is shown
  // before a file/url is committed.
  const [source, setSource] = useState<"upload" | "url">("upload");
  const [importLink, setImportLink] = useState("");
  const [dragActive, setDragActive] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const posterInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    setVideoUrl(URL.createObjectURL(file));
    if (!title) setTitle(file.name.replace(/\.[^/.]+$/, ""));
  };

  const handlePosterFile = (file: File) => {
    setPosterUrl(URL.createObjectURL(file));
  };

  const handleSave = () => {
    onSave({
      title: title || "Untitled video",
      description,
      videoUrl: videoUrl || importLink,
      posterUrl,
      status: "idle",
    });
  };

  const canSave = isEdit
    ? title.length > 0
    : (source === "upload" && videoUrl.length > 0) ||
      (source === "url" && importLink.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm">
      <div
        className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          <h3 className="font-semibold text-slate-900">
            {isEdit ? "Edit video" : "Add a video"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors p-1 -m-1 rounded-md hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          {/* Video preview / dropzone */}
          <div className="p-5 pb-4">
            {videoUrl || posterUrl ? (
              <div className="relative aspect-video rounded-xl overflow-hidden bg-slate-900 border border-slate-200">
                {posterUrl ? (
                  <img
                    src={posterUrl}
                    alt=""
                    className="w-full h-full object-cover opacity-90"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Video
                      className="w-10 h-10 text-slate-600"
                      strokeWidth={1.5}
                    />
                  </div>
                )}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-14 h-14 rounded-full bg-white/95 flex items-center justify-center shadow-lg">
                    <Play
                      className="w-5 h-5 text-slate-900 ml-1"
                      fill="currentColor"
                    />
                  </div>
                </div>
                {/* Replace video pill (only relevant after a file is picked) */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute bottom-3 right-3 text-xs font-medium px-2.5 py-1.5 rounded-md bg-white/95 backdrop-blur-md text-slate-700 hover:text-[#319ED8] shadow-sm border border-black/5"
                >
                  Replace video
                </button>
              </div>
            ) : (
              <>
                {/* Source toggle — pill */}
                <div className="inline-flex p-0.5 rounded-lg bg-slate-100 mb-3 text-xs font-medium">
                  <button
                    type="button"
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
                    type="button"
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
                      if (e.dataTransfer.files?.[0])
                        handleFile(e.dataTransfer.files[0]);
                    }}
                    className={
                      "w-full aspect-video rounded-xl border-2 border-dashed flex flex-col items-center justify-center transition-colors " +
                      (dragActive
                        ? "border-[#319ED8] bg-blue-50"
                        : "border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-slate-300")
                    }
                  >
                    <UploadCloud
                      className={
                        "w-8 h-8 mb-3 transition-colors " +
                        (dragActive ? "text-[#319ED8]" : "text-slate-400")
                      }
                    />
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
                      autoFocus
                      placeholder="https://dropbox.com/… or direct .mp4 link"
                      value={importLink}
                      onChange={(e) => setImportLink(e.target.value)}
                      className="w-full max-w-md text-sm bg-white border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#319ED8] focus:ring-1 focus:ring-[#319ED8]/30"
                    />
                  </div>
                )}
              </>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,video/quicktime,video/webm"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) handleFile(e.target.files[0]);
              }}
            />
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

            {/* Thumbnail */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wide">
                Thumbnail
              </label>
              <div className="flex items-center gap-2">
                {/* Upload tile */}
                <button
                  type="button"
                  onClick={() => posterInputRef.current?.click()}
                  className="aspect-video w-28 rounded-lg border-2 border-dashed border-slate-200 hover:border-slate-300 hover:bg-slate-50 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
                  title="Upload custom thumbnail"
                >
                  <Plus className="w-5 h-5" />
                </button>
                {/* Current thumbnail */}
                {posterUrl ? (
                  <div className="relative aspect-video w-28 rounded-lg overflow-hidden border-2 border-[#319ED8]">
                    <img
                      src={posterUrl}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setPosterUrl(null)}
                      className="absolute top-1 right-1 p-0.5 rounded-full bg-white/90 hover:bg-white text-slate-600 hover:text-red-600 shadow-sm"
                      title="Remove thumbnail"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <div className="aspect-video w-28 rounded-lg border border-slate-200 bg-gradient-to-br from-slate-100 to-slate-50 flex items-center justify-center text-slate-300">
                    <ImagePlus className="w-5 h-5" strokeWidth={1.5} />
                  </div>
                )}
                {/* Disabled "from video" frames — placeholder for future */}
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="aspect-video w-28 rounded-lg border border-slate-200 bg-gradient-to-br from-slate-100 to-slate-50 opacity-40 flex items-center justify-center"
                    title="Frames from video (coming soon)"
                  >
                    <Video
                      className="w-4 h-4 text-slate-400"
                      strokeWidth={1.5}
                    />
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Pick a frame from the video — coming soon. For now, upload a
                still (16:9, JPG or PNG).
              </p>
              <input
                ref={posterInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0])
                    handlePosterFile(e.target.files[0]);
                }}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between bg-slate-50/50 flex-shrink-0">
          <div>
            {isEdit && (
              <button
                type="button"
                onClick={onDelete}
                className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-red-600 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete video
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              className="px-4 py-2 text-sm font-medium text-white bg-[#319ED8] hover:bg-[#2b8cc0] disabled:bg-slate-300 disabled:cursor-not-allowed rounded-lg shadow-sm transition-colors flex items-center gap-1"
            >
              {isEdit ? "Save" : "Add video"}
              {!isEdit && <ChevronRight className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------- DeleteSheet -------------------------- */

function DeleteSheet({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="p-6">
          <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-4">
            <Trash2 className="w-6 h-6 text-red-600" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">
            Delete this video?
          </h3>
          <p className="text-sm text-slate-500 mb-6">
            This will remove the video from the album. This action cannot be
            undone.
          </p>
          <div className="flex gap-3 w-full">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
