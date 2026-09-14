import {
    bboxAround,
    categorizeKinds,
    dedupeEntries,
    groupEntries,
    haversineKm,
    mergeNearbyStays,
    StayGuideEntry,
    VerifiedStay,
    fetchStayDetails,
    toStayEntry,
    toVerifiedStay,
} from './stayGuide';
import { CuratedStay, HotelResult } from './api';

const entry = (over: Partial<StayGuideEntry>): StayGuideEntry => ({
    xid: 'x',
    name: 'Stay',
    category: 'hotel',
    distanceKm: null,
    enrichment: { status: 'idle' },
    ...over,
});

describe('categorizeKinds', () => {
    it('maps the most-specific tag, not the generic one', () => {
        expect(categorizeKinds('hostels,accomodations,tourist_facilities')).toBe('hostel');
        expect(categorizeKinds('other_hotels,accomodations')).toBe('hotel');
        expect(categorizeKinds('guest_houses,accomodations')).toBe('guest_house');
        expect(categorizeKinds('apartments')).toBe('apartment');
        expect(categorizeKinds('resorts,accomodations')).toBe('resort');
        expect(categorizeKinds('camp_sites')).toBe('camp');
        expect(categorizeKinds('alpine_huts')).toBe('camp');
    });

    it('falls back to "other" for unknown or missing kinds', () => {
        expect(categorizeKinds('tourist_facilities')).toBe('other');
        expect(categorizeKinds('')).toBe('other');
        expect(categorizeKinds(undefined)).toBe('other');
    });
});

describe('haversineKm', () => {
    it('is ~zero for identical points', () => {
        expect(haversineKm(48.8566, 2.3522, 48.8566, 2.3522)).toBeCloseTo(0, 5);
    });

    it('matches a known distance (Paris ↔ London ≈ 344 km)', () => {
        expect(haversineKm(48.8566, 2.3522, 51.5072, -0.1276)).toBeGreaterThan(330);
        expect(haversineKm(48.8566, 2.3522, 51.5072, -0.1276)).toBeLessThan(360);
    });
});

describe('bboxAround', () => {
    it('brackets the centre and widens longitude by latitude', () => {
        const box = bboxAround(48.8566, 2.3522, 10);
        expect(box.latMin).toBeLessThan(48.8566);
        expect(box.latMax).toBeGreaterThan(48.8566);
        expect(box.lonMin).toBeLessThan(2.3522);
        expect(box.lonMax).toBeGreaterThan(2.3522);
        // At 49°N a degree of longitude is shorter, so the lon span exceeds the lat span.
        const latSpan = box.latMax - box.latMin;
        const lonSpan = box.lonMax - box.lonMin;
        expect(lonSpan).toBeGreaterThan(latSpan);
    });
});

describe('toStayEntry', () => {
    const center = { lat: 48.8566, lon: 2.3522 };

    it('keeps a no-price hotel with an idle enrichment slot and computed distance', () => {
        const hotel: HotelResult = { xid: 'H1', name: 'Hôtel Test', latitude: 48.86, longitude: 2.35, kinds: 'other_hotels' };
        const result = toStayEntry(hotel, center, 0);
        expect(result.category).toBe('hotel');
        expect(result.enrichment.status).toBe('idle');
        expect(result.enrichment.pricePerNight).toBeNull();
        expect(result.distanceKm).not.toBeNull();
        expect(result.distanceKm as number).toBeLessThan(2);
    });

    it('synthesizes a name/xid and null distance when the row is bare', () => {
        const result = toStayEntry({ name: '  ' }, center, 3);
        expect(result.name).toBe('Unnamed stay 4');
        expect(result.xid).toBe('stay-3');
        expect(result.distanceKm).toBeNull();
    });

    it('hydrates the enrichment slot from a Xotelo-priced row (status loaded)', () => {
        const hotel: HotelResult = {
            xid: 'H2', name: 'Curated Hotel', latitude: 48.86, longitude: 2.35, kinds: 'other_hotels',
            pricePerNight: 142, priceCurrency: 'EUR', rating: 4.4, reviewsCount: 2352,
            reviewSummary: 'Great rooftop', bookingLink: 'https://book',
        };
        const e = toStayEntry(hotel, center, 0).enrichment;
        expect(e.status).toBe('loaded');
        expect(e.pricePerNight).toBe(142);
        expect(e.priceCurrency).toBe('EUR');
        expect(e.rating).toBe(4.4);
        expect(e.curated).toBe(true);
    });

    it('stays idle when a curated row matched but no live rate landed', () => {
        const hotel: HotelResult = { xid: 'H3', name: 'Rated Only', rating: 4.0, reviewsCount: 143 };
        const e = toStayEntry(hotel, center, 0).enrichment;
        expect(e.status).toBe('idle');
        expect(e.pricePerNight).toBeNull();
        expect(e.curated).toBe(true); // rating alone still marks it curated
    });

    it('ignores a zero/invalid price (not a live rate)', () => {
        const hotel: HotelResult = { xid: 'H4', name: 'Zero', pricePerNight: 0 };
        expect(toStayEntry(hotel, center, 0).enrichment.status).toBe('idle');
    });
});

