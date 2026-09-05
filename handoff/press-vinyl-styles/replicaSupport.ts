import { useEffect, useState } from 'react';

export type OfferOption = { id: string; label: string; note: string };
export type VinylSwatch = {
  id: string;
  name: string;
  kind: 'black' | 'opaque' | 'translucent' | 'splatter';
  base: string;
  s1?: string;
  s2?: string;
  s3?: string;
  sizes: Array<'7"' | '10"' | '12"'>;
  customImg?: string;
  splatterTranslucent?: boolean;
  gen?: {
    styleId: string;
    colors: string[];
    option?: string;
    splatterCount?: number;
    baseKind?: 'opaque' | 'translucent';
    locations?: number[];
  };
  hidden?: boolean;
};
export type VinylComponentConfig = {
  categories: Array<{
    id: string;
    name: string;
    kind: VinylSwatch['kind'];
    swatches: VinylSwatch[];
    sizes: VinylSwatch['sizes'];
    genStyleId?: string;
    offeredFinishes?: string[];
    hidden?: boolean;
    customImg?: string;
  }>;
  weights: OfferOption[];
  sizeOptions: OfferOption[];
  quantities: OfferOption[];
  weightsBySize?: Record<string, OfferOption[]>;
  quantitiesBySize?: Record<string, OfferOption[]>;
};
export type PressComponentsPayload = {
  canEdit: boolean;
  press: {
    id: string;
    name: string;
    logoUrl: string | null;
    lightLogoUrl: string | null;
    squareLogoUrl: string | null;
    lightSquareLogoUrl: string | null;
    identityIconUrl: string | null;
    labelLogoUrl: string | null;
    labelBgColor: string | null;
  };
  vinyl: VinylComponentConfig;
};

export function useAdminDark() {
  const read = () => document.documentElement.classList.contains('dark') || document.documentElement.classList.contains('gt-admin-dark');
  const [dark, setDark] = useState(read);
  useEffect(() => {
    const observer = new MutationObserver(() => setDark(read()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

const CODE_TOKEN = /\b[A-Z]{1,3}\d{2,3}\b/;
export function displayPressColorName(name: string | null | undefined): string | null {
  const value = (name ?? '').trim();
  return value && !CODE_TOKEN.test(value) ? value : null;
}

export async function postAdminImage(file: File, _options?: { mask?: string; noun?: string }): Promise<{ url: string }> {
  return { url: URL.createObjectURL(file) };
}

export function resolvePressMarkLogo(press: PressComponentsPayload['press']): string | null {
  return press.labelLogoUrl || press.squareLogoUrl || press.logoUrl || press.lightLogoUrl || press.identityIconUrl || null;
}