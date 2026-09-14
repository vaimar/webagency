import {
    cityFromMunicipality,
    kiwiPlaceSlug,
    kiwiSearchUrl,
    kiwiTimesParam,
    slugifyPlace,
} from './affiliates';

describe('slugifyPlace', () => {
    it('strips accents', () => {
        expect(slugifyPlace('Málaga')).toBe('malaga');
    });

    it('handles letters NFD leaves alone', () => {
        // Wrocław's ł is its own letter, not an accented l.
        expect(slugifyPlace('Wrocław')).toBe('wroclaw');
        expect(slugifyPlace('Ålesund')).toBe('alesund');
    });

    it('collapses punctuation and spacing', () => {
        expect(slugifyPlace('Vitoria (Basque Country)')).toBe('vitoria-basque-country');
        expect(slugifyPlace('  United Kingdom ')).toBe('united-kingdom');
    });
});

describe('kiwiPlaceSlug', () => {
    it('resolves an airport to its city and country', () => {
        expect(kiwiPlaceSlug('AGP')).toBe('malaga-spain');
        expect(kiwiPlaceSlug('MAD')).toBe('madrid-spain');
        expect(kiwiPlaceSlug('SNN')).toBe('shannon-ireland');
    });

    it('uses the plain city for airport-qualified names', () => {
        // "london-stansted-united-kingdom" resolves to nothing on Kiwi.
        expect(kiwiPlaceSlug('STN')).toBe('london-united-kingdom');
        expect(kiwiPlaceSlug('CDG')).toBe('paris-france');
        expect(kiwiPlaceSlug('ORY')).toBe('paris-france');
        expect(kiwiPlaceSlug('CRL')).toBe('charleroi-belgium');
    });

    it('gives nothing for an airport it holds no city for', () => {
        expect(kiwiPlaceSlug('ZZZ')).toBeNull();
    });

    it('falls back to the backend airport data for an uncurated airport', () => {
        // The curated list is ~100 airports; the schedule graph knows far more,
        // and a hub outside the list was silently losing its Kiwi link.
        expect(kiwiPlaceSlug('ZZZ', { municipality: 'Bilbao', isoCountry: 'ES' })).toBe('bilbao-spain');
        expect(kiwiPlaceSlug('ZZZ', { municipality: 'Kraków', isoCountry: 'PL' })).toBe('krakow-poland');
    });

    it('strips the qualifiers airport data hangs off a place name', () => {
        // "Ibiza (Eivissa)" and "London, Essex" are how the table records them.
        expect(cityFromMunicipality('Ibiza (Eivissa)')).toBe('Ibiza');
        expect(cityFromMunicipality('London, Essex')).toBe('London');
        expect(cityFromMunicipality('Paris (Roissy-en-France, Val-d\'Oise)')).toBe('Paris');
        expect(cityFromMunicipality('Manchester, Greater Manchester')).toBe('Manchester');
    });

    it('prefers the hand-checked curated city over the raw airport data', () => {
        // STN's municipality is "London, Essex"; curated says London. Both agree
        // here, but the curated value is the one verified against Kiwi.
        expect(kiwiPlaceSlug('STN', { municipality: 'Somewhere Else', isoCountry: 'FR' }))
            .toBe('london-united-kingdom');
    });

    it('still gives nothing when the hint is incomplete', () => {
        expect(kiwiPlaceSlug('ZZZ', { municipality: 'Bilbao' })).toBeNull();
        expect(kiwiPlaceSlug('ZZZ', { isoCountry: 'ES' })).toBeNull();
    });
});

describe('kiwiTimesParam', () => {
    it('brackets the hour a flight departs and the hour it lands', () => {
        // Verified on Kiwi: 7-8-8-9 isolates the 07:10 → 08:30 and nothing else.
        expect(kiwiTimesParam('07:10', '08:30')).toBe('7-8-8-9');
        expect(kiwiTimesParam('19:05:00', '20:20:00')).toBe('19-20-20-21');
    });

    it('brackets a landing after midnight on the clock alone', () => {
        expect(kiwiTimesParam('23:10', '00:45')).toBe('23-24-0-1');
    });

    it('is absent when either time is unknown', () => {
        expect(kiwiTimesParam('07:10', null)).toBeNull();
        expect(kiwiTimesParam(undefined, '08:30')).toBeNull();
    });
});

describe('kiwiSearchUrl', () => {
    it('builds the one-way city search Kiwi actually answers', () => {
        expect(kiwiSearchUrl('MAD', 'AGP', '2026-09-07'))
            .toBe('https://www.kiwi.com/en/search/results/madrid-spain/malaga-spain/2026-09-07/no-return/');
    });

    it('filters to the leg when the times are known', () => {
        expect(kiwiSearchUrl('MAD', 'AGP', '2026-09-07', { departureTime: '19:05', arrivalTime: '20:20' }))
            .toBe('https://www.kiwi.com/en/search/results/madrid-spain/malaga-spain/2026-09-07/no-return/?times=19-20-20-21');
    });

    it('returns nothing when an end cannot be resolved or the date is missing', () => {
        // The old builder emitted /results/SNN/AGP/… here, which loads Kiwi with
        // both boxes empty.
        expect(kiwiSearchUrl('ZZZ', 'AGP', '2026-09-07')).toBe('');
        expect(kiwiSearchUrl('MAD', 'AGP', '')).toBe('');
    });
});
