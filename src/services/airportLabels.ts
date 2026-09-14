// Airport codes, said in words.
//
// A three-letter code is precise and unreadable: KRK, TFS, NYO and BVA are a
// city, an island, a Stockholm bus ride and a Paris that is not Paris, and
// nobody should have to know that to read a flight. Everything a traveller
// looks at gets the city name; the code stays with it, because it is what the
// booking site and the boarding pass will say.
//
// Three sources, in order of how much they know:
//   1. the curated airport table — "London Stansted", "Paris Beauvais": it
//      already names the trap in the name;
//   2. the AirportRef the backend attaches to a routing, which covers the
//      thousands of airports the curated table has never heard of;
//   3. the code itself, unchanged, when nothing knows better.

import { getAirportMetadata } from '../data/airportMetadata';
import { getAirportCity } from '../data/airportCities';
import { AirportRef } from './hackerRoutes';

/**
 * "Ibiza (Eivissa)" → "Ibiza", "London, Essex" → "London". The backend's
 * municipality field is a place loosely punctuated, and the parenthetical is
 * never the half a traveller is looking for.
 */
const plainPlace = (value: string): string => value.split(/[(,]/)[0].trim();

/** The city an airport serves, or the code when nothing knows its name. */
export const cityName = (code?: string | null, ref?: AirportRef | null): string => {
    const upper = (code ?? '').trim().toUpperCase();
    const city = getAirportCity(upper);
    if (city) {
        return city.name;
    }
    const curated = upper ? getAirportMetadata(upper) : null;
    if (curated) {
        return curated.city;
    }
    if (ref?.municipality) {
        const place = plainPlace(ref.municipality);
        if (place) {
            return place;
        }
    }
    return upper;
};

/**
 * "Kraków (KRK)" from a name that has already been resolved — the trip cart
 * stores one with each leg, because the routing it came from is long gone by
 * the time someone opens their trip again.
 *
 * Falls back to the bare code rather than printing "KRK (KRK)", so an airport
 * nobody can name still looks deliberate.
 */
export const placeWithCode = (code?: string | null, name?: string | null): string => {
    const upper = (code ?? '').trim().toUpperCase();
    return !name || name.toUpperCase() === upper ? upper : `${name} (${upper})`;
};

/** "Kraków (KRK)" — the name people read, the code they book with. */
export const cityWithCode = (code?: string | null, ref?: AirportRef | null): string => {
    const upper = (code ?? '').trim().toUpperCase();
    const city = getAirportCity(upper);
    if (city) {
        return `${city.name} (${city.airports.join(' · ')})`;
    }
    return placeWithCode(upper, cityName(upper, ref));
};

/** The full "Kraków, Poland (KRK)" for a tooltip or an accessible name. */
export const airportTitle = (code?: string | null, ref?: AirportRef | null): string => {
    const upper = (code ?? '').trim().toUpperCase();
    const city = getAirportCity(upper);
    if (city) {
        return `${city.name}, ${city.country} — ${city.airports.join(', ')}`;
    }
    const curated = getAirportMetadata(upper);
    const country = curated?.country ?? ref?.isoCountry ?? '';
    const name = curated?.airportName ?? ref?.name ?? '';
    return [cityName(upper, ref), country].filter(Boolean).join(', ')
        + (name ? ` — ${name} (${upper})` : ` (${upper})`);
};
