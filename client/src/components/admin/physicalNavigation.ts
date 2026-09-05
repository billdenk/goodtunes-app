export type PhysicalSubTab = "audio" | "art" | "fulfillment" | "downloads";

export const PHYSICAL_SUB_TABS: ReadonlyArray<{
  id: PhysicalSubTab;
  label: string;
}> = [
  { id: "audio", label: "Audio" },
  { id: "art", label: "Art" },
  { id: "fulfillment", label: "Fulfillment" },
];

export const PRESS_DOWNLOADS_SUB_TAB: {
  id: PhysicalSubTab;
  label: string;
} = { id: "downloads", label: "Downloads" };

export function physicalSubTabFromSearch(
  search: string,
  pressMode = false,
): PhysicalSubTab {
  const value = new URLSearchParams(search).get("ptab");
  return value === "art" || value === "fulfillment" || (value === "downloads" && pressMode)
    ? value
    : "audio";
}

export function canonicalPhysicalSearch(search: string, pressMode = false): string {
  const params = new URLSearchParams(search);
  const requested = params.get("ptab");
  if (requested && requested !== physicalSubTabFromSearch(search, pressMode)) {
    params.delete("ptab");
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function physicalSubTabsFor(pressMode: boolean) {
  return pressMode
    ? [...PHYSICAL_SUB_TABS, PRESS_DOWNLOADS_SUB_TAB]
    : [...PHYSICAL_SUB_TABS];
}