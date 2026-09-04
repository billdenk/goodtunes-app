export const DEFAULT_TEMPLATE_OPACITY = 0.55;

export function templateCompositeStyle(hasArtwork: boolean, opacity: number) {
  return {
    opacity: hasArtwork ? opacity : 1,
    mixBlendMode: hasArtwork ? 'multiply' as const : 'normal' as const,
  };
}