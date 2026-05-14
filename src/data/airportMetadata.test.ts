import { ALL_AIRPORT_OPTIONS, buildAirportSearchText, formatAirportOptionLabel, getAirportDisplay, groupAirportsByCountry, normalizeAirportCode, ORIGIN_AIRPORT_OPTIONS } from './airportMetadata';

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

    it('covers the Irish Ryanair origin airports shown in the selector snippet', () => {
        expect(ORIGIN_AIRPORT_OPTIONS).toEqual(expect.arrayContaining(['ORK', 'DUB', 'KIR', 'NOC', 'SNN']));
        expect(normalizeAirportCode('Shannon')).toBe('SNN');
        expect(normalizeAirportCode('Knock')).toBe('NOC');

        expect(formatAirportOptionLabel('ORK')).toContain('Cork');
        expect(formatAirportOptionLabel('SNN')).toContain('Shannon');
    });

    it('groups the Irish Ryanair airports under Ireland with a stable city sort', () => {
        const irelandGroup = groupAirportsByCountry(['SNN', 'NOC', 'DUB', 'KIR', 'ORK']).find((group) => group.country === 'Ireland');

        expect(irelandGroup?.flag).toBe('🇮🇪');
        expect(irelandGroup?.airports.map((airport) => airport.code)).toEqual(['ORK', 'DUB', 'KIR', 'NOC', 'SNN']);
    });

    it('covers the Spanish Ryanair airports from the selector snippet without inventing fake all-airports options', () => {
        expect(ALL_AIRPORT_OPTIONS).toEqual(expect.arrayContaining([
            'ALC', 'LEI', 'BCN', 'GRO', 'REU', 'CDT', 'FUE', 'LPA', 'IBZ', 'ACE',
            'MAD', 'AGP', 'MAH', 'RMU', 'PMI', 'SDR', 'SCQ', 'SVQ', 'TFS', 'VLC', 'VIT', 'ZAZ',
        ]));
        expect(ALL_AIRPORT_OPTIONS).not.toEqual(expect.arrayContaining(['BAR', 'VNC']));
    });

    it('normalizes Ryanair all-airports shortcuts to honest real-airport fallbacks', () => {
        expect(normalizeAirportCode('BAR')).toBe('BCN');
        expect(normalizeAirportCode('Barcelona (All Airports)')).toBe('BCN');
        expect(normalizeAirportCode('VNC')).toBe('VLC');
        expect(normalizeAirportCode('Valencia (All Airports)')).toBe('VLC');

        expect(getAirportDisplay('BAR').city).toBe('Barcelona');
        expect(getAirportDisplay('VNC').city).toBe('Valencia');
    });

    it('adds the first larger Ryanair audit batch for France, Italy, Germany, the United Kingdom, and Greece', () => {
        expect(ALL_AIRPORT_OPTIONS).toEqual(expect.arrayContaining([
            'BOD', 'NTE', 'NCE', 'TLS', 'LYS', 'SXB', 'MPL',
            'BRI', 'BLQ', 'CTA', 'MXP', 'NAP', 'PSA', 'TRN',
            'BRE', 'CGN', 'DTM', 'HAM', 'FMM', 'NUE', 'NRN', 'STR',
            'ABZ', 'BFS', 'BHX', 'BOH', 'BRS', 'EMA', 'GLA', 'PIK', 'LPL', 'LGW', 'LTN', 'NCL', 'NQY',
            'CHQ', 'CFU', 'JMK', 'PVK', 'RHO', 'JTR', 'SKG', 'ZTH',
        ]));
    });

    it('keeps alias normalization honest for the new country batch', () => {
        expect(normalizeAirportCode('Belfast')).toBe('BFS');
        expect(normalizeAirportCode('Luton')).toBe('LTN');
        expect(normalizeAirportCode('Cologne')).toBe('CGN');
        expect(normalizeAirportCode('Santorini')).toBe('JTR');

        expect(formatAirportOptionLabel('LGW')).toContain('London Gatwick');
        expect(formatAirportOptionLabel('MXP')).toContain('Milan Malpensa');
    });
});

