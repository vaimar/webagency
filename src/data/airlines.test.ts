import { airlineBookingUrl, airlineCodeFor, airlineLogoUrl, airlineName, operatorBrands, splitOperators } from './airlines';

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

describe('splitOperators', () => {
    const names = (brands: Array<{ name: string }>): string[] => brands.map((brand) => brand.name);

    it('demotes the long-haul carriers printed on a short European hop', () => {
        // The Madrid–Ibiza case: 1h15, and American Airlines flies none of it.
        const split = splitOperators(['AA', 'I2', 'VY'], 75);
        expect(names(split.operators)).toEqual(['Iberia Express', 'Vueling']);
        expect(names(split.codeshares)).toEqual(['American Airlines']);
    });

    it('narrows without pretending to know which of the survivors flies it', () => {
        const split = splitOperators(['AZ', 'AD', 'AM', 'EY', 'SK', 'UX'], 80);
        // Two European candidates left, and the card must not pick between them.
        expect(names(split.operators)).toEqual(['ITA Airways', 'SAS', 'Air Europa']);
        expect(split.operators.length).toBeGreaterThan(1);
    });

    it('leaves a long leg alone, where the long-haul carrier may well be flying it', () => {
        // Madrid–Doha: Qatar operates, Iberia sells. Demoting Qatar here would
        // name the wrong airline with more confidence than before.
        const split = splitOperators(['QR', 'IB'], 400);
        expect(names(split.operators)).toEqual(['Qatar Airways', 'Iberia']);
        expect(split.codeshares).toEqual([]);
    });

    it('makes no claim when the duration is unknown', () => {
        const split = splitOperators(['AA', 'VY'], null);
        expect(names(split.operators)).toEqual(['American Airlines', 'Vueling']);
        expect(split.codeshares).toEqual([]);
    });

    it('keeps a long-haul carrier billed when it is the only name on the leg', () => {
        const split = splitOperators(['EK'], 90);
        expect(names(split.operators)).toEqual(['Emirates']);
        expect(split.codeshares).toEqual([]);
    });

    it('treats a carrier it has never heard of as a possible operator', () => {
        // Demoting only what is positively known to be intercontinental is what
        // makes forgetting a code cheap.
        const split = splitOperators(['LL', 'AA'], 90);
        expect(names(split.operators)).toEqual(['LL']);
        expect(names(split.codeshares)).toEqual(['American Airlines']);
    });

    it('does not demote the carriers based within reach of Europe', () => {
        // Istanbul–Madrid is under four hours and really is a Turkish Airlines
        // flight that Iberia sells.
        const split = splitOperators(['TK', 'IB'], 235);
        expect(names(split.operators)).toEqual(['Turkish Airlines', 'Iberia']);
        expect(split.codeshares).toEqual([]);
    });

    it('collapses a codeshare pair before splitting it', () => {
        const split = splitOperators(['U2', 'EZY', 'DL'], 90);
        expect(names(split.operators)).toEqual(['easyJet']);
        expect(names(split.codeshares)).toEqual(['Delta']);
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

    it('sends a TUI leg into TUI\'s own one-way search', () => {
        const url = airlineBookingUrl('X3', 'MAN', 'AGP', '2026-09-10') ?? '';

        expect(url).toContain('tui.co.uk/flight/search');
        expect(url).toContain('flyingFrom%5B%5D=MAN');
        expect(url).toContain('flyingTo%5B%5D=AGP');
        expect(url).toContain('depDate=2026-09-10');
        expect(url).toContain('isOneWay=true');
        // Every price on this page is for one traveller.
        expect(url).toContain('adults=1');
    });

    it('names the TUI carriers rather than showing a bare code', () => {
        // X3 was rendering as "X3" on the cards because it was in neither map.
        expect(airlineName('X3')).toBe('TUI fly');
        expect(airlineName('BY')).toBe('TUI Airways');
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
