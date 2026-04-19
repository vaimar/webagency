/**
 * ─── Affiliate Configuration ──────────────────────────────────────────────────
 *
 * HOW TO MONETIZE:
 *
 * 1. BOOKING.COM AFFILIATE  (up to 40% commission per booking)
 *    → Sign up: https://www.booking.com/affiliate-program/v2/index.html
 *    → Set your aid below after approval
 *
 * 2. SKYSCANNER AFFILIATE  (CPA per flight/hotel booking)
 *    → Sign up via: https://partners.skyscanner.net/
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

// ─── Affiliate IDs (set via env vars or hardcode after signup) ────────────────

const BOOKING_AID = process.env.REACT_APP_BOOKING_AID ?? '';
const SKYSCANNER_ASSOCIATE_ID = process.env.REACT_APP_SKYSCANNER_ID ?? '';
const KIWI_AFFILIATE_ID = process.env.REACT_APP_KIWI_ID ?? '';
const GYG_PARTNER_ID = process.env.REACT_APP_GYG_PARTNER_ID ?? '';
const TRIPADVISOR_CAMPAIGN = process.env.REACT_APP_TRIPADVISOR_ID ?? '';

// ─── Flight Booking URLs ──────────────────────────────────────────────────────

export const flightUrls = (origin: string, destination: string, dateStr: string) => ({
    googleFlights: `https://www.google.com/travel/flights?q=flights+from+${origin}+to+${destination}${dateStr ? `+on+${dateStr}` : ''}`,

    skyscanner: (() => {
        const ymd = dateStr.replace(/-/g, '');
        const base = `https://www.skyscanner.net/transport/flights/${origin.toLowerCase()}/${destination.toLowerCase()}/${ymd ? ymd.slice(2) : ''}`;
        return SKYSCANNER_ASSOCIATE_ID ? `${base}?associateId=${SKYSCANNER_ASSOCIATE_ID}` : base;
    })(),

    kiwi: (() => {
        const base = `https://www.kiwi.com/en/search/results/${origin}/${destination}/${dateStr}`;
        return KIWI_AFFILIATE_ID ? `${base}?affiliate=${KIWI_AFFILIATE_ID}` : base;
    })(),
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
    skyscanner: !!SKYSCANNER_ASSOCIATE_ID,
    kiwi: !!KIWI_AFFILIATE_ID,
    getYourGuide: !!GYG_PARTNER_ID,
    tripadvisor: !!TRIPADVISOR_CAMPAIGN,
    anyConfigured: !!(BOOKING_AID || SKYSCANNER_ASSOCIATE_ID || KIWI_AFFILIATE_ID || GYG_PARTNER_ID || TRIPADVISOR_CAMPAIGN),
});

