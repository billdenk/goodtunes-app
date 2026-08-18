// Task #3163 — the overlay bar's side-pill consolidation must be generic:
// any press's side-prefixed GT layers fold into Front/Back/Spine dropdowns,
// Memphis's canonical vocabulary keeps its exact order, and anything that
// can't be grouped confidently stays a standalone pill (never dropped).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupZonesForPills, parseSideZone, zoneSide, pickSideFocusZone } from './sidePillGroups';

type L = { zone: string; kind: 'line' | 'area' | 'other' };
const line = (zone: string): L => ({ zone, kind: 'line' });
const area = (zone: string): L => ({ zone, kind: 'area' });
const other = (zone: string): L => ({ zone, kind: 'other' });

test('parseSideZone: side prefixes, Foil mapping, side-less zones', () => {
  assert.deepEqual(parseSideZone('Back Bleed'), { side: 'Back', label: 'Bleed' });
  assert.deepEqual(parseSideZone('Front Cover'), { side: 'Front', label: 'Cover' });
  assert.deepEqual(parseSideZone('Spine Text'), { side: 'Spine', label: 'Text' });
  assert.deepEqual(parseSideZone('Foil Stamping Front'), { side: 'Front', label: 'Foil' });
  assert.equal(parseSideZone('Bleed'), null);
  assert.equal(parseSideZone('Cut'), null);
  assert.equal(parseSideZone('Spine'), null); // bare Spine zone stays standalone
  assert.equal(parseSideZone('Artboard'), null);
});

test('Memphis vocabulary: Cover, Safety, Foil under Front and Back, in that order', () => {
  const { grouped, groups } = groupZonesForPills([
    line('Bleed'), line('Cut'), line('Spine'),
    line('Front Cover'), area('Front Safety'), line('Foil Stamping Front'),
    line('Back Cover'), area('Back Safety'), line('Foil Stamping Back'),
  ]);
  assert.deepEqual(groups.map((g) => g.side), ['Front', 'Back']);
  assert.deepEqual(groups[0].entries, [
    { zone: 'Front Cover', label: 'Cover' },
    { zone: 'Front Safety', label: 'Safety' },
    { zone: 'Foil Stamping Front', label: 'Foil' },
  ]);
  assert.deepEqual(groups[1].entries, [
    { zone: 'Back Cover', label: 'Cover' },
    { zone: 'Back Safety', label: 'Safety' },
    { zone: 'Foil Stamping Back', label: 'Foil' },
  ]);
  // Global zones stay standalone
  for (const z of ['Bleed', 'Cut', 'Spine']) assert.equal(grouped.has(z), false);
});

test('Hellbender vocabulary: side-prefixed Bleed/Cut consolidate with stripped labels', () => {
  const { grouped, groups } = groupZonesForPills([
    line('Back Bleed'), line('Back Cut'), line('Front Bleed'), line('Front Cut'),
  ]);
  assert.deepEqual(groups.map((g) => g.side), ['Front', 'Back']);
  assert.deepEqual(groups[0].entries, [
    { zone: 'Front Bleed', label: 'Bleed' },
    { zone: 'Front Cut', label: 'Cut' },
  ]);
  assert.deepEqual(groups[1].entries, [
    { zone: 'Back Bleed', label: 'Bleed' },
    { zone: 'Back Cut', label: 'Cut' },
  ]);
  assert.equal(grouped.size, 4);
});

test('Spine-prefixed zones get their own group', () => {
  const { groups } = groupZonesForPills([line('Spine Text'), line('Front Cover')]);
  assert.deepEqual(groups.map((g) => g.side), ['Front', 'Spine']);
  assert.deepEqual(groups[1].entries, [{ zone: 'Spine Text', label: 'Text' }]);
});

test('other-kind zones are never grouped, even with a side word', () => {
  const { grouped, groups } = groupZonesForPills([
    other('Back Registration'), // no LINE/AREA suffix — low confidence, standalone
    line('Back Cut'),
  ]);
  assert.equal(grouped.has('Back Registration'), false);
  assert.deepEqual(groups, [{ side: 'Back', entries: [{ zone: 'Back Cut', label: 'Cut' }] }]);
});

test('a zone with BOTH an other-kind and a line-kind layer groups (any confident layer counts)', () => {
  const { grouped } = groupZonesForPills([other('Back Bleed'), line('Back Bleed')]);
  assert.deepEqual(grouped.get('Back Bleed'), { side: 'Back', label: 'Bleed' });
});

