import { airlineBookingUrl, airlineCodeFor, airlineLogoUrl, airlineName, operatorBrands } from './airlines';

describe('airlineName', () => {
    it('names known carriers and echoes unknown codes rather than hiding them', () => {
        expect(airlineName('FR')).toBe('Ryanair');
        expect(airlineName('u2')).toBe('easyJet');
        expect(airlineName('ZZ')).toBe('ZZ');
        expect(airlineName(null)).toBe('Airline');
    });
});

describe('airlineCodeFor', () => {
    it('reads the carrier off the flight number first', () => {
        expect(airlineCodeFor('FR 342')).toBe('FR');
        expect(airlineCodeFor('fr342')).toBe('FR');
        expect(airlineCodeFor('6E1234')).toBe('6E');
        expect(airlineCodeFor('U2-8901')).toBe('U2');
    });

    it('falls back to the provider airline name', () => {
        expect(airlineCodeFor(undefined, 'Ryanair')).toBe('FR');
        expect(airlineCodeFor(undefined, 'easyJet')).toBe('U2');
        expect(airlineCodeFor(undefined, 'fr')).toBe('FR');
    });

    it('returns nothing rather than guessing', () => {
        expect(airlineCodeFor(undefined, undefined)).toBeNull();
        expect(airlineCodeFor('FALLBACK-SNNAGP', 'Fallback Routing')).toBeNull();
        expect(airlineCodeFor(undefined, 'Some Regional Airline')).toBeNull();
    });
});

describe('operatorBrands', () => {
    it('collapses codeshare codes that are the same airline', () => {
        expect(operatorBrands(['U2', 'EZY', 'FR'])).toEqual([
            { code: 'U2', name: 'easyJet' },
            { code: 'FR', name: 'Ryanair' },
        ]);
    });

    it('survives empty and missing carrier lists', () => {
        expect(operatorBrands(null)).toEqual([]);
        expect(operatorBrands([])).toEqual([]);
    });
});

describe('airlineBookingUrl', () => {
    it('deep-links Aer Lingus into a dated one-way search', () => {
        const url = airlineBookingUrl('EI', 'SNN', 'CDG', '2026-09-10') ?? '';

        expect(url).toContain('sourceAirportCode_0=SNN');
        expect(url).toContain('departureDate_0=2026-09-10');
    });

    it('splits the date the way Iberia\'s form wants it', () => {
        const url = airlineBookingUrl('IB', 'PMI', 'IBZ', '2026-09-17') ?? '';

        expect(url).toContain('BEGIN_CITY_01=PMI');
        expect(url).toContain('END_CITY_01=IBZ');
        // Month is YYYYMM, not MM — the one part of this format easy to get wrong.
        expect(url).toContain('BEGIN_DAY_01=17&BEGIN_MONTH_01=202609&BEGIN_YEAR_01=2026');
        // Empty return fields are what make it one-way.
        expect(url).toContain('END_DAY_01=&END_MONTH_01=&END_YEAR_01=');
        expect(url).toContain('nombreOrigen=Palma%20de%20Mallorca');
        expect(url).toContain('nombreDestino=Ibiza');
    });

    it('falls back to a homepage for a carrier with no deep-link format', () => {
        expect(airlineBookingUrl('VY', 'BCN', 'AGP', '2026-09-07')).toBe('https://www.vueling.com/');
    });
});

describe('airlineLogoUrl', () => {
    it('addresses the CDN by upper-case IATA code', () => {
        expect(airlineLogoUrl('fr')).toBe('https://images.kiwi.com/airlines/64/FR.png');
    });
});
