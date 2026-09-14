/**
 * ─── Affiliate Configuration ──────────────────────────────────────────────────
 *
 * HOW TO MONETIZE:
 *
 * 1. BOOKING.COM AFFILIATE  (up to 40% commission per booking)
 *    → Sign up: https://www.booking.com/affiliate-program/v2/index.html
 *    → Set your aid below after approval
 *
 * 2. (Skyscanner removed — every deep link answered with "Are you a person or
 *    a robot?", so the link cost a click and delivered a bot challenge.)
 *    → Get your associateId after approval
 *
 * 3. KIWI (TEQUILA) AFFILIATE  (commission per booking)
 *    → Sign up: https://partners.kiwi.com/
 *    → Get your affiliate_id after approval
 *
 * 4. GETYOURGUIDE AFFILIATE  (8% commission on activities/tours)
 *    → Sign up: https://www.getyourguide.com/travel-agents/
 *    → Get your partner_id after approval
 *
 * 5. HOSTELWORLD AFFILIATE  (commission per booking)
 *    → Sign up: https://www.hostelworld.com/affiliateprogram
 *    → Get your affiliate_id
 *
 * 6. TRIPADVISOR AFFILIATE  (up to 50% revenue share)
 *    → Sign up: https://www.tripadvisor.com/affiliates
 *    → Get your campaign ID
 *
 * 7. AMAZON ASSOCIATES  (for travel gear recommendations)
 *    → Sign up: https://affiliate-program.amazon.com/
 *    → Get your tag
 *
 * After signing up, set your IDs via environment variables or directly below.
 * Revenue estimate: A travel site with 10K monthly visitors can earn €500-€3000/month.
 */

import { getAirportMetadata } from '../data/airportMetadata';
import { readEnv } from './env';

// ─── Affiliate IDs (set via env vars or hardcode after signup) ────────────────

/**
 * Trimmed, because a stray space in a deploy environment variable would sail
 * straight into the tracking parameter and silently break attribution — the
 * link still works, the booking just stops being credited, and nothing anywhere
 * reports it.
 */
const readAffiliateId = (value: string | undefined): string => (value ?? '').trim();

const BOOKING_AID = readAffiliateId(readEnv('REACT_APP_BOOKING_AID'));
const KIWI_AFFILIATE_ID = readAffiliateId(readEnv('REACT_APP_KIWI_ID'));
const GYG_PARTNER_ID = readAffiliateId(readEnv('REACT_APP_GYG_PARTNER_ID'));
const TRIPADVISOR_CAMPAIGN = readAffiliateId(readEnv('REACT_APP_TRIPADVISOR_ID'));

// ─── Kiwi place slugs ─────────────────────────────────────────────────────────

/**
 * Kiwi keys its search path on a CITY, not an airport code.
 *
 * The URL used to be built from IATA codes — /results/SNN/AGP/2026-09-07 — which
 * loads Kiwi with both boxes empty and "A departure and a destination must be
 * filled in to search". The working shape is /results/madrid-spain/malaga-spain/,
 * so every link this produced was dead.
 */

// Letters that are their own characters rather than an accented base, so NFD
// leaves them alone: Wrocław has to reach Kiwi as "wroclaw".
const LETTER_SUBSTITUTIONS: Record<string, string> = {
    'ł': 'l', 'ø': 'o', 'æ': 'ae', 'å': 'a', 'ß': 'ss', 'đ': 'd', 'ð': 'd', 'þ': 'th',
};

export const slugifyPlace = (value: string): string => value
    .toLowerCase()
    .replace(/[łøæåßđðþ]/g, (letter) => LETTER_SUBSTITUTIONS[letter] ?? letter)
    // Split accented letters into base + mark, then drop the marks: Málaga → malaga.
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * A place the caller already knows about, for airports outside the curated set.
 * Sourced from the backend's airport table, which covers the whole world.
 */
export interface PlaceHint {
    /** Municipality as the data records it: "Ibiza (Eivissa)", "London, Essex". */
    municipality?: string | null;
    /** ISO 3166-1 alpha-2 country code. */
    isoCountry?: string | null;
}

