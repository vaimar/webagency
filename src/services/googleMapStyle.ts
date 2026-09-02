import type { StyleSpecification, LayerSpecification } from 'maplibre-gl';

const C = {
    bg:             '#f2efe9',
    water:          '#aadaff',
    waterLabel:     '#4a90d9',
    park:           '#c5e1a5',
    forest:         '#a5d6a7',
    grass:          '#cdebb4',
    sand:           '#f5e6c8',
    hospital:       '#f8e0e0',
    school:         '#f3e8d5',
    commercial:     '#eeeae3',
    industrial:     '#ebeae6',
    cemetery:       '#d6e2c4',
    building:       '#e6e2db',
    buildingStroke: '#dcd8d0',
    road:           '#ffffff',
    roadCasing:     '#e0dcd5',
    roadMajorCase:  '#cdc8c0',
    highway:        '#fce38a',
    highwayCase:    '#e8c845',
    rail:           '#b0aaa0',
    path:           '#d4cfc6',
    runway:         '#d0ccc4',
    boundary:       '#c3bfb5',
    labelPlace:     '#3c4043',
    labelRoad:      '#5b5e63',
    labelPark:      '#4a7c3f',
    labelNeighb:    '#8a8580',
    labelCountry:   '#6b6560',
    haloWhite:      'rgba(255,255,255,0.85)',
};

const FONT = ['Noto Sans Regular'];
const FONT_B = ['Noto Sans Bold'];
const FONT_I = ['Noto Sans Italic'];

const zw = (stops: [number, number][]) =>
    ['interpolate', ['linear'], ['zoom'], ...stops.flat()] as unknown as number;

