// Task #3163 — the overlay bar's side-pill consolidation must be generic:
// any press's side-prefixed GT layers fold into Front/Back/Spine dropdowns,
// Memphis's canonical vocabulary keeps its exact order, and anything that
// can't be grouped confidently stays a standalone pill (never dropped).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupZonesForPills, parseSideZone } from './sidePillGroups';

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
