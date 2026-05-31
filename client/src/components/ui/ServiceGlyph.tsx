import {
  SERVICE_LOGO,
  serviceLabel,
  type StreamingServiceId,
} from "@/lib/streamingService";

interface ServiceGlyphBadgeProps {
  id: StreamingServiceId;
}

// Shared brand badge for streaming-service handoff menus (Task #816). Renders
// the service's official app-icon SVG from the central SERVICE_LOGO registry so
// the in-album picker sheet and the Account settings sheet can never drift —
// and so they match the artist "How to Play" sheet, all from one source. Each
// SVG carries its own brand color + rounded tile, so no extra container is
// needed (and none is added, per identity guidelines).
export function ServiceGlyphBadge({ id }: ServiceGlyphBadgeProps) {
  return (
    <img
      src={SERVICE_LOGO[id]}
      alt={serviceLabel(id)}
      width={32}
      height={32}
      className="w-8 h-8 rounded-xl flex-shrink-0 block"
    />
  );
}
