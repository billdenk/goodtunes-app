// Task #3163 — generic side-pill consolidation for the Test & Certify overlay bar.
// The bar used to hardcode Memphis's layer vocabulary (Front/Back Cover,
// Front/Back Safety, Foil Stamping Front/Back). Hellbender templates ship other
// side-prefixed names (GT BACK BLEED LINE → zone "Back Bleed"), so grouping is
// now derived from the parsed zone name itself: any confidently-parsed zone
// (kind line/area) that starts with Front/Back/Spine folds into that side's
// dropdown pill, labeled by the remainder ("Back Bleed" → "Bleed" under Back).
// "Foil Stamping <side>" keeps its historical "Foil" label. Zones that parse as
// `other` (no LINE/AREA suffix) or carry no side word stay standalone pills —
// nothing is ever silently dropped from the bar.

export type SideName = 'Front' | 'Back' | 'Spine';
export const SIDE_NAMES: readonly SideName[] = ['Front', 'Back', 'Spine'];

// Zone display order — Memphis's canonical vocabulary keeps its exact order so
// existing certified templates render unchanged; unknown zones sort after,
// alphabetically.
export const ZONE_ORDER = ['Bleed', 'Cut', 'Spine', 'Front Cover', 'Back Cover', 'Front Safety', 'Back Safety', 'Artboard'];
export const zoneSort = (a: string, b: string): number => {
  const ia = ZONE_ORDER.indexOf(a); const ib = ZONE_ORDER.indexOf(b);
  return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
};

/** Parse a display zone into its side group + entry label, or null when the
 *  zone carries no side prefix (plain Bleed/Cut/Spine/Artboard stay standalone). */
export function parseSideZone(zone: string): { side: SideName; label: string } | null {
  const foil = /^Foil Stamping (Front|Back|Spine)$/.exec(zone);
  if (foil) return { side: foil[1] as SideName, label: 'Foil' };
  const m = /^(Front|Back|Spine) (.+)$/.exec(zone);
  if (m) return { side: m[1] as SideName, label: m[2] };
  return null;
}

export type SideGroup = { side: SideName; entries: Array<{ zone: string; label: string }> };

/** Group a template's parsed layers into side dropdowns.
 *  - `grouped` maps zone → its group assignment (zones absent stay standalone).
 *  - `groups` is Front → Back → Spine, entries in deterministic zoneSort order
 *    (Memphis: Cover, Safety, Foil — visually unchanged).
 *  A zone is only groupable when at least one of its layers parsed confidently
 *  (kind line/area); a side word inside an `other`-kind name is not enough. */
export function groupZonesForPills(layers: Array<{ zone: string; kind: 'line' | 'area' | 'other' }>): {
  grouped: Map<string, { side: SideName; label: string }>;
  groups: SideGroup[];
} {
  const confident = new Map<string, boolean>();
  for (const l of layers) confident.set(l.zone, (confident.get(l.zone) ?? false) || l.kind !== 'other');
  const grouped = new Map<string, { side: SideName; label: string }>();
  confident.forEach((ok, zone) => {
    if (!ok) return;
    const parsed = parseSideZone(zone);
    if (parsed) grouped.set(zone, parsed);
  });
  const groups = SIDE_NAMES
    .map((side) => ({
      side,
      entries: Array.from(grouped.entries())
        .filter(([, g]) => g.side === side)
        .sort(([a], [b]) => zoneSort(a, b))
        .map(([zone, g]) => ({ zone, label: g.label })),
    }))
    .filter((g) => g.entries.length > 0);
  return { grouped, groups };
}