/**
 * The city out of a municipality field.
 *
 * Airport data qualifies places in two ways — a parenthetical local name
 * ("Ibiza (Eivissa)") and an administrative tail ("London, Essex") — and Kiwi
 * wants neither. Whatever comes before the first comma or bracket is the city.
 */
export const cityFromMunicipality = (municipality: string): string => (
    municipality.split(/[,(]/)[0].trim()
);

/** ISO country code → English name, from the platform's own locale data. */
const countryName = (isoCountry: string): string | null => {
    try {
        return new Intl.DisplayNames(['en'], { type: 'region' }).of(isoCountry.toUpperCase()) ?? null;
    } catch {
        return null;
    }
};

/**
 * "AGP" → "malaga-spain".
 *
 * The curated metadata wins where it exists — its `searchCity` values are
 * hand-checked against Kiwi. Beyond those ~100 airports it falls back to the
 * hint the backend supplies, so a hub nobody has curated still gets a link
 * instead of silently losing one.
 */
export const kiwiPlaceSlug = (iata: string, hint?: PlaceHint | null): string | null => {
    const airport = getAirportMetadata(iata);
    if (airport) {
        const city = slugifyPlace(airport.searchCity ?? airport.city);
        const country = slugifyPlace(airport.country);
        if (city && country) {
            return `${city}-${country}`;
        }
    }
    if (hint?.municipality && hint?.isoCountry) {
        const city = slugifyPlace(cityFromMunicipality(hint.municipality));
        const country = countryName(hint.isoCountry);
        if (city && country) {
            return `${city}-${slugifyPlace(country)}`;
        }
    }
    return null;
};

/** Whole hour of "HH:mm" or an ISO date-time, or null if there isn't one. */
const hourOf = (value?: string | null): number | null => {
    const match = value?.match(/(?:^|T)(\d{2}):\d{2}/);
    if (!match) return null;
    const hour = Number(match[1]);
    return hour >= 0 && hour <= 23 ? hour : null;
};

/**
 * Kiwi's time filter: `times=depFrom-depTo-arrFrom-arrTo`, in whole hours.
 *
 * The hour a flight departs, through the next hour, contains that flight and
 * usually nothing else — MAD→AGP with `7-8-8-9` returns the 07:10 → 08:30 and
 * then says "no more trips for these dates". That is what turns the link from
 * "everything flying this city pair today" into the leg on the card, which
 * matters doubly because the path is keyed on a CITY: a time window is what
 * separates the CDG departure from the Orly one.
 *
 * Arrival hours are matched on the clock, so a leg landing after midnight
 * filters correctly without the date being involved.
 */
export const kiwiTimesParam = (departureTime?: string | null, arrivalTime?: string | null): string | null => {
    const departure = hourOf(departureTime);
    const arrival = hourOf(arrivalTime);
    if (departure === null || arrival === null) {
        return null;
    }
    // 24 is a valid upper bound — Kiwi accepts it and returns 23:59 arrivals.
    return `${departure}-${departure + 1}-${arrival}-${arrival + 1}`;
};

export interface FlightTimeWindow {
    /** "HH:mm", "HH:mm:ss" or an ISO date-time. */
    departureTime?: string | null;
    arrivalTime?: string | null;
}

/**
 * One-way Kiwi search for a leg, or '' when either end cannot be resolved to a
 * city — callers drop an empty link rather than sending anyone to a dead search.
 *
 * `/no-return` matters: without it Kiwi assumes a round trip and answers with
 * "10 nights in Málaga" packages, which is not what a one-way self-transfer leg
 * is asking about.
 */
export const kiwiSearchUrl = (
    origin: string,
    destination: string,
    dateStr: string,
    window?: FlightTimeWindow,
    places?: { origin?: PlaceHint | null; destination?: PlaceHint | null },
): string => {
    const from = kiwiPlaceSlug(origin, places?.origin);
    const to = kiwiPlaceSlug(destination, places?.destination);
    if (!from || !to || !dateStr) {
        return '';
    }
    const base = `https://www.kiwi.com/en/search/results/${from}/${to}/${dateStr}/no-return/`;
    const params = new URLSearchParams();
    const times = kiwiTimesParam(window?.departureTime, window?.arrivalTime);
    if (times) {
        params.set('times', times);
    }
    if (KIWI_AFFILIATE_ID) {
        params.set('affiliate', KIWI_AFFILIATE_ID);
    }
    const query = params.toString();
    return query ? `${base}?${query}` : base;
};

// ─── Flight Booking URLs ──────────────────────────────────────────────────────

export const flightUrls = (
    origin: string,
    destination: string,
    dateStr: string,
    window?: FlightTimeWindow,
    places?: { origin?: PlaceHint | null; destination?: PlaceHint | null },
) => ({
    ryanair: `https://www.ryanair.com/ie/en/trip/flights/select?adults=1&teens=0&children=0&infants=0&dateOut=${encodeURIComponent(dateStr)}&originIata=${encodeURIComponent(origin)}&destinationIata=${encodeURIComponent(destination)}&isReturn=false&discount=0&promoCode=&isConnectedFlight=false`,

    googleFlights: `https://www.google.com/travel/flights?q=flights+from+${origin}+to+${destination}${dateStr ? `+on+${dateStr}` : ''}`,

    kiwi: kiwiSearchUrl(origin, destination, dateStr, window, places),
});

// ─── Accommodation URLs ───────────────────────────────────────────────────────

export const accommodationUrls = (area: string, destination?: string) => {
    const q = encodeURIComponent(`${area}${destination ? ` ${destination}` : ''}`);
    return {
        booking: BOOKING_AID
            ? `https://www.booking.com/searchresults.html?ss=${q}&aid=${BOOKING_AID}`
            : `https://www.booking.com/searchresults.html?ss=${q}`,

        airbnb: `https://www.airbnb.com/s/${encodeURIComponent(`${area} ${destination ?? ''}`.trim())}/homes`,

        hostelworld: `https://www.hostelworld.com/st/search/s?q=${q}`,
    };
};

// ─── Restaurant / Activity URLs ───────────────────────────────────────────────

export const placeUrls = (name: string, destination?: string) => {
    const q = encodeURIComponent(`${name}${destination ? ` ${destination}` : ''}`);
    return {
        googleMaps: `https://www.google.com/maps/search/?api=1&query=${q}`,

        tripadvisor: TRIPADVISOR_CAMPAIGN
            ? `https://www.tripadvisor.com/Search?q=${q}&cm=${TRIPADVISOR_CAMPAIGN}`
            : `https://www.tripadvisor.com/Search?q=${q}`,

        googleSearch: (suffix: string) =>
            `https://www.google.com/search?q=${encodeURIComponent(`${name} ${destination ?? ''} ${suffix}`)}`,
    };
};

// ─── Activity / Tour Booking URLs ─────────────────────────────────────────────

export const activityUrls = (name: string, destination?: string) => {
    const q = encodeURIComponent(`${name}${destination ? ` ${destination}` : ''}`);
    return {
        ...placeUrls(name, destination),

        getYourGuide: GYG_PARTNER_ID
            ? `https://www.getyourguide.com/s/?q=${q}&partner_id=${GYG_PARTNER_ID}`
            : `https://www.getyourguide.com/s/?q=${q}`,

        viator: `https://www.viator.com/searchResults/all?text=${q}`,
    };
};

// ─── Affiliate status helper ──────────────────────────────────────────────────

export const getAffiliateStatus = () => ({
    booking: !!BOOKING_AID,
    kiwi: !!KIWI_AFFILIATE_ID,
    getYourGuide: !!GYG_PARTNER_ID,
    tripadvisor: !!TRIPADVISOR_CAMPAIGN,
    anyConfigured: !!(BOOKING_AID || KIWI_AFFILIATE_ID || GYG_PARTNER_ID || TRIPADVISOR_CAMPAIGN),
});