export const googleMapStyle: StyleSpecification = {
    version: 8,
    name: 'Slumber Maps',
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {
        openmaptiles: { type: 'vector' as const, url: 'https://tiles.openfreemap.org/planet' },
    },
    layers: [
        /* ── background ─────────────────────────────────────────── */
        { id: 'background', type: 'background', paint: { 'background-color': C.bg } },

        /* ── landcover ──────────────────────────────────────────── */
        { id: 'lc-grass', type: 'fill', source: 'openmaptiles', 'source-layer': 'landcover',
            filter: ['==', 'class', 'grass'],
            paint: { 'fill-color': C.grass, 'fill-opacity': 0.6 } },
        { id: 'lc-wood', type: 'fill', source: 'openmaptiles', 'source-layer': 'landcover',
            filter: ['==', 'class', 'wood'],
            paint: { 'fill-color': C.forest, 'fill-opacity': 0.5 } },
        { id: 'lc-sand', type: 'fill', source: 'openmaptiles', 'source-layer': 'landcover',
            filter: ['==', 'class', 'sand'],
            paint: { 'fill-color': C.sand, 'fill-opacity': 0.5 } },

        /* ── landuse ────────────────────────────────────────────── */
        { id: 'lu-park', type: 'fill', source: 'openmaptiles', 'source-layer': 'landuse',
            filter: ['in', 'class', 'park', 'garden'],
            paint: { 'fill-color': C.park, 'fill-opacity': 0.7 } },
        { id: 'lu-forest', type: 'fill', source: 'openmaptiles', 'source-layer': 'landuse',
            filter: ['==', 'class', 'forest'],
            paint: { 'fill-color': C.forest, 'fill-opacity': 0.5 } },
        { id: 'lu-hospital', type: 'fill', source: 'openmaptiles', 'source-layer': 'landuse',
            filter: ['==', 'class', 'hospital'], minzoom: 12,
            paint: { 'fill-color': C.hospital, 'fill-opacity': 0.6 } },
        { id: 'lu-school', type: 'fill', source: 'openmaptiles', 'source-layer': 'landuse',
            filter: ['in', 'class', 'school', 'university'], minzoom: 12,
            paint: { 'fill-color': C.school, 'fill-opacity': 0.6 } },
        { id: 'lu-commercial', type: 'fill', source: 'openmaptiles', 'source-layer': 'landuse',
            filter: ['in', 'class', 'commercial', 'retail'], minzoom: 11,
            paint: { 'fill-color': C.commercial, 'fill-opacity': 0.5 } },
        { id: 'lu-industrial', type: 'fill', source: 'openmaptiles', 'source-layer': 'landuse',
            filter: ['==', 'class', 'industrial'], minzoom: 11,
            paint: { 'fill-color': C.industrial, 'fill-opacity': 0.5 } },
        { id: 'lu-cemetery', type: 'fill', source: 'openmaptiles', 'source-layer': 'landuse',
            filter: ['==', 'class', 'cemetery'], minzoom: 12,
            paint: { 'fill-color': C.cemetery, 'fill-opacity': 0.6 } },

        /* ── water ──────────────────────────────────────────────── */
        { id: 'water', type: 'fill', source: 'openmaptiles', 'source-layer': 'water',
            paint: { 'fill-color': C.water } },
        { id: 'waterway', type: 'line', source: 'openmaptiles', 'source-layer': 'waterway',
            paint: { 'line-color': C.water, 'line-width': zw([[8, 0.5], [14, 2], [18, 4]]) } },

        /* ── buildings ──────────────────────────────────────────── */
        { id: 'building', type: 'fill', source: 'openmaptiles', 'source-layer': 'building',
            minzoom: 13,
            paint: { 'fill-color': C.building,
                     'fill-opacity': zw([[13, 0], [14, 0.6], [16, 0.8]]) } },
        { id: 'building-line', type: 'line', source: 'openmaptiles', 'source-layer': 'building',
            minzoom: 14,
            paint: { 'line-color': C.buildingStroke, 'line-width': 0.5,
                     'line-opacity': zw([[14, 0], [15, 0.5]]) } },

        /* ── boundaries ─────────────────────────────────────────── */
        { id: 'bnd-country', type: 'line', source: 'openmaptiles', 'source-layer': 'boundary',
            filter: ['==', 'admin_level', 2],
            paint: { 'line-color': C.boundary, 'line-dasharray': [3, 2],
                     'line-width': zw([[3, 0.5], [10, 2]]) } },
        { id: 'bnd-state', type: 'line', source: 'openmaptiles', 'source-layer': 'boundary',
            filter: ['==', 'admin_level', 4], minzoom: 4,
            paint: { 'line-color': C.boundary, 'line-dasharray': [2, 2], 'line-opacity': 0.7,
                     'line-width': zw([[4, 0.3], [10, 1]]) } },

        /* ── aeroway ────────────────────────────────────────────── */
        { id: 'aero-runway', type: 'line', source: 'openmaptiles', 'source-layer': 'aeroway',
            filter: ['==', 'class', 'runway'], minzoom: 11,
            paint: { 'line-color': C.runway, 'line-width': zw([[11, 2], [16, 20]]) } },
        { id: 'aero-taxiway', type: 'line', source: 'openmaptiles', 'source-layer': 'aeroway',
            filter: ['==', 'class', 'taxiway'], minzoom: 13,
            paint: { 'line-color': C.runway, 'line-width': zw([[13, 1], [16, 6]]) } },

        /* ── road casings (outlines) ────────────────────────────── */
        ...roadCasing('rc-service',   ['==', 'class', 'service'],                    15, C.roadCasing,    [[15, 2],  [18, 6]]),
        ...roadCasing('rc-minor',     ['in', 'class', 'minor', 'tertiary'],          12, C.roadCasing,    [[12, 2],  [14, 4],  [18, 12]]),
        ...roadCasing('rc-secondary', ['==', 'class', 'secondary'],                  10, C.roadMajorCase, [[10, 2],  [14, 5],  [18, 15]]),
        ...roadCasing('rc-primary',   ['==', 'class', 'primary'],                     8, C.roadMajorCase, [[ 8, 1.5],[12, 3],  [14, 6],  [18, 18]]),
        ...roadCasing('rc-trunk',     ['==', 'class', 'trunk'],                       6, C.highwayCase,   [[ 6, 1],  [10, 3],  [14, 7],  [18, 22]]),
        ...roadCasing('rc-motorway',  ['==', 'class', 'motorway'],                    5, C.highwayCase,   [[ 5, 1],  [10, 3.5],[14, 8],  [18, 24]]),

        /* ── road fills ─────────────────────────────────────────── */
        roadFill('r-path',      ['in', 'class', 'path', 'track'],       14, C.path,    [[14, 0.8], [18, 2]],    [2, 1.5]),
        roadFill('r-service',   ['==', 'class', 'service'],              15, C.road,    [[15, 1],   [18, 4]]),
        roadFill('r-minor',     ['in', 'class', 'minor', 'tertiary'],   12, C.road,    [[12, 0.5], [14, 2.5], [18, 10]]),
        roadFill('r-secondary', ['==', 'class', 'secondary'],           10, C.road,    [[10, 0.5], [14, 3.5], [18, 13]]),
        roadFill('r-primary',   ['==', 'class', 'primary'],              8, C.road,    [[ 8, 0.5], [12, 1.5], [14, 4.5],[18, 16]]),
        roadFill('r-trunk',     ['==', 'class', 'trunk'],                6, C.highway, [[ 6, 0.5], [10, 1.5], [14, 5.5],[18, 20]]),
        roadFill('r-motorway',  ['==', 'class', 'motorway'],             5, C.highway, [[ 5, 0.5], [10, 2],   [14, 6.5],[18, 22]]),

        /* ── bridges (above regular roads) ──────────────────────── */
        ...bridgePair('br-primary',  ['in', 'class', 'primary', 'secondary', 'tertiary'], 12,
            '#c8c4bc', C.road, [[12, 4], [14, 7], [18, 20]], [[12, 2], [14, 5], [18, 18]]),
        ...bridgePair('br-highway',  ['in', 'class', 'motorway', 'trunk'], 8,
            C.highwayCase, C.highway, [[8, 2], [14, 8], [18, 24]], [[8, 1], [14, 6.5], [18, 22]]),

        /* ── rail ───────────────────────────────────────────────── */
        { id: 'rail', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation',
            filter: ['==', 'class', 'rail'], minzoom: 10,
            paint: { 'line-color': C.rail, 'line-width': zw([[10, 0.5], [14, 1.5], [18, 3]]) } },
        { id: 'rail-dash', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation',
            filter: ['==', 'class', 'rail'], minzoom: 12,
            paint: { 'line-color': C.rail, 'line-dasharray': [0.2, 4],
                     'line-width': zw([[12, 3], [18, 8]]) } },

        /* ── road labels ────────────────────────────────────────── */
        roadLabel('lbl-rd-minor', ['in', 'class', 'minor', 'tertiary', 'service'], 15, FONT, 11),
        roadLabel('lbl-rd-secondary', ['==', 'class', 'secondary'], 13, FONT,
            zw([[13, 11], [16, 13]])),
        roadLabel('lbl-rd-primary', ['in', 'class', 'primary', 'trunk', 'motorway'], 11, FONT_B,
            zw([[11, 11], [16, 14]])),

        /* ── place labels ───────────────────────────────────────── */
        placeLabel('lbl-neighbourhood', 'neighbourhood', 14, undefined, FONT, 11,
            { letterSpacing: 0.08, transform: 'uppercase', color: C.labelNeighb }),
        placeLabel('lbl-suburb', 'suburb', 12, 16, FONT, 12,
            { letterSpacing: 0.06, transform: 'uppercase', color: '#7a7570' }),
        placeLabel('lbl-village', 'village', 10, undefined, FONT, zw([[10, 11], [14, 13]])),
        placeLabel('lbl-town', 'town', 8, undefined, FONT, zw([[8, 11], [12, 14]])),
        { id: 'lbl-city', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place',
            filter: ['all', ['==', 'class', 'city'], ['!=', 'capital', 2]], minzoom: 5,
            layout: { 'text-field': '{name}', 'text-font': FONT_B,
                      'text-size': zw([[5, 11], [10, 16]]) },
            paint: { 'text-color': C.labelPlace, 'text-halo-color': C.haloWhite,
                     'text-halo-width': 2 } },
        { id: 'lbl-capital', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place',
            filter: ['all', ['==', 'class', 'city'], ['==', 'capital', 2]], minzoom: 4,
            layout: { 'text-field': '{name}', 'text-font': FONT_B,
                      'text-size': zw([[4, 12], [10, 18]]) },
            paint: { 'text-color': C.labelPlace, 'text-halo-color': C.haloWhite,
                     'text-halo-width': 2.5 } },
        { id: 'lbl-state', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place',
            filter: ['==', 'class', 'state'], minzoom: 4, maxzoom: 8,
            layout: { 'text-field': '{name}', 'text-font': FONT,
                      'text-size': zw([[4, 9], [7, 12]]),
                      'text-letter-spacing': 0.08, 'text-transform': 'uppercase' },
            paint: { 'text-color': C.labelNeighb, 'text-halo-color': 'rgba(255,255,255,0.8)',
                     'text-halo-width': 1.5 } },
        { id: 'lbl-country', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place',
            filter: ['==', 'class', 'country'], minzoom: 2, maxzoom: 8,
            layout: { 'text-field': '{name}', 'text-font': FONT_B,
                      'text-size': zw([[2, 10], [6, 16]]),
                      'text-letter-spacing': 0.1, 'text-transform': 'uppercase' },
            paint: { 'text-color': C.labelCountry, 'text-halo-color': C.haloWhite,
                     'text-halo-width': 2 } },

        /* ── water labels ───────────────────────────────────────── */
        { id: 'lbl-water', type: 'symbol', source: 'openmaptiles', 'source-layer': 'water_name',
            layout: { 'text-field': '{name}', 'text-font': FONT_I,
                      'text-size': zw([[6, 11], [14, 15]]), 'text-letter-spacing': 0.15 },
            paint: { 'text-color': C.waterLabel,
                     'text-halo-color': 'rgba(200,230,255,0.6)', 'text-halo-width': 1 } },
    ] as LayerSpecification[],
};

