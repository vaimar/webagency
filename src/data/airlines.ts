// Airline identity — names, logos and booking links, in one place so every
// flight surface brands a carrier the same way.

import { getAirportMetadata } from './airportMetadata';

// Airline IATA → display name. Falls back to the raw code so an unknown carrier
// is still shown honestly rather than hidden.
const AIRLINE_NAMES: Record<string, string> = {
    // Low-cost core
    FR: 'Ryanair', RK: 'Ryanair UK',
    U2: 'easyJet', EJU: 'easyJet Europe', EZY: 'easyJet',
    VY: 'Vueling', W6: 'Wizz Air', W9: 'Wizz Air UK',
    EW: 'Eurowings', TO: 'Transavia France', HV: 'Transavia',
    LS: 'Jet2', DY: 'Norwegian', UX: 'Air Europa', V7: 'Volotea',
    // European legacy / flag carriers
    BA: 'British Airways', IB: 'Iberia', AF: 'Air France',
    KL: 'KLM', LH: 'Lufthansa', SN: 'Brussels Airlines', AZ: 'ITA Airways',
    EI: 'Aer Lingus', LX: 'Swiss', OS: 'Austrian Airlines', TP: 'TAP Air Portugal',
    A3: 'Aegean Airlines', SK: 'SAS', AY: 'Finnair', LO: 'LOT Polish Airlines',
    BT: 'airBaltic', FI: 'Icelandair', OU: 'Croatia Airlines', JU: 'Air Serbia',
    RO: 'Tarom', XK: 'Air Corsica', UU: 'Air Austral', TX: 'Air Caraïbes',
    // Long-haul & intercontinental partners on the Paris hubs
    DL: 'Delta', AA: 'American Airlines', UA: 'United Airlines', AC: 'Air Canada',
    WS: 'WestJet', B6: 'JetBlue', AS: 'Alaska Airlines', VS: 'Virgin Atlantic',
    LA: 'LATAM', AM: 'Aeroméxico', G3: 'Gol', AD: 'Azul', AV: 'Avianca', AR: 'Aerolíneas Argentinas',
    QR: 'Qatar Airways', EK: 'Emirates', EY: 'Etihad', TK: 'Turkish Airlines',
    SV: 'Saudia', ME: 'Middle East Airlines', LY: 'El Al', GF: 'Gulf Air',
    MS: 'EgyptAir', AT: 'Royal Air Maroc', AH: 'Air Algérie', TU: 'Tunisair', KM: 'Air Malta',
    KQ: 'Kenya Airways', ET: 'Ethiopian Airlines', MK: 'Air Mauritius',
    SQ: 'Singapore Airlines', CX: 'Cathay Pacific', NH: 'ANA', JL: 'Japan Airlines',
    KE: 'Korean Air', OZ: 'Asiana Airlines', CI: 'China Airlines', BR: 'EVA Air',
    MU: 'China Eastern', CZ: 'China Southern', CA: 'Air China', MF: 'Xiamen Airlines',
    AI: 'Air India', '6E': 'IndiGo', VN: 'Vietnam Airlines', TG: 'Thai Airways',
    MH: 'Malaysia Airlines', GA: 'Garuda Indonesia', QF: 'Qantas', UL: 'SriLankan Airlines',
    WY: 'Oman Air', G9: 'Air Arabia', HU: 'Hainan Airlines', PK: 'Pakistan Intl',
};

export const airlineName = (code?: string | null): string => {
    if (!code) return 'Airline';
    return AIRLINE_NAMES[code.toUpperCase()] ?? code.toUpperCase();
};

/** Distinct operator names for a merged flight's carrier codes. */
export const operatorNames = (codes?: string[] | null): string[] => (
    Array.from(new Set((codes ?? []).map(airlineName)))
);

export interface AirlineBrand {
    code: string;
    name: string;
}

/**
 * One entry per distinct airline for a merged flight's carrier codes, keeping
 * the first code that resolves to each name — a codeshare listing U2 and EZY is
 * one easyJet with one logo, not two.
 */
