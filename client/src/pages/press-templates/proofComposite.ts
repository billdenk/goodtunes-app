export const DEFAULT_TEMPLATE_OPACITY = 0.55;

export function templateCompositeStyle(hasArtwork: boolean, opacity: number) {
  return {
    opacity: hasArtwork ? opacity : 1,
    mixBlendMode: hasArtwork ? 'multiply' as const : 'normal' as const,
  };
}

/** Canon paint order shared by the live viewer and downloaded proof. */
export function proofCompositeOrder(hasArtwork: boolean, showTemplate: boolean) {
  return [
    'surface',
    ...(hasArtwork ? ['art' as const] : []),
    ...((!hasArtwork || showTemplate) ? ['template' as const] : []),
    'overlays',
  ] as const;
}

/** Exactly one template raster paints in the visible proof at any moment. */
export function selectTemplateRaster({
  hasFullSharp,
  hasCropSharp,
  fullView,
  zoom,
}: {
  hasFullSharp: boolean;
  hasCropSharp: boolean;
  fullView: boolean;
  zoom: number;
}) {
  if (fullView && zoom > 1 && hasFullSharp) return 'full' as const;
  if (!fullView && hasCropSharp) return 'crop' as const;
  return 'base' as const;
}