/* ── helper factories (keep the layer array readable) ─────────── */

function roadCasing(
    id: string, filter: unknown[], minzoom: number, color: string,
    widthStops: [number, number][],
): LayerSpecification[] {
    return [{
        id, type: 'line', source: 'openmaptiles', 'source-layer': 'transportation',
        filter: ['all', filter, ['!=', 'brunnel', 'bridge']] as unknown[],
        minzoom,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': color, 'line-width': zw(widthStops) },
    } as LayerSpecification];
}

function roadFill(
    id: string, filter: unknown[], minzoom: number, color: string,
    widthStops: [number, number][], dash?: number[],
): LayerSpecification {
    const paint: Record<string, unknown> = {
        'line-color': color, 'line-width': zw(widthStops),
    };
    if (dash) paint['line-dasharray'] = dash;
    return {
        id, type: 'line', source: 'openmaptiles', 'source-layer': 'transportation',
        filter: ['all', filter, ['!=', 'brunnel', 'bridge']] as unknown[],
        minzoom,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint,
    } as LayerSpecification;
}

function bridgePair(
    id: string, filter: unknown[], minzoom: number,
    caseColor: string, fillColor: string,
    caseW: [number, number][], fillW: [number, number][],
): LayerSpecification[] {
    const bf = ['all', filter, ['==', 'brunnel', 'bridge']] as unknown[];
    return [
        { id: `${id}-case`, type: 'line', source: 'openmaptiles', 'source-layer': 'transportation',
            filter: bf, minzoom,
            layout: { 'line-cap': 'butt', 'line-join': 'miter' },
            paint: { 'line-color': caseColor, 'line-width': zw(caseW) } },
        { id: `${id}-fill`, type: 'line', source: 'openmaptiles', 'source-layer': 'transportation',
            filter: bf, minzoom,
            layout: { 'line-cap': 'butt', 'line-join': 'miter' },
            paint: { 'line-color': fillColor, 'line-width': zw(fillW) } },
    ] as LayerSpecification[];
}