export const operatorBrands = (codes?: string[] | null): AirlineBrand[] => {
    const byName = new Map<string, AirlineBrand>();
    for (const raw of codes ?? []) {
        if (!raw) continue;
        const code = raw.toUpperCase();
        const name = airlineName(code);
        if (!byName.has(name)) byName.set(name, { code, name });
    }
    return Array.from(byName.values());
};

/** Distinct carrier codes, upper-cased, in the order given. */
export const operatorCodes = (codes?: string[] | null): string[] => (
    Array.from(new Set((codes ?? []).filter(Boolean).map((code) => code.toUpperCase())))
);

// Display name → IATA code, for the surfaces that only ever got a name from
// the provider. First declaration wins, so "Ryanair" resolves to FR and not to
// the RK subsidiary that shares the name.
const CODES_BY_NAME: Record<string, string> = Object.entries(AIRLINE_NAMES)
    .reduce<Record<string, string>>((byName, [code, name]) => {
        const key = name.toLowerCase();
        if (!(key in byName)) byName[key] = code;
        return byName;
    }, {});

/** "FR 342", "FR342", "fr-342" → "FR". Flight numbers carry the marketing carrier. */
export const airlineCodeFromFlightNumber = (flightNumber?: string | null): string | null => {
    const match = flightNumber?.trim().match(/^([A-Z]{2}|[A-Z]\d|\d[A-Z])\s*[-]?\s*\d/i);
    return match ? match[1].toUpperCase() : null;
};

/**
 * Best available IATA code for a flight: the number's prefix first (it is the
 * carrier by definition), then a lookup of the provider's airline name.
 */
export const airlineCodeFor = (flightNumber?: string | null, airline?: string | null): string | null => {
    const fromNumber = airlineCodeFromFlightNumber(flightNumber);
    if (fromNumber) return fromNumber;
    const name = airline?.trim().toLowerCase();
    if (!name) return null;
    return CODES_BY_NAME[name] ?? (/^[a-z0-9]{2}$/.test(name) ? name.toUpperCase() : null);
};

/**
 * Carrier logo, from Kiwi's public logo CDN — keyless, keyed by IATA code, and
 * already the source behind the booking links this page sends people to. An
 * unknown code answers with a neutral grey aircraft glyph rather than a 404 or,
 * worse, another airline's mark; a blocked or failed request is handled by the
 * <AirlineLogo> fallback.
 */
export const airlineLogoUrl = (code: string): string => (
    `https://images.kiwi.com/airlines/64/${code.toUpperCase()}.png`
);

/**
 * Where to send someone to book a leg on the airline's own site.
 *
 * Two tiers, because airline URLs are not equal:
 *
 *   DEEP LINKS — a verified search URL carrying the route and date. Only added
 *   for carriers whose format we have actually confirmed against the live site.
 *   Never guessed: a deep link that has rotted is worse than a front door,
 *   because it lands on an error page and makes the fare look imaginary.
 *
 *   HOMEPAGES — everyone else. The aggregator links beside this one already
 *   carry the exact route and date; this one only has to reach the right
 *   airline.
 *
 * A carrier in neither tier gets NO airline link rather than a wrong one.
 */
type BookingUrlBuilder = (origin: string, destination: string, date: string) => string;

/** The plain city an airport serves, for booking forms that show a place name. */
const cityName = (iata: string): string => {
    const airport = getAirportMetadata(iata);
    return airport ? (airport.searchCity ?? airport.city) : iata;
};

