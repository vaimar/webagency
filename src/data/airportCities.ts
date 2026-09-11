// Cities that are served by more than one airport.
//
// "Fly to Paris" is a sentence about a city; CDG, ORY and BVA are three
// different answers to it, one of which is 85 km away in Beauvais. Picking the
// city and searching all three is what a traveller actually means, and it is
// the only way to see that the Beauvais fare is €40 cheaper and two hours
// further out — the comparison this app exists to make.
//
// WHY THE `CITY-` PREFIX, rather than the IATA metropolitan codes (PAR, LON):
// they only exist for some cities. Barcelona's metro code is BCN, Glasgow's is
// GLA, Brussels' is BRU — the same code as their main airport, so "BCN" cannot
// mean both "Barcelona airport" and "every Barcelona airport". Rather than a
// scheme where half the cities are a plain code and the other half need
// something else, every city here is one prefixed token that can never be read
// as an airport.

export interface AirportCity {
    /** Search token, e.g. "CITY-PAR". Never a valid IATA code. */
    code: string;
    name: string;
    country: string;
    flag: string;
    /**
     * The airports it stands for, best-known first. Not every one of these is
     * in the curated airport table — the schedule graph knows far more airports
     * than the picker lists, and a city is exactly where that matters.
     */
    airports: string[];
    /** Extra spellings people search by; the city name itself is always matched. */
    aliases?: string[];
}

/**
 * Kept deliberately short. A "city" here is one where a traveller can end up at
 * an airport they did not expect — the low-cost carriers' second airports, the
 * ones marketed under a city's name from an hour outside it. A city with one
 * airport does not need an entry: picking the airport IS picking the city.
 */
export const AIRPORT_CITIES: AirportCity[] = [
    {
        code: 'CITY-LON',
        name: 'London',
        country: 'United Kingdom',
        flag: '🇬🇧',
        airports: ['LHR', 'LGW', 'STN', 'LTN'],
        aliases: ['LONDRES'],
    },
    {
        code: 'CITY-PAR',
        name: 'Paris',
        country: 'France',
        flag: '🇫🇷',
        // Beauvais is 85 km out and sold as Paris — the whole reason to search
        // the city rather than an airport.
        airports: ['CDG', 'ORY', 'BVA'],
        aliases: ['PARIGI'],
    },
    {
        code: 'CITY-MIL',
        name: 'Milan',
        country: 'Italy',
        flag: '🇮🇹',
        airports: ['MXP', 'BGY', 'LIN'],
        aliases: ['MILANO', 'BERGAMO'],
    },
    {
        code: 'CITY-ROM',
        name: 'Rome',
        country: 'Italy',
        flag: '🇮🇹',
        airports: ['FCO', 'CIA'],
        aliases: ['ROMA', 'FIUMICINO', 'CIAMPINO'],
    },
    {
        code: 'CITY-BCN',
        name: 'Barcelona',
        country: 'Spain',
        flag: '🇪🇸',
        // Girona and Reus are both about 100 km from the city.
        airports: ['BCN', 'GRO', 'REU'],
        aliases: ['GIRONA', 'REUS'],
    },
    {
        code: 'CITY-BRU',
        name: 'Brussels',
        country: 'Belgium',
        flag: '🇧🇪',
        airports: ['BRU', 'CRL'],
        aliases: ['BRUXELLES', 'BRUSSEL', 'CHARLEROI'],
    },
    {
        code: 'CITY-VCE',
        name: 'Venice',
        country: 'Italy',
        flag: '🇮🇹',
        airports: ['VCE', 'TSF'],
        aliases: ['VENEZIA', 'TREVISO'],
    },
    {
        code: 'CITY-STO',
        name: 'Stockholm',
        country: 'Sweden',
        flag: '🇸🇪',
        airports: ['ARN', 'NYO', 'BMA'],
        aliases: ['SKAVSTA'],
    },
    {
        code: 'CITY-FRA',
        name: 'Frankfurt',
        country: 'Germany',
        flag: '🇩🇪',
        airports: ['FRA', 'HHN'],
        aliases: ['FRANKFURT HAHN'],
    },
    {
        code: 'CITY-DUS',
        name: 'Düsseldorf',
        country: 'Germany',
        flag: '🇩🇪',
        airports: ['DUS', 'NRN'],
        aliases: ['DUSSELDORF', 'WEEZE'],
    },
    {
        code: 'CITY-OSL',
        name: 'Oslo',
        country: 'Norway',
        flag: '🇳🇴',
        airports: ['OSL', 'TRF'],
        aliases: ['TORP', 'SANDEFJORD'],
    },
    {
        code: 'CITY-WAW',
        name: 'Warsaw',
        country: 'Poland',
        flag: '🇵🇱',
        airports: ['WAW', 'WMI'],
        aliases: ['WARSZAWA', 'MODLIN'],
    },
    {
        code: 'CITY-GLA',
        name: 'Glasgow',
        country: 'United Kingdom',
        flag: '🇬🇧',
        airports: ['GLA', 'PIK'],
        aliases: ['PRESTWICK'],
    },
    {
        code: 'CITY-BFS',
        name: 'Belfast',
        country: 'United Kingdom',
        flag: '🇬🇧',
        airports: ['BFS', 'BHD'],
        aliases: ['BELFAST CITY'],
    },
    {
        code: 'CITY-TCI',
        name: 'Tenerife',
        country: 'Spain',
        flag: '🇪🇸',
        airports: ['TFS', 'TFN'],
        aliases: ['TENERIFE SOUTH', 'TENERIFE NORTH'],
    },
];

const CITIES_BY_CODE = new Map(AIRPORT_CITIES.map((city) => [city.code, city]));

export const getAirportCity = (code?: string | null): AirportCity | null => (
    code ? CITIES_BY_CODE.get(code.trim().toUpperCase()) ?? null : null
);

export const isAirportCity = (code?: string | null): boolean => getAirportCity(code) !== null;

/**
 * The airports a search value stands for: every airport of a city, or the one
 * airport it already names. Every lookup goes through this, so the rest of the
 * app never has to know which kind of value it is holding.
 */
export const airportsFor = (code: string): string[] => (
    getAirportCity(code)?.airports ?? [code]
);

/** "London Gatwick · Stansted…" — how many airports, for a one-line summary. */
export const airportCountFor = (code: string): number => airportsFor(code).length;

const searchText = (city: AirportCity): string => (
    [city.name, city.country, ...city.airports, ...(city.aliases ?? [])].join(' ').toUpperCase()
);

/** Cities matching what someone has typed, best match first. */
export const searchAirportCities = (query: string): AirportCity[] => {
    const needle = query.trim().toUpperCase();
    if (!needle) {
        return [];
    }
    return AIRPORT_CITIES
        .filter((city) => searchText(city).includes(needle))
        // A city whose NAME starts with the query is what was meant; one that
        // merely contains it somewhere (an alias, an airport code) comes after.
        .sort((left, right) => (
            Number(right.name.toUpperCase().startsWith(needle)) - Number(left.name.toUpperCase().startsWith(needle))
        ));
};

/**
 * "🇫🇷 Paris, France — any airport", the way a booking site names a city in a
 * filled-in field. Which airports it stands for belongs in the dropdown row
 * and on the results, not in a box the traveller has to read sideways.
 */
export const formatAirportCityLabel = (city: AirportCity): string => (
    `${city.flag} ${city.name}, ${city.country} — any airport`
);