describe('fetchStayDetails', () => {
    const realFetch = global.fetch;
    afterEach(() => { global.fetch = realFetch; });

    const mockDetails = (payload: unknown) => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            headers: new Headers(),
            json: async () => payload,
            text: async () => JSON.stringify(payload),
        }) as unknown as typeof global.fetch;
    };

    it('extracts the property website and builds an address line', async () => {
        mockDetails({
            xid: 'N1', name: 'I Love Madrid Hostel',
            url: 'https://www.booking.com/hotel/es/i-love-madrid-hostel.html',
            address: { road: 'Calle de la Victoria', house_number: '2', postcode: '28012', city: 'Madrid' },
        });
        const details = await fetchStayDetails('N1');
        expect(details.websiteUrl).toBe('https://www.booking.com/hotel/es/i-love-madrid-hostel.html');
        expect(details.addressLine).toBe('Calle de la Victoria 2, 28012 Madrid');
    });

    it('omits missing address parts rather than emitting blanks', async () => {
        mockDetails({ xid: 'N2', address: { city: 'Madrid' } });
        const details = await fetchStayDetails('N2');
        expect(details.addressLine).toBe('Madrid');
        expect(details.websiteUrl).toBeUndefined();
    });

    it('drops a house number that has no street name', async () => {
        // Real case: Hotel Europa returns house_number "4" with no road, which
        // would otherwise render the meaningless "4, 28013 Madrid".
        mockDetails({ xid: 'N5', address: { house_number: '4', postcode: '28013', city: 'Madrid' } });
        expect((await fetchStayDetails('N5')).addressLine).toBe('28013 Madrid');
    });

    it('never surfaces the unreliable preview image or wikipedia extract', async () => {
        // OTM links places to loosely-associated Wikidata entities, so these fields
        // routinely describe a different building. They must not leak into the UI.
        mockDetails({
            xid: 'N3',
            preview: { source: 'https://upload.wikimedia.org/wrong-building.jpg' },
            wikipedia: 'https://es.wikipedia.org/wiki/Café_de_Madrid',
            wikipedia_extracts: { text: 'A café that closed in 1925' },
        });
        const details = await fetchStayDetails('N3');
        expect(JSON.stringify(details)).not.toMatch(/wikimedia|wikipedia|café/i);
        expect(Object.keys(details).sort()).toEqual(['addressLine', 'websiteUrl']);
    });

    it('returns nothing usable when the payload is bare', async () => {
        mockDetails({ xid: 'N4' });
        const details = await fetchStayDetails('N4');
        expect(details.websiteUrl).toBeUndefined();
        expect(details.addressLine).toBeUndefined();
    });
});

describe('toVerifiedStay', () => {
    const center = { lat: 41.3874, lon: 2.1686 };

    it('maps a priced curated stay and computes distance', () => {
        const stay: CuratedStay = {
            hotelKey: 'g187497-d228642', name: 'hotel pulitzer', latitude: 41.386, longitude: 2.168,
            rating: 4.4, reviewsCount: 3100, pricePerNight: 179, priceCurrency: 'EUR',
        };
        const v = toVerifiedStay(stay, center);
        expect(v.pricePerNight).toBe(179);
        expect(v.rating).toBe(4.4);
        expect(v.distanceKm as number).toBeLessThan(1);
    });

    it('nulls a missing/zero rate but keeps the curated identity', () => {
        const stay: CuratedStay = { hotelKey: 'k', name: 'no rate', rating: 4.0, pricePerNight: 0 };
        const v = toVerifiedStay(stay, center);
        expect(v.pricePerNight).toBeNull();
        expect(v.rating).toBe(4.0);
        expect(v.distanceKm).toBeNull();
    });
});

