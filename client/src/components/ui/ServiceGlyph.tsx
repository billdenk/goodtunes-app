import { SERVICE_GLYPH, type StreamingServiceId } from "@/lib/streamingService";

interface ServiceGlyphBadgeProps {
  id: StreamingServiceId;
}

// Shared brand badge for streaming-service handoff menus (Task #816). Renders
// the rounded tile + brand icon/letter from the central SERVICE_GLYPH registry
// so the in-album picker sheet and the Account settings sheet can never drift.
export function ServiceGlyphBadge({ id }: ServiceGlyphBadgeProps) {
  const glyph = SERVICE_GLYPH[id];
  return (
    <div
      className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
      style={{ background: "rgba(255,255,255,0.08)" }}
    >
      {glyph.kind === "icon" ? (
        <glyph.Icon className="w-5 h-5" style={{ color: glyph.color }} />
      ) : (
        <span
          className="font-bold leading-none"
          style={{ color: glyph.color, fontSize: "1.1rem" }}
        >
          {glyph.letter}
        </span>
      )}
    </div>
  );
}
