import hellbenderPlaceholder from "@assets/Hellbender_1782351633843.svg";
import memphisPlaceholder from "@assets/Memphis_Record_Pressing_1782406023011.svg";
import virylPlaceholder from "@assets/Viryl_1782351633843.svg";
import pmpPlaceholder from "@assets/Pressing_Music_Business_1782351633843.svg";

export const PRESS_PLACEHOLDER_BY_DOMAIN: Record<string, string> = {
  "hellbendervinyl.com": hellbenderPlaceholder,
  "memphisrecordpressing.com": memphisPlaceholder,
  "viryl.ca": virylPlaceholder,
  "physicalmusicproducts.com": pmpPlaceholder,
};

export function resolvePressPlaceholderArt(domain: string | null | undefined): string | null {
  if (!domain) return null;
  return PRESS_PLACEHOLDER_BY_DOMAIN[domain.toLowerCase().replace(/^www\./, "")] ?? null;
}
