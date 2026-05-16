import React, { useState, useRef } from "react";
import { 
  Video, 
  Plus, 
  Link2, 
  Trash2, 
  Pencil, 
  ImagePlus, 
  Play, 
  UploadCloud, 
  MoreHorizontal,
  X as XIcon,
  Check
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface VideoData {
  id: string;
  title: string;
  videoUrl: string;
  posterUrl: string | null;
  status: "idle" | "uploading";
}

export function DropzoneFirst() {
  const [videos, setVideos] = useState<VideoData[]>([
    {
      id: "1",
      title: "Live at the Troubadour — 2019",
      videoUrl: "https://example.com/video1.mp4",
      posterUrl: "https://images.unsplash.com/photo-1516280440502-86311de1758f?w=800&q=80",
      status: "idle",
    },
    {
      id: "2",
      title: "Behind the album",
      videoUrl: "https://example.com/video2.mp4",
      posterUrl: null,
      status: "idle",
    }
  ]);

  const [isDragging, setIsDragging] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [importUrlOpen, setImportUrlOpen] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [posterPickId, setPosterPickId] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      simulateUpload(e.dataTransfer.files[0].name);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      simulateUpload(e.target.files[0].name);
    }
  };

  const simulateUpload = (filename: string) => {
    const newId = Math.random().toString();
    setVideos([...videos, {
      id: newId,
      title: filename,
      videoUrl: "uploading...",
      posterUrl: null,
      status: "uploading"
    }]);

    setTimeout(() => {
      setVideos(prev => prev.map(v => 
        v.id === newId ? { ...v, status: "idle", videoUrl: "https://example.com/new.mp4" } : v
      ));
    }, 2500);
  };

  const handleImportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!importUrl) return;
    setImportUrlOpen(false);
    
    const newId = Math.random().toString();
    setVideos([...videos, {
      id: newId,
      title: "Imported video",
      videoUrl: importUrl,
      posterUrl: null,
      status: "uploading"
    }]);

    setTimeout(() => {
      setVideos(prev => prev.map(v => 
        v.id === newId ? { ...v, status: "idle" } : v
      ));
    }, 1500);
    setImportUrl("");
  };

  const deleteVideo = () => {
    if (deleteId) {
      setVideos(videos.filter(v => v.id !== deleteId));
      setDeleteId(null);
    }
  };

  const updateTitle = (id: string, newTitle: string) => {
    setVideos(videos.map(v => v.id === id ? { ...v, title: newTitle } : v));
  };

  const removePoster = (id: string) => {
    setVideos(videos.map(v => v.id === id ? { ...v, posterUrl: null } : v));
  };

  return (
    <div className="min-h-screen bg-slate-50 p-8 flex items-start justify-center">
      <div className="w-full max-w-3xl bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Videos</h2>
            <p className="text-sm text-slate-500 mt-1">Bonus content, music videos, and behind-the-scenes clips.</p>
          </div>
        </div>

        <div className="space-y-10">
          {videos.length === 0 ? (
            <div 
              className={`w-full aspect-video rounded-xl border-2 border-dashed flex flex-col items-center justify-center transition-colors ${isDragging ? 'border-[#319ED8] bg-blue-50' : 'border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-slate-300'}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              role="button"
            >
              <UploadCloud className="w-10 h-10 text-slate-400 mb-4" />
              <p className="text-slate-600 font-medium">Drop a video here to upload</p>
              <p className="text-slate-500 text-sm mt-1 mb-4">MP4, MOV, or WebM up to 500MB</p>
              
              <div className="flex items-center gap-3">
                <button className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
                  Browse files
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); setImportUrlOpen(true); }}
                  className="px-4 py-2 bg-transparent text-sm font-medium text-[#319ED8] hover:text-[#319ED8]/80 flex items-center gap-1"
                >
                  <Link2 className="w-4 h-4" />
                  Paste a link
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-12">
              {videos.map(video => (
                <div key={video.id} className="group relative">
                  {video.status === "uploading" ? (
                    <div className="w-full aspect-video bg-slate-50 rounded-xl border border-slate-100 flex flex-col items-center justify-center">
                      <div className="w-8 h-8 border-2 border-slate-200 border-t-[#319ED8] rounded-full animate-spin mb-4" />
                      <p className="text-sm font-medium text-slate-600">Importing video…</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Video Poster/Player Thumbnail */}
                      <div className="w-full aspect-video rounded-xl border border-slate-200 overflow-hidden relative bg-slate-900 flex flex-col items-center justify-center group/poster">
                        {video.posterUrl ? (
                          <>
                            <img src={video.posterUrl} alt={video.title} className="w-full h-full object-cover opacity-80 group-hover/poster:opacity-60 transition-opacity" />
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                              <div className="w-16 h-16 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white">
                                <Play className="w-6 h-6 ml-1" fill="currentColor" />
                              </div>
                            </div>
                            
                            <div className="absolute top-4 right-4 opacity-0 group-hover/poster:opacity-100 transition-opacity flex items-center gap-2">
                              <button 
                                onClick={() => setPosterPickId(video.id)}
                                className="px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur-md text-white text-xs font-medium hover:bg-black/80 flex items-center gap-1.5"
                              >
                                <ImagePlus className="w-3.5 h-3.5" />
                                Change poster
                              </button>
                              <button 
                                onClick={() => removePoster(video.id)}
                                className="w-8 h-8 rounded-lg bg-black/60 backdrop-blur-md text-white hover:bg-red-600 flex items-center justify-center transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="absolute inset-0 bg-gradient-to-br from-slate-100 to-slate-200 flex flex-col items-center justify-center text-slate-400 group-hover/poster:from-slate-200 group-hover/poster:to-slate-300 transition-colors">
                            <ImagePlus className="w-10 h-10 mb-3 opacity-50" />
                            <p className="text-sm font-medium text-slate-500">No poster image</p>
                            <button 
                              onClick={() => setPosterPickId(video.id)}
                              className="mt-4 px-4 py-2 bg-white rounded-lg border border-slate-200 shadow-sm text-sm text-slate-700 font-medium hover:bg-slate-50"
                            >
                              Add poster
                            </button>
                          </div>
                        )}
                        
                        <div className="absolute top-4 left-4">
                          <span className="px-2.5 py-1 rounded-md bg-black/60 backdrop-blur-md text-white text-[10px] font-medium uppercase tracking-wider">
                            MP4
                          </span>
                        </div>
                      </div>

                      {/* Title & Actions */}
                      <div className="flex items-start justify-between gap-4 px-2">
                        <div className="flex-1">
                          <input 
                            type="text" 
                            value={video.title}
                            onChange={(e) => updateTitle(video.id, e.target.value)}
                            className="w-full text-lg font-medium text-slate-900 bg-transparent border-none focus:outline-none focus:ring-0 p-0 placeholder:text-slate-400"
                            placeholder="Video title"
                          />
                        </div>
                        
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500 flex-shrink-0">
                              <MoreHorizontal className="w-5 h-5" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onClick={() => setPosterPickId(video.id)}>
                              <ImagePlus className="w-4 h-4 mr-2" />
                              {video.posterUrl ? 'Change poster' : 'Add poster'}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              onClick={() => setDeleteId(video.id)}
                              className="text-red-600 focus:text-red-600 focus:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete video
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              <div 
                className={`w-full h-32 rounded-xl border-2 border-dashed flex flex-col items-center justify-center transition-colors ${isDragging ? 'border-[#319ED8] bg-blue-50' : 'border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-slate-300'}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                role="button"
              >
                <div className="flex items-center gap-2 text-slate-500 font-medium">
                  <Plus className="w-5 h-5" />
                  <span>Add another video</span>
                </div>
                <div className="flex items-center gap-3 mt-3">
                  <button 
                    onClick={(e) => { e.stopPropagation(); setImportUrlOpen(true); }}
                    className="text-sm text-[#319ED8] hover:underline flex items-center gap-1"
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    Import from URL
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileSelect} 
        accept="video/mp4,video/quicktime,video/webm" 
        className="hidden" 
      />

      <Dialog open={importUrlOpen} onOpenChange={setImportUrlOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Import video from URL</DialogTitle>
            <DialogDescription>
              Paste a direct link to an MP4 or a Dropbox sharing link.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleImportSubmit}>
            <div className="py-4">
              <input 
                type="url"
                required
                autoFocus
                placeholder="https://dropbox.com/s/..." 
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#319ED8] focus:border-transparent text-sm"
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
              />
            </div>
            <DialogFooter>
              <button 
                type="button" 
                onClick={() => setImportUrlOpen(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900"
              >
                Cancel
              </button>
              <button 
                type="submit"
                disabled={!importUrl}
                className="px-4 py-2 bg-[#319ED8] text-white rounded-lg text-sm font-medium hover:bg-[#319ED8]/90 disabled:opacity-50"
              >
                Import
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this video?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the video from the album. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={deleteVideo}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Stub Poster Picker Dialog */}
      <Dialog open={!!posterPickId} onOpenChange={(open) => !open && setPosterPickId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Update poster image</DialogTitle>
            <DialogDescription>
              Select a new thumbnail for this video.
            </DialogDescription>
          </DialogHeader>
          <div className="py-8 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
             <ImagePlus className="w-8 h-8 text-slate-400 mb-3" />
             <p className="text-sm font-medium text-slate-600">Click to browse or drag image here</p>
             <p className="text-xs text-slate-500 mt-1">16:9 JPG or PNG recommended</p>
          </div>
          <DialogFooter>
            <button 
              type="button" 
              onClick={() => setPosterPickId(null)}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              Close
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
