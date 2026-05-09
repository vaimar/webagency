import { ALL_AIRPORT_OPTIONS, buildAirportSearchText, formatAirportOptionLabel, getAirportDisplay, normalizeAirportCode } from './airportMetadata';

describe('airportMetadata', () => {
    it('maps the generic PAR alias to the Ryanair-serving Beauvais airport', () => {
        expect(normalizeAirportCode('PAR')).toBe('BVA');
        expect(normalizeAirportCode('Paris')).toBe('BVA');
    });

    it('returns a clear city and country label for Beauvais-backed Paris routes', () => {
        const airport = getAirportDisplay('PAR');

        expect(airport.code).toBe('BVA');
        expect(airport.city).toBe('Paris Beauvais');
        expect(airport.country).toBe('France');
        expect(airport.airportName).toContain('Beauvais');
        expect(formatAirportOptionLabel('BVA')).toContain('🇫🇷');
    });

    it('builds search text across city, airport name, country, and aliases', () => {
        const airport = getAirportDisplay('BVA');
        const searchText = buildAirportSearchText(airport);

        expect(searchText).toContain('france');
        expect(searchText).toContain('beauvais');
        expect(searchText).toContain('paris');
    });

    it('keeps a broader Ryanair-style airport selector catalog available', () => {
        expect(ALL_AIRPORT_OPTIONS).toEqual(expect.arrayContaining(['DUB', 'MAN', 'OPO', 'BUD', 'CRL', 'MRS']));
    });
});

