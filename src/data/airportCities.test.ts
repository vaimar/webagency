import {
    airportsFor,
    formatAirportCityLabel,
    getAirportCity,
    isAirportCity,
    searchAirportCities,
    AIRPORT_CITIES,
} from './airportCities';

describe('airportCities', () => {
    it('stands for every airport of the city', () => {
        expect(airportsFor('CITY-PAR')).toEqual(['CDG', 'ORY', 'BVA']);
        expect(airportsFor('CITY-LON')).toContain('STN');
    });

    it('leaves a plain airport code as the one airport it is', () => {
        expect(airportsFor('AGP')).toEqual(['AGP']);
        expect(isAirportCity('AGP')).toBe(false);
    });

    it('finds a city by its name, its local spelling or one of its airports', () => {
        expect(searchAirportCities('paris')[0].code).toBe('CITY-PAR');
        expect(searchAirportCities('roma')[0].code).toBe('CITY-ROM');
        // Bergamo is sold as Milan, which is exactly why someone types it.
        expect(searchAirportCities('bergamo')[0].code).toBe('CITY-MIL');
        expect(searchAirportCities('CRL')[0].code).toBe('CITY-BRU');
    });

    it('puts a city whose name starts with the query first', () => {
        // "Bel" is the start of Belfast and sits inside nothing else.
        expect(searchAirportCities('bel')[0].name).toBe('Belfast');
    });

    it('reads as a place in a filled-in field, not as a list of codes', () => {
        expect(formatAirportCityLabel(getAirportCity('CITY-PAR')!))
            .toBe('🇫🇷 Paris, France — any airport');
    });

    it('never gives a city a token that could be read as an airport code', () => {
        // The whole reason for the prefix: Barcelona's metro code IS "BCN".
        for (const city of AIRPORT_CITIES) {
            expect(city.code).toMatch(/^CITY-[A-Z]{3}$/);
            expect(city.airports.length).toBeGreaterThan(1);
        }
    });
});