// ── Task #3168 — view chips + focus crop generalize by side ──

test('zoneSide: side-prefixed zones, bare Spine, side-less zones', () => {
  assert.equal(zoneSide('Front Cover'), 'Front');
  assert.equal(zoneSide('Back Bleed'), 'Back');
  assert.equal(zoneSide('Foil Stamping Back'), 'Back');
  assert.equal(zoneSide('Spine'), 'Spine'); // bare Memphis Spine zone counts for the Spine view
  assert.equal(zoneSide('Spine Text'), 'Spine');
  assert.equal(zoneSide('Bleed'), null);
  assert.equal(zoneSide('Cut'), null);
  assert.equal(zoneSide('Artboard'), null);
});

test('pickSideFocusZone: Memphis picks the Cover box exactly as before', () => {
  const zones = ['Bleed', 'Cut', 'Spine', 'Front Cover', 'Front Safety', 'Back Cover', 'Back Safety', 'Foil Stamping Front'];
  assert.equal(pickSideFocusZone(zones, 'Front'), 'Front Cover');
  assert.equal(pickSideFocusZone(zones, 'Back'), 'Back Cover');
  assert.equal(pickSideFocusZone(zones, 'Spine'), 'Spine');
});

test('pickSideFocusZone: Hellbender-style falls back Cut → Bleed → Safe', () => {
  assert.equal(pickSideFocusZone(['Front Cut', 'Front Bleed', 'Front Safe'], 'Front'), 'Front Cut');
  assert.equal(pickSideFocusZone(['Back Bleed', 'Back Safe'], 'Back'), 'Back Bleed');
  assert.equal(pickSideFocusZone(['Back Safe'], 'Back'), 'Back Safe');
  assert.equal(pickSideFocusZone(['Front Safety'], 'Front'), 'Front Safety');
});

test('pickSideFocusZone: unknown labels still focus (deterministic), missing side = null', () => {
  assert.equal(pickSideFocusZone(['Front Weird', 'Front Odd'], 'Front'), 'Front Odd'); // zoneSort tiebreak
  assert.equal(pickSideFocusZone(['Bleed', 'Cut', 'Artboard'], 'Front'), null);
  assert.equal(pickSideFocusZone([], 'Spine'), null);
});

test('pickSideFocusZone: global zones never leak into a side', () => {
  assert.equal(pickSideFocusZone(['Bleed', 'Cut', 'Back Cut'], 'Back'), 'Back Cut');
  assert.equal(pickSideFocusZone(['Spine Text'], 'Spine'), 'Spine Text');
});

test('nothing vanishes: every zone is either grouped or standalone', () => {
  const layers = [
    line('Bleed'), line('Back Bleed'), other('Front Weird'), area('Spine Area Thing'), line('Artboard'),
  ];
  const { grouped } = groupZonesForPills(layers);
  const zones = new Set(layers.map((l) => l.zone));
  const standalone = [...zones].filter((z) => !grouped.has(z));
  assert.equal(grouped.size + standalone.length, zones.size);
  assert.ok(standalone.includes('Front Weird')); // other-kind stays visible as its own pill
});

// ── Task #3173 — family (prefix) grouping ──

test('Center Holes Bleed/Cut/Safety form one family group', () => {
  const { familyGroups, familyGrouped } = groupZonesForPills([
    line('Center Holes Bleed'),
    line('Center Holes Cut'),
    area('Center Holes Safety'),
    line('Bleed'),
  ]);
  assert.equal(familyGroups.length, 1);
  assert.equal(familyGroups[0].prefix, 'Center Holes');
  assert.deepEqual(
    familyGroups[0].entries,
    [
      { zone: 'Center Holes Bleed', label: 'Bleed' },
      { zone: 'Center Holes Cut', label: 'Cut' },
      { zone: 'Center Holes Safety', label: 'Safety' },
    ],
  );
  assert.ok(familyGrouped.has('Center Holes Bleed'));
  assert.ok(familyGrouped.has('Center Holes Cut'));
  assert.ok(familyGrouped.has('Center Holes Safety'));
  // The standalone "Bleed" zone is not family-grouped
  assert.equal(familyGrouped.has('Bleed'), false);
});

test('a lone prefix-qualified zone stays standalone (no single-item dropdown)', () => {
  const { familyGroups, familyGrouped } = groupZonesForPills([
    line('Center Holes Bleed'),
    line('Bleed'),
    line('Cut'),
  ]);
  assert.equal(familyGroups.length, 0);
  assert.equal(familyGrouped.size, 0);
});

