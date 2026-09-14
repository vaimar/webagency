import { airportTitle, cityName, cityWithCode } from './airportLabels';

describe('airportLabels', () => {
    it('names a curated airport, keeping the city the airport is sold under', () => {
        expect(cityName('STN')).toBe('London Stansted');
        expect(cityWithCode('BVA')).toBe('Paris Beauvais (BVA)');
    });

    it('falls back to what the backend knows about an airport nobody curated', () => {
        expect(cityName('NYO', { iata: 'NYO', municipality: 'Nyköping', isoCountry: 'SE' }))
            .toBe('Nyköping');
        // "Ibiza (Eivissa)" and "London, Essex" are one place written loosely.
        expect(cityName('SEN', { iata: 'SEN', municipality: 'London, Essex' })).toBe('London');
    });

    it('leaves a code it cannot name alone rather than printing it twice', () => {
        expect(cityName('ZZZ')).toBe('ZZZ');
        expect(cityWithCode('ZZZ')).toBe('ZZZ');
    });

    it('spells a city token out as the airports it stands for', () => {
        expect(cityName('CITY-PAR')).toBe('Paris');
        expect(cityWithCode('CITY-PAR')).toBe('Paris (CDG · ORY · BVA)');
        expect(airportTitle('CITY-PAR')).toBe('Paris, France — CDG, ORY, BVA');
    });

    it('gives the long form a country and an airport name to sit in a tooltip', () => {
        expect(airportTitle('KRK')).toBe('Kraków, Poland — Kraków Airport (KRK)');
    });
});