function roadLabel(
    id: string, filter: unknown[], minzoom: number, font: string[],
    size: number | unknown[],
): LayerSpecification {
    return {
        id, type: 'symbol', source: 'openmaptiles', 'source-layer': 'transportation_name',
        filter, minzoom,
        layout: {
            'text-field': '{name}', 'text-font': font, 'text-size': size,
            'symbol-placement': 'line', 'text-rotation-alignment': 'map', 'text-max-angle': 30,
        },
        paint: { 'text-color': C.labelRoad, 'text-halo-color': C.haloWhite, 'text-halo-width': 1.5 },
    } as LayerSpecification;
}

function placeLabel(
    id: string, cls: string, minzoom: number, maxzoom: number | undefined,
    font: string[], size: number | unknown[],
    opts?: { letterSpacing?: number; transform?: string; color?: string },
): LayerSpecification {
    const layout: Record<string, unknown> = {
        'text-field': '{name}', 'text-font': font, 'text-size': size,
    };
    if (opts?.letterSpacing) layout['text-letter-spacing'] = opts.letterSpacing;
    if (opts?.transform) layout['text-transform'] = opts.transform;
    const spec: Record<string, unknown> = {
        id, type: 'symbol', source: 'openmaptiles', 'source-layer': 'place',
        filter: ['==', 'class', cls], minzoom, layout,
        paint: {
            'text-color': opts?.color ?? C.labelPlace,
            'text-halo-color': C.haloWhite, 'text-halo-width': 1.5,
        },
    };
    if (maxzoom !== undefined) spec.maxzoom = maxzoom;
    return spec as LayerSpecification;
}