test('Front/Back/Spine side grouping is unaffected by family logic', () => {
  const { groups, grouped, familyGrouped } = groupZonesForPills([
    line('Front Cover'), area('Front Safety'),
    line('Back Cover'), area('Back Safety'),
    line('Center Holes Bleed'), line('Center Holes Cut'),
    line('Bleed'),
  ]);
  // Side groups unchanged
  assert.deepEqual(groups.map((g) => g.side), ['Front', 'Back']);
  assert.ok(grouped.has('Front Cover') && grouped.has('Back Cover'));
  // Side-grouped zones are never family-grouped
  assert.equal(familyGrouped.has('Front Cover'), false);
  assert.equal(familyGrouped.has('Back Cover'), false);
  // Family group formed for Center Holes
  assert.ok(familyGrouped.has('Center Holes Bleed'));
  assert.ok(familyGrouped.has('Center Holes Cut'));
});

test('zones with a side word AND a family qualifier resolve as side-grouped (side takes precedence)', () => {
  // "Front Holes Bleed" starts with the side word "Front" — parseSideZone sees it
  // as Front / "Holes Bleed", so it goes into the Front side group, not a family.
  const { grouped, familyGrouped } = groupZonesForPills([
    line('Front Holes Bleed'),
    line('Front Holes Cut'),
  ]);
  assert.ok(grouped.has('Front Holes Bleed'));
  assert.ok(grouped.has('Front Holes Cut'));
  assert.equal(familyGrouped.has('Front Holes Bleed'), false);
  assert.equal(familyGrouped.has('Front Holes Cut'), false);
});

test('one-word shared prefix stays standalone — no spurious grouping', () => {
  // "Hole Bleed" + "Hole Cut" share the one-word prefix "Hole" — this must NOT
  // form a family dropdown because one-word prefixes are too broad.
  // The three-word "Center Holes Bleed/Cut" case must still group normally.
  const { familyGroups, familyGrouped } = groupZonesForPills([
    line('Hole Bleed'),
    line('Hole Cut'),
    line('Center Holes Bleed'),
    line('Center Holes Cut'),
  ]);
  // Only the multi-word prefix group should form
  assert.equal(familyGroups.length, 1);
  assert.equal(familyGroups[0].prefix, 'Center Holes');
  assert.equal(familyGrouped.has('Hole Bleed'), false);
  assert.equal(familyGrouped.has('Hole Cut'), false);
  assert.ok(familyGrouped.has('Center Holes Bleed'));
  assert.ok(familyGrouped.has('Center Holes Cut'));
});

test('other-kind zones are never family-grouped, even with a matching prefix', () => {
  const { familyGroups, familyGrouped } = groupZonesForPills([
    other('Center Holes Bleed'),
    other('Center Holes Cut'),
  ]);
  assert.equal(familyGroups.length, 0);
  assert.equal(familyGrouped.size, 0);
});

test('a zone with both other-kind and line-kind layers IS family-grouped', () => {
  const { familyGrouped } = groupZonesForPills([
    other('Center Holes Bleed'), line('Center Holes Bleed'),
    line('Center Holes Cut'),
  ]);
  assert.ok(familyGrouped.has('Center Holes Bleed'));
  assert.ok(familyGrouped.has('Center Holes Cut'));
});

test('multiple distinct family groups are each returned', () => {
  const { familyGroups } = groupZonesForPills([
    line('Center Holes Bleed'), line('Center Holes Cut'),
    line('Outer Ring Bleed'), line('Outer Ring Safety'),
    line('Bleed'),
  ]);
  assert.equal(familyGroups.length, 2);
  const prefixes = familyGroups.map((g) => g.prefix).sort();
  assert.deepEqual(prefixes, ['Center Holes', 'Outer Ring']);
});

test('nothing vanishes with family grouping: every zone grouped OR standalone', () => {
  const layers = [
    line('Bleed'), line('Center Holes Bleed'), line('Center Holes Cut'),
    other('Center Holes Safety'), line('Artboard'),
  ];
  const { grouped, familyGrouped } = groupZonesForPills(layers);
  const zones = new Set(layers.map((l) => l.zone));
  const allGrouped = new Set([...grouped.keys(), ...familyGrouped.keys()]);
  const standalone = [...zones].filter((z) => !allGrouped.has(z));
  assert.equal(allGrouped.size + standalone.length, zones.size);
  // "Center Holes Safety" is other-kind only → stays standalone, not family-grouped
  assert.ok(standalone.includes('Center Holes Safety'));
});
