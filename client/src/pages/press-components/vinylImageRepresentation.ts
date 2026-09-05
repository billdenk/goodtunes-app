/** Pure image-representation contract shared by the vinyl UI and focused tests. */
export type ImageBackedSwatch = {
  customImg?: string;
  imageReviewed?: boolean;
};

export function isUnresolvedVinylImage(swatch: ImageBackedSwatch): boolean {
  return Boolean(swatch.customImg && swatch.imageReviewed !== true);
}

export function unresolvedVinylImageCount(swatches: ImageBackedSwatch[]): number {
  return swatches.filter(isUnresolvedVinylImage).length;
}

export function keepVinylImage<T extends ImageBackedSwatch>(swatch: T): T {
  return { ...swatch, imageReviewed: true };
}

export function replaceVinylImage<T extends ImageBackedSwatch>(swatch: T, customImg: string): T {
  return { ...swatch, customImg, imageReviewed: true };
}

export function generatedVinylReplacement<T extends ImageBackedSwatch>(swatch: T): Omit<T, "customImg"> {
  const { customImg: _removed, ...generated } = swatch;
  return generated;
}

export function validateVinylImageUpload(file: { type: string; size: number }): string | null {
  if (!["image/png", "image/webp"].includes(file.type)) return "Use a transparent PNG or WebP image.";
  if (file.size > 2 * 1024 * 1024) return "Image must be 2 MB or smaller.";
  return null;
}

export type ImageRepresentationMode = { conversionMode: boolean; compareOpen: boolean };

/** Opening/canceling leave the persisted image representation alone; only the
 * explicit build choice opens comparison and switches the center render. */
export function openImageRepresentation(): ImageRepresentationMode {
  return { conversionMode: false, compareOpen: false };
}
export function buildWithColors(): ImageRepresentationMode {
  return { conversionMode: true, compareOpen: true };
}
export function keepImageMode(): ImageRepresentationMode {
  return { conversionMode: false, compareOpen: false };
}

export function canSaveGeneratedVinylRepresentation(hasCustomImage: boolean, conversionMode: boolean): boolean {
  return !hasCustomImage || conversionMode;
}

export function canDismissVinylImageUpload(uploadSaving: boolean): boolean {
  return !uploadSaving;
}