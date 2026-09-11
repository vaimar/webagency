import { MapPoi } from './mapMarkers';
import {
    cuisineList,
    distanceKm,
    formatDistance,
    placeFeatures,
    placeKind,
    placeMapUrl,
    walkMinutes,
} from './poiFormat';

const poi = (over: Partial<MapPoi> = {}): MapPoi => ({
    id: 1,
    name: 'Le Central',
    lat: 43.6181,
    lon: 1.0708,
    kind: 'restaurant',
    ...over,
});

describe('distance', () => {
    it('measures a short hop the way a walker would care about', () => {
        // ~1.1km apart.
        const km = distanceKm(43.6181, 1.0708, 43.6281, 1.0708);
        expect(km).toBeGreaterThan(1);
        expect(km).toBeLessThan(1.2);
    });

    it('reads in metres under a kilometre and kilometres above', () => {
        expect(formatDistance(0.34)).toBe('340 m');
        expect(formatDistance(0.9)).toBe('900 m');
        expect(formatDistance(2.42)).toBe('2.4 km');
    });
});

describe('cuisineList', () => {
    it('splits the way OSM writes it and makes it readable', () => {
        expect(cuisineList('italian;pizza')).toEqual(['Italian', 'Pizza']);
        expect(cuisineList('fish_and_chips')).toEqual(['Fish and chips']);
    });

    it('is empty rather than blank when nothing is tagged', () => {
        expect(cuisineList(null)).toEqual([]);
        expect(cuisineList('')).toEqual([]);
    });
});

describe('placeKind', () => {
    it('tells a café from a restaurant, which the old list could not', () => {
        expect(placeKind('cafe')).toBe('Café');
        expect(placeKind('fast_food')).toBe('Fast food');
        expect(placeKind('restaurant')).toBe('Restaurant');
    });

    it('stays vague rather than guessing', () => {
        expect(placeKind(null)).toBe('Place to eat');
    });
});

describe('placeFeatures', () => {
    it('lists only what OSM positively records', () => {
        expect(placeFeatures(poi({ outdoorSeating: true, vegan: true })))
            .toEqual(['Outdoor seating', 'Vegan']);
    });

    it('says nothing about an untagged feature', () => {
        // A missing wheelchair tag means nobody surveyed it. Rendering "no
        // step-free access" from that absence would invent a fact about a real
        // business.
        expect(placeFeatures(poi({ wheelchair: null }))).toEqual([]);
        expect(placeFeatures(poi({ wheelchair: undefined }))).toEqual([]);
    });

    it('does not claim a feature OSM explicitly denies', () => {
        expect(placeFeatures(poi({ wheelchair: false, outdoorSeating: false }))).toEqual([]);
    });
});

describe('placeMapUrl', () => {
    it('searches the name, so the link lands on the business not a field', () => {
        // The old link queried bare coordinates and opened an unnamed pin with
        // no reviews — which is where the ratings we cannot provide live.
        const url = placeMapUrl(poi({ name: 'Tutti Pizza' }));

        expect(url).toContain('Tutti%20Pizza');
        expect(url).toContain('43.6181');
    });
});

describe('walkMinutes', () => {
    it('turns a distance into the thing people actually decide on', () => {
        expect(walkMinutes(0.4)).toBe(5);
        expect(walkMinutes(1.6)).toBe(20);
    });

    it('never rounds a real walk down to nothing', () => {
        expect(walkMinutes(0.02)).toBe(1);
    });

    it('stays quiet past the distance anyone would walk', () => {
        // 4.2 km is a drive. A minute figure there is noise dressed as a fact.
        expect(walkMinutes(4.2)).toBeNull();
    });
});