const BOOKING_DEEP_LINKS: Record<string, BookingUrlBuilder> = {
    // Verified against aerlingus.com — one-way, one adult, economy.
    EI: (origin, destination, date) => 'https://www.aerlingus.com/app/make/flight-search-result'
        + '?fareType=ONEWAY&fareCategory=ECONOMY'
        + `&sourceAirportCode_0=${encodeURIComponent(origin)}`
        + `&destinationAirportCode_0=${encodeURIComponent(destination)}`
        + `&departureDate_0=${encodeURIComponent(date)}`
        + '&numAdults=1&numYoungAdults=0&numChildren=0&numInfants=0&promoCode=&groupBooking=false',

    // Iberia's booking form takes the date in three fields, with the month as
    // YYYYMM rather than MM, and carries the city names for display. Empty
    // END_* fields are what makes it one-way alongside TRIP_TYPE=1.
    IB: (origin, destination, date) => {
        const [year, month, day] = date.split('-');
        return 'https://www.iberia.com/flights/'
            + '?market=IE&language=en&appliesOMB=false&splitEndCity=false&initializedOMB=true'
            + '&flexible=true&TRIP_TYPE=1'
            + `&BEGIN_CITY_01=${encodeURIComponent(origin)}`
            + `&END_CITY_01=${encodeURIComponent(destination)}`
            + `&nombreOrigen=${encodeURIComponent(cityName(origin))}`
            + `&nombreDestino=${encodeURIComponent(cityName(destination))}`
            + `&BEGIN_DAY_01=${day}&BEGIN_MONTH_01=${year}${month}&BEGIN_YEAR_01=${year}`
            + '&END_DAY_01=&END_MONTH_01=&END_YEAR_01='
            + '&FARE_TYPE=R&quadrigam=IBHMPA&ADT=1&CHD=0&INF=0&BNN=0&YTH=0&YCD=0'
            + '&residentCode=&familianumerosa=&BV_UseBVCookie=no&boton=Search&bookingMarket=IE'
            + '#!/availability';
    },
};

const BOOKING_SITES: Record<string, string> = {

    // Low-cost core
    FR: 'https://www.ryanair.com/', RK: 'https://www.ryanair.com/',
    U2: 'https://www.easyjet.com/', EJU: 'https://www.easyjet.com/', EZY: 'https://www.easyjet.com/',
    VY: 'https://www.vueling.com/', W6: 'https://wizzair.com/', W9: 'https://wizzair.com/',
    EW: 'https://www.eurowings.com/', TO: 'https://www.transavia.com/', HV: 'https://www.transavia.com/',
    LS: 'https://www.jet2.com/', DY: 'https://www.norwegian.com/',
    UX: 'https://www.aireuropa.com/', V7: 'https://www.volotea.com/',
    // European legacy / flag carriers
    BA: 'https://www.britishairways.com/', IB: 'https://www.iberia.com/',
    AF: 'https://www.airfrance.com/', KL: 'https://www.klm.com/', LH: 'https://www.lufthansa.com/',
    SN: 'https://www.brusselsairlines.com/', AZ: 'https://www.ita-airways.com/',
    EI: 'https://www.aerlingus.com/', LX: 'https://www.swiss.com/', OS: 'https://www.austrian.com/',
    TP: 'https://www.flytap.com/', A3: 'https://en.aegeanair.com/', SK: 'https://www.flysas.com/',
    AY: 'https://www.finnair.com/', LO: 'https://www.lot.com/', BT: 'https://www.airbaltic.com/',
    FI: 'https://www.icelandair.com/', OU: 'https://www.croatiaairlines.com/',
    JU: 'https://www.airserbia.com/', KM: 'https://www.airmalta.com/',
    // Wider network carriers that turn up on the hub legs
    TK: 'https://www.turkishairlines.com/', MS: 'https://www.egyptair.com/',
    AT: 'https://www.royalairmaroc.com/',
};

/**
 * The operating airline's own booking link — a real search where we have a
 * verified deep-link format, its homepage otherwise, null when we know neither.
 * A missing date drops back to the homepage: a search URL with no date in it
 * is not a search.
 */
export const airlineBookingUrl = (
    code?: string | null,
    origin?: string | null,
    destination?: string | null,
    date?: string | null,
): string | null => {
    if (!code) return null;
    const upper = code.toUpperCase();
    const deepLink = BOOKING_DEEP_LINKS[upper];
    if (deepLink && origin && destination && date) {
        return deepLink(origin.toUpperCase(), destination.toUpperCase(), date);
    }
    return BOOKING_SITES[upper] ?? null;
};

/** Ryanair and its UK subsidiary — the carriers the free fare path can price itself. */
export const isRyanairCode = (code?: string | null): boolean => (
    code ? ['FR', 'RK'].includes(code.toUpperCase()) : false
);