describe('dedupeEntries', () => {
    it('drops repeated xids and same-name-same-location rows', () => {
        const input = [
            entry({ xid: 'A', name: 'Alpha' }),
            entry({ xid: 'A', name: 'Alpha copy' }),          // dup xid
            entry({ xid: '', name: 'Beta', latitude: 1, longitude: 2 }),
            entry({ xid: '', name: 'beta', latitude: 1, longitude: 2 }), // dup name+loc
            entry({ xid: 'C', name: 'Gamma' }),
        ];
        expect(dedupeEntries(input).map((e) => e.name)).toEqual(['Alpha', 'Beta', 'Gamma']);
    });
});

describe('groupEntries', () => {
    it('orders groups by CATEGORY_ORDER and sorts nearest-first within each', () => {
        const groups = groupEntries([
            entry({ xid: '1', category: 'hostel', distanceKm: 1 }),
            entry({ xid: '2', category: 'hotel', distanceKm: 5 }),
            entry({ xid: '3', category: 'hotel', distanceKm: 1 }),
            entry({ xid: '4', category: 'hotel', distanceKm: null }),
        ]);
        expect(groups.map((g) => g.category)).toEqual(['hotel', 'hostel']);
        // hotels: 1 km, 5 km, then unknown-distance last
        expect(groups[0].entries.map((e) => e.distanceKm)).toEqual([1, 5, null]);
    });
});

describe('mergeNearbyStays', () => {
    const verified = (over: Partial<VerifiedStay>): VerifiedStay => ({
        hotelKey: 'k',
        name: 'Curated',
        rating: 4.5,
        reviewsCount: 100,
        pricePerNight: 90,
        distanceKm: 5,
        ...over,
    });

    it('orders nearest-first regardless of source or price', () => {
        const merged = mergeNearbyStays(
            [entry({ xid: 'a', name: 'Near hostel', distanceKm: 1.2 })],
            [verified({ hotelKey: 'k1', name: 'Far hotel', distanceKm: 9 })],
        );
        expect(merged.map((s) => s.name)).toEqual(['Near hostel', 'Far hotel']);
    });

    it('sinks unknown-distance stays to the bottom', () => {
        const merged = mergeNearbyStays(
            [
                entry({ xid: 'a', name: 'Unknown', distanceKm: null }),
                entry({ xid: 'b', name: 'Known', distanceKm: 7 }),
            ],
            [],
        );
        expect(merged.map((s) => s.name)).toEqual(['Known', 'Unknown']);
    });

    it('keeps the curated row when the same property is in both feeds', () => {
        const merged = mergeNearbyStays(
            [entry({ xid: 'a', name: 'Hotel Le Lac', latitude: 45, longitude: 5, distanceKm: 3 })],
            [verified({ hotelKey: 'k1', name: 'Hôtel Le Lac', latitude: 45.001, longitude: 5.001, distanceKm: 3 })],
        );
        expect(merged).toHaveLength(1);
        expect(merged[0].curated).toBe(true);
        expect(merged[0].pricePerNight).toBe(90);
    });

    it('keeps same-named properties that are genuinely far apart', () => {
        const merged = mergeNearbyStays(
            [entry({ xid: 'a', name: 'Camping Municipal', latitude: 45, longitude: 5, distanceKm: 2 })],
            [verified({ hotelKey: 'k1', name: 'Camping Municipal', latitude: 45.1, longitude: 5.1, distanceKm: 12 })],
        );
        expect(merged).toHaveLength(2);
    });

    it('carries the price and rating through from either feed', () => {
        const [priced] = mergeNearbyStays(
            [entry({
                xid: 'a',
                name: 'Priced',
                distanceKm: 1,
                enrichment: { status: 'loaded', pricePerNight: 120, priceCurrency: 'EUR', rating: 4.2, curated: true },
            })],
            [],
        );
        expect(priced.pricePerNight).toBe(120);
        expect(priced.priceCurrency).toBe('EUR');
        expect(priced.rating).toBe(4.2);
        expect(priced.curated).toBe(true);
    });
});
