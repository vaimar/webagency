/**
 * transferEstimate.ts
 *
 * Estimates the taxi cost from an airport to its city centre.
 * Ported from the Haversine logic in VanDerCroix/Taxi-fare-calculator,
 * adapted with European taxi rate tables and airport/city-centre coordinate data.
 *
 * Returns an estimate flagged as 'calculated' when we have known coordinates,
 * or 'country-average' as a fallback. NEVER added to realWorldEntryPrice
 * automatically — surfaced as a potential extra cost only.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TransferEstimate {
    distanceKm: number;
    estimatedFare: number;
    currency: string;
    isNightRate: boolean;
    /** 'calculated' = real coordinates used; 'country-average' = rate applied to typical distance */
    confidence: 'calculated' | 'country-average';
    /** Cheapest public-transport alternative if it exists */
    publicTransport?: {
        mode: string;
        costEur: number;
        /** minutes from terminal to city centre */
        durationMins: number;
    };
}

export interface AirportTransferContext {
    airportCode: string;
    airportCoordinates: { lat: number; lon: number };
    cityCoordinates: { lat: number; lon: number };
    country: string;
    publicTransport?: {
        mode: string;
        costEur: number;
        durationMins: number;
    };
}

interface Coords {
    lat: number;
    lng: number;
}

interface AirportTransferData {
    airport: Coords;
    city: Coords;
    /** ISO 3166-1 alpha-2 */
    country: string;
    publicTransport?: {
        mode: string;
        costEur: number;
        durationMins: number;
    };
}

interface TaxiRate {
    /** per km in local currency */
    ratePerKm: number;
    flagFall: number;
    currency: string;
    /** multiplier applied for night hours (default: 1.25) */
    nightMultiplier: number;
}

// ─── Haversine Formula (from VanDerCroix/Taxi-fare-calculator) ────────────────

const haversineKm = (a: Coords, b: Coords): number => {
    const R = 6_378_137; // Earth radius in metres
    const dLat = (b.lat - a.lat) * (Math.PI / 180);
    const dLng = (b.lng - a.lng) * (Math.PI / 180);
    const sinLat = Math.sin(dLat / 2);
    const sinLng = Math.sin(dLng / 2);
    const h = sinLat * sinLat
        + Math.cos(a.lat * (Math.PI / 180))
        * Math.cos(b.lat * (Math.PI / 180))
        * sinLng * sinLng;
    const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    return (R * c) / 1_000;
};

// ─── Per-country taxi rates ───────────────────────────────────────────────────
// Sources: UITP, national taxi associations, 2024-2025 tariffs.
// Rates in EUR (GBP converted at ≈1.17).

const TAXI_RATES: Record<string, TaxiRate> = {
    IE: { ratePerKm: 1.03, flagFall: 3.80, currency: 'EUR', nightMultiplier: 1.50 },
    FR: { ratePerKm: 1.50, flagFall: 4.45, currency: 'EUR', nightMultiplier: 1.35 },
    ES: { ratePerKm: 1.05, flagFall: 3.95, currency: 'EUR', nightMultiplier: 1.25 },
    PT: { ratePerKm: 0.87, flagFall: 3.25, currency: 'EUR', nightMultiplier: 1.25 },
    IT: { ratePerKm: 1.50, flagFall: 5.50, currency: 'EUR', nightMultiplier: 1.30 },
    DE: { ratePerKm: 2.00, flagFall: 3.90, currency: 'EUR', nightMultiplier: 1.20 },
    GB: { ratePerKm: 2.81, flagFall: 4.45, currency: 'EUR', nightMultiplier: 1.30 }, // £2.40/km × 1.17
    GR: { ratePerKm: 1.20, flagFall: 4.36, currency: 'EUR', nightMultiplier: 1.25 },
    AT: { ratePerKm: 1.42, flagFall: 5.06, currency: 'EUR', nightMultiplier: 1.20 },
    CZ: { ratePerKm: 0.91, flagFall: 1.36, currency: 'EUR', nightMultiplier: 1.20 },
    HU: { ratePerKm: 0.95, flagFall: 2.00, currency: 'EUR', nightMultiplier: 1.20 },
    PL: { ratePerKm: 0.80, flagFall: 2.50, currency: 'EUR', nightMultiplier: 1.20 },
    RO: { ratePerKm: 0.40, flagFall: 2.00, currency: 'EUR', nightMultiplier: 1.20 },
    BG: { ratePerKm: 0.50, flagFall: 1.50, currency: 'EUR', nightMultiplier: 1.20 },
    MA: { ratePerKm: 0.60, flagFall: 2.00, currency: 'EUR', nightMultiplier: 1.20 },
    MT: { ratePerKm: 1.50, flagFall: 3.00, currency: 'EUR', nightMultiplier: 1.25 },
    BE: { ratePerKm: 1.90, flagFall: 4.50, currency: 'EUR', nightMultiplier: 1.25 },
    DK: { ratePerKm: 2.68, flagFall: 5.40, currency: 'EUR', nightMultiplier: 1.30 }, // converted DKK
    CY: { ratePerKm: 1.50, flagFall: 3.50, currency: 'EUR', nightMultiplier: 1.25 },
};

// ─── Airport → city-centre data ──────────────────────────────────────────────
// Coordinates: WGS-84. City centre = main square / central station.

const AIRPORT_DATA: Record<string, AirportTransferData> = {
    // ── Ireland ──────────────────────────────────────────────────────────────
    DUB: {
        airport: { lat: 53.4213, lng: -6.2701 },
        city:    { lat: 53.3498, lng: -6.2603 },
        country: 'IE',
        publicTransport: { mode: 'Aircoach / Dublin Bus', costEur: 10, durationMins: 35 },
    },
    ORK: {
        airport: { lat: 51.8413, lng: -8.4912 },
        city:    { lat: 51.8985, lng: -8.4756 },
        country: 'IE',
        publicTransport: { mode: 'Bus Éireann 226', costEur: 6, durationMins: 30 },
    },
    KIR: {
        airport: { lat: 52.1809, lng: -9.5238 },
        city:    { lat: 52.0593, lng: -9.5039 },
        country: 'IE',
    },
    NOC: {
        airport: { lat: 53.9103, lng: -8.8186 },
        city:    { lat: 53.8478, lng: -9.2972 },
        country: 'IE',
    },
    SNN: {
        airport: { lat: 52.7018, lng: -8.9248 },
        city:    { lat: 52.6640, lng: -8.6294 },
        country: 'IE',
        publicTransport: { mode: 'Bus Éireann 343', costEur: 7, durationMins: 45 },
    },
    // ── France ───────────────────────────────────────────────────────────────
    BVA: {
        airport: { lat: 49.4544, lng:  2.1128 },
        city:    { lat: 48.8566, lng:  2.3522 }, // Paris centre
        country: 'FR',
        publicTransport: { mode: 'Ouibus / Flixbus to Paris', costEur: 17, durationMins: 85 },
    },
    BOD: {
        airport: { lat: 44.8283, lng: -0.7153 },
        city:    { lat: 44.8378, lng: -0.5792 },
        country: 'FR',
        publicTransport: { mode: 'Tram C', costEur: 2, durationMins: 40 },
    },
    NTE: {
        airport: { lat: 47.1532, lng: -1.6108 },
        city:    { lat: 47.2184, lng: -1.5536 },
        country: 'FR',
        publicTransport: { mode: 'Bus TAN Line 98', costEur: 2, durationMins: 30 },
    },
    NCE: {
        airport: { lat: 43.6584, lng:  7.2159 },
        city:    { lat: 43.7102, lng:  7.2620 },
        country: 'FR',
        publicTransport: { mode: 'Tram T2', costEur: 2, durationMins: 20 },
    },
    TLS: {
        airport: { lat: 43.6293, lng:  1.3678 },
        city:    { lat: 43.6047, lng:  1.4442 },
        country: 'FR',
        publicTransport: { mode: 'Tram T2', costEur: 2, durationMins: 30 },
    },
    LYS: {
        airport: { lat: 45.7256, lng:  5.0881 },
        city:    { lat: 45.7640, lng:  4.8357 },
        country: 'FR',
        publicTransport: { mode: 'Rhônexpress tram', costEur: 17, durationMins: 30 },
    },
    SXB: {
        airport: { lat: 48.5383, lng:  7.6282 },
        city:    { lat: 48.5734, lng:  7.7521 },
        country: 'FR',
        publicTransport: { mode: 'Bus Line 30', costEur: 2, durationMins: 25 },
    },
    MPL: {
        airport: { lat: 43.5762, lng:  3.9631 },
        city:    { lat: 43.6119, lng:  3.8772 },
        country: 'FR',
        publicTransport: { mode: 'Bus Line 120', costEur: 2, durationMins: 30 },
    },
    MRS: {
        airport: { lat: 43.4393, lng:  5.2213 },
        city:    { lat: 43.2965, lng:  5.3818 },
        country: 'FR',
        publicTransport: { mode: 'Bus Navette 91', costEur: 10, durationMins: 30 },
    },
    // ── Spain ────────────────────────────────────────────────────────────────
    BCN: {
        airport: { lat: 41.2971, lng:  2.0785 },
        city:    { lat: 41.3851, lng:  2.1734 },
        country: 'ES',
        publicTransport: { mode: 'Aerobus / Metro L9', costEur: 5, durationMins: 35 },
    },
    MAD: {
        airport: { lat: 40.4719, lng: -3.5626 },
        city:    { lat: 40.4168, lng: -3.7038 },
        country: 'ES',
        publicTransport: { mode: 'Metro Line 8', costEur: 6, durationMins: 25 },
    },
    IBZ: {
        airport: { lat: 38.8731, lng:  1.3731 },
        city:    { lat: 38.9068, lng:  1.4321 },
        country: 'ES',
    },
    AGP: {
        airport: { lat: 36.6749, lng: -4.4991 },
        city:    { lat: 36.7213, lng: -4.4216 },
        country: 'ES',
        publicTransport: { mode: 'Cercanías train', costEur: 3, durationMins: 15 },
    },
    ALC: {
        airport: { lat: 38.2822, lng: -0.5582 },
        city:    { lat: 38.3452, lng: -0.4812 },
        country: 'ES',
        publicTransport: { mode: 'Bus C-6', costEur: 3, durationMins: 35 },
    },
    PMI: {
        airport: { lat: 39.5517, lng:  2.7388 },
        city:    { lat: 39.5696, lng:  2.6502 },
        country: 'ES',
        publicTransport: { mode: 'Bus Line 1 / EMT', costEur: 3, durationMins: 30 },
    },
    MAH: {
        airport: { lat: 39.8626, lng:  4.2186 },
        city:    { lat: 39.9957, lng:  3.9956 },
        country: 'ES',
    },
    TFS: {
        airport: { lat: 28.0445, lng: -16.5725 },
        city:    { lat: 28.0689, lng: -16.7249 },
        country: 'ES',
    },
    FUE: {
        airport: { lat: 28.4527, lng: -13.8638 },
        city:    { lat: 28.4988, lng: -13.8633 },
        country: 'ES',
    },
    LPA: {
        airport: { lat: 27.9319, lng: -15.3866 },
        city:    { lat: 28.1235, lng: -15.4366 },
        country: 'ES',
        publicTransport: { mode: 'Bus Global 60', costEur: 3, durationMins: 40 },
    },
    ACE: {
        airport: { lat: 28.9455, lng: -13.6052 },
        city:    { lat: 28.9637, lng: -13.5500 },
        country: 'ES',
        publicTransport: { mode: 'Bus Arrecife', costEur: 2, durationMins: 20 },
    },
    GRO: {
        airport: { lat: 41.9010, lng:  2.7603 },
        city:    { lat: 41.3851, lng:  2.1734 }, // Barcelona centre
        country: 'ES',
        publicTransport: { mode: 'Sagalés bus to Barcelona', costEur: 16, durationMins: 80 },
    },
    REU: {
        airport: { lat: 41.1474, lng:  1.1672 },
        city:    { lat: 41.3851, lng:  2.1734 }, // Barcelona centre
        country: 'ES',
        publicTransport: { mode: 'Bus to Salou / train to Barcelona', costEur: 20, durationMins: 90 },
    },
    SVQ: {
        airport: { lat: 37.4180, lng: -5.8931 },
        city:    { lat: 37.3891, lng: -5.9845 },
        country: 'ES',
        publicTransport: { mode: 'Bus EA Sevilla', costEur: 4, durationMins: 35 },
    },
    VLC: {
        airport: { lat: 39.4893, lng: -0.4816 },
        city:    { lat: 39.4699, lng: -0.3763 },
        country: 'ES',
        publicTransport: { mode: 'Metro Line 3', costEur: 5, durationMins: 30 },
    },
    SDR: {
        airport: { lat: 43.4271, lng: -3.8200 },
        city:    { lat: 43.4623, lng: -3.8099 },
        country: 'ES',
    },
    VIT: {
        airport: { lat: 42.8828, lng: -2.7246 },
        city:    { lat: 42.8467, lng: -2.6717 },
        country: 'ES',
    },
    ZAZ: {
        airport: { lat: 41.6662, lng: -1.0415 },
        city:    { lat: 41.6488, lng: -0.8890 },
        country: 'ES',
        publicTransport: { mode: 'Bus Line 501', costEur: 3, durationMins: 30 },
    },
    SCQ: {
        airport: { lat: 42.8963, lng: -8.4151 },
        city:    { lat: 42.8782, lng: -8.5448 },
        country: 'ES',
        publicTransport: { mode: 'Bus Line 6A', costEur: 3, durationMins: 30 },
    },
    CDT: {
        airport: { lat: 39.9929, lng: -0.0726 },
        city:    { lat: 39.4699, lng: -0.3763 }, // Valencia centre
        country: 'ES',
    },
    LEI: {
        airport: { lat: 36.8439, lng: -2.3702 },
        city:    { lat: 36.8381, lng: -2.4597 },
        country: 'ES',
    },
    // ── Portugal ─────────────────────────────────────────────────────────────
    LIS: {
        airport: { lat: 38.7742, lng: -9.1342 },
        city:    { lat: 38.7167, lng: -9.1399 },
        country: 'PT',
        publicTransport: { mode: 'Metro Red Line', costEur: 2, durationMins: 25 },
    },
    OPO: {
        airport: { lat: 41.2481, lng: -8.6814 },
        city:    { lat: 41.1579, lng: -8.6291 },
        country: 'PT',
        publicTransport: { mode: 'Metro Violet Line', costEur: 2, durationMins: 35 },
    },
    FAO: {
        airport: { lat: 37.0144, lng: -7.9659 },
        city:    { lat: 37.0194, lng: -7.9322 },
        country: 'PT',
    },
    // ── Italy ────────────────────────────────────────────────────────────────
    CIA: {
        airport: { lat: 41.7994, lng:  12.5949 },
        city:    { lat: 41.9028, lng:  12.4964 },
        country: 'IT',
        publicTransport: { mode: 'Terravision / SIT Bus shuttle', costEur: 7, durationMins: 50 },
    },
    BRI: {
        airport: { lat: 41.1389, lng:  16.7606 },
        city:    { lat: 41.1171, lng:  16.8719 },
        country: 'IT',
        publicTransport: { mode: 'Tempesta bus', costEur: 5, durationMins: 30 },
    },
    BLQ: {
        airport: { lat: 44.5354, lng:  11.2887 },
        city:    { lat: 44.4949, lng:  11.3426 },
        country: 'IT',
        publicTransport: { mode: 'Aerobus BLQ shuttle', costEur: 6, durationMins: 30 },
    },
    CTA: {
        airport: { lat: 37.4668, lng:  15.0664 },
        city:    { lat: 37.5079, lng:  15.0830 },
        country: 'IT',
        publicTransport: { mode: 'Bus Alibus', costEur: 6, durationMins: 20 },
    },
    MXP: {
        airport: { lat: 45.6301, lng:  8.7231 },
        city:    { lat: 45.4654, lng:  9.1866 },
        country: 'IT',
        publicTransport: { mode: 'Malpensa Express train', costEur: 14, durationMins: 50 },
    },
    NAP: {
        airport: { lat: 40.8860, lng:  14.2908 },
        city:    { lat: 40.8518, lng:  14.2681 },
        country: 'IT',
        publicTransport: { mode: 'Alibus shuttle', costEur: 5, durationMins: 30 },
    },
    PSA: {
        airport: { lat: 43.6839, lng:  10.3927 },
        city:    { lat: 43.7228, lng:  10.4017 },
        country: 'IT',
        publicTransport: { mode: 'PisaMover + train', costEur: 5, durationMins: 30 },
    },
    TRN: {
        airport: { lat: 45.2008, lng:  7.6497 },
        city:    { lat: 45.0703, lng:  7.6869 },
        country: 'IT',
        publicTransport: { mode: 'Bus Sadem', costEur: 7, durationMins: 40 },
    },
    TSF: {
        airport: { lat: 45.6483, lng:  12.1939 },
        city:    { lat: 45.4408, lng:  12.3155 }, // Venice centre
        country: 'IT',
        publicTransport: { mode: 'ATVO bus to Venezia', costEur: 14, durationMins: 70 },
    },
    // ── Greece ───────────────────────────────────────────────────────────────
    ATH: {
        airport: { lat: 37.9364, lng:  23.9445 },
        city:    { lat: 37.9838, lng:  23.7275 },
        country: 'GR',
        publicTransport: { mode: 'Metro Line 3', costEur: 10, durationMins: 45 },
    },
    CHQ: {
        airport: { lat: 35.5317, lng:  24.1497 },
        city:    { lat: 35.5138, lng:  24.0180 },
        country: 'GR',
        publicTransport: { mode: 'KTEL bus', costEur: 4, durationMins: 30 },
    },
    CFU: {
        airport: { lat: 39.6019, lng:  19.9117 },
        city:    { lat: 39.6243, lng:  19.9217 },
        country: 'GR',
    },
    JMK: {
        airport: { lat: 37.4352, lng:  25.3481 },
        city:    { lat: 37.4467, lng:  25.3289 },
        country: 'GR',
    },
    PVK: {
        airport: { lat: 38.9255, lng:  20.7654 },
        city:    { lat: 38.9623, lng:  20.7414 },
        country: 'GR',
    },
    RHO: {
        airport: { lat: 36.4054, lng:  28.0860 },
        city:    { lat: 36.4346, lng:  28.2176 },
        country: 'GR',
        publicTransport: { mode: 'Bus Line 5', costEur: 3, durationMins: 25 },
    },
    JTR: {
        airport: { lat: 36.3992, lng:  25.4793 },
        city:    { lat: 36.4618, lng:  25.4319 },
        country: 'GR',
    },
    SKG: {
        airport: { lat: 40.5197, lng:  22.9709 },
        city:    { lat: 40.6401, lng:  22.9444 },
        country: 'GR',
        publicTransport: { mode: 'Bus Line 78', costEur: 2, durationMins: 50 },
    },
    ZTH: {
        airport: { lat: 37.7509, lng:  20.8843 },
        city:    { lat: 37.7906, lng:  20.8945 },
        country: 'GR',
    },
    // ── UK ───────────────────────────────────────────────────────────────────
    STN: {
        airport: { lat: 51.8850, lng:  0.2350 },
        city:    { lat: 51.5074, lng: -0.1278 }, // London centre
        country: 'GB',
        publicTransport: { mode: 'Stansted Express train', costEur: 22, durationMins: 50 },
    },
    LGW: {
        airport: { lat: 51.1537, lng: -0.1821 },
        city:    { lat: 51.5074, lng: -0.1278 },
        country: 'GB',
        publicTransport: { mode: 'Gatwick Express train', costEur: 22, durationMins: 45 },
    },
    LTN: {
        airport: { lat: 51.8747, lng: -0.3683 },
        city:    { lat: 51.5074, lng: -0.1278 },
        country: 'GB',
        publicTransport: { mode: 'Thameslink + Shuttle', costEur: 20, durationMins: 55 },
    },
    MAN: {
        airport: { lat: 53.3537, lng: -2.2750 },
        city:    { lat: 53.4808, lng: -2.2426 },
        country: 'GB',
        publicTransport: { mode: 'Bus/Train to Piccadilly', costEur: 5, durationMins: 20 },
    },
    EDI: {
        airport: { lat: 55.9500, lng: -3.3725 },
        city:    { lat: 55.9533, lng: -3.1883 },
        country: 'GB',
        publicTransport: { mode: 'Tram', costEur: 8, durationMins: 35 },
    },
    ABZ: {
        airport: { lat: 57.2019, lng: -2.1978 },
        city:    { lat: 57.1497, lng: -2.0943 },
        country: 'GB',
        publicTransport: { mode: 'First Bus 727', costEur: 4, durationMins: 40 },
    },
    BFS: {
        airport: { lat: 54.6575, lng: -6.2158 },
        city:    { lat: 54.5973, lng: -5.9301 },
        country: 'GB',
        publicTransport: { mode: 'Airport Express bus', costEur: 10, durationMins: 60 },
    },
    BHX: {
        airport: { lat: 52.4539, lng: -1.7480 },
        city:    { lat: 52.4862, lng: -1.8904 },
        country: 'GB',
        publicTransport: { mode: 'Rail link to New Street', costEur: 4, durationMins: 20 },
    },
    BOH: {
        airport: { lat: 50.7800, lng: -1.8425 },
        city:    { lat: 50.7192, lng: -1.8808 },
        country: 'GB',
    },
    BRS: {
        airport: { lat: 51.3827, lng: -2.7191 },
        city:    { lat: 51.4545, lng: -2.5879 },
        country: 'GB',
        publicTransport: { mode: 'Airport Flyer bus', costEur: 12, durationMins: 40 },
    },
    EMA: {
        airport: { lat: 52.8311, lng: -1.3282 },
        city:    { lat: 52.6369, lng: -1.1398 }, // Leicester
        country: 'GB',
    },
    GLA: {
        airport: { lat: 55.8719, lng: -4.4331 },
        city:    { lat: 55.8617, lng: -4.2583 },
        country: 'GB',
        publicTransport: { mode: 'Bus 500 / 77X', costEur: 9, durationMins: 25 },
    },
    PIK: {
        airport: { lat: 55.5094, lng: -4.5864 },
        city:    { lat: 55.8617, lng: -4.2583 }, // Glasgow
        country: 'GB',
        publicTransport: { mode: 'Train to Glasgow Central', costEur: 10, durationMins: 50 },
    },
    LPL: {
        airport: { lat: 53.3336, lng: -2.8497 },
        city:    { lat: 53.4084, lng: -2.9916 },
        country: 'GB',
        publicTransport: { mode: 'Bus 86A', costEur: 4, durationMins: 35 },
    },
    NCL: {
        airport: { lat: 55.0375, lng: -1.6917 },
        city:    { lat: 54.9783, lng: -1.6178 },
        country: 'GB',
        publicTransport: { mode: 'Metro Yellow Line', costEur: 4, durationMins: 25 },
    },
    NQY: {
        airport: { lat: 50.4406, lng: -4.9954 },
        city:    { lat: 50.4130, lng: -5.0797 },
        country: 'GB',
    },
    // ── Belgium ──────────────────────────────────────────────────────────────
    CRL: {
        airport: { lat: 50.4592, lng:  4.4528 },
        city:    { lat: 50.8503, lng:  4.3517 }, // Brussels centre
        country: 'BE',
        publicTransport: { mode: 'TEC bus + train', costEur: 15, durationMins: 70 },
    },
    // ── Germany ──────────────────────────────────────────────────────────────
    BER: {
        airport: { lat: 52.3667, lng:  13.5033 },
        city:    { lat: 52.5200, lng:  13.4050 },
        country: 'DE',
        publicTransport: { mode: 'S-Bahn S9', costEur: 4, durationMins: 40 },
    },
    BRE: {
        airport: { lat: 53.0475, lng:   8.7869 },
        city:    { lat: 53.0793, lng:   8.8017 },
        country: 'DE',
        publicTransport: { mode: 'Tram 6', costEur: 3, durationMins: 20 },
    },
    CGN: {
        airport: { lat: 50.8659, lng:   7.1427 },
        city:    { lat: 50.9333, lng:   6.9599 },
        country: 'DE',
        publicTransport: { mode: 'S-Bahn S13', costEur: 4, durationMins: 30 },
    },
    DTM: {
        airport: { lat: 51.5183, lng:   7.6122 },
        city:    { lat: 51.5136, lng:   7.4653 },
        country: 'DE',
        publicTransport: { mode: 'Bus AirlinerDortmund', costEur: 7, durationMins: 35 },
    },
    HAM: {
        airport: { lat: 53.6304, lng:   9.9882 },
        city:    { lat: 53.5753, lng:   9.9936 },
        country: 'DE',
        publicTransport: { mode: 'S-Bahn S1', costEur: 4, durationMins: 27 },
    },
    FMM: {
        airport: { lat: 47.9888, lng:  10.2394 },
        city:    { lat: 48.1374, lng:  11.5755 }, // Munich centre
        country: 'DE',
        publicTransport: { mode: 'Bus X96 + ICE', costEur: 15, durationMins: 80 },
    },
    NUE: {
        airport: { lat: 49.4987, lng:  11.0669 },
        city:    { lat: 49.4521, lng:  11.0767 },
        country: 'DE',
        publicTransport: { mode: 'Metro U2', costEur: 3, durationMins: 15 },
    },
    NRN: {
        airport: { lat: 51.6024, lng:   6.1422 },
        city:    { lat: 51.2217, lng:   6.7762 }, // Düsseldorf
        country: 'DE',
        publicTransport: { mode: 'Bus SB 30', costEur: 8, durationMins: 60 },
    },
    STR: {
        airport: { lat: 48.6899, lng:   9.2220 },
        city:    { lat: 48.7758, lng:   9.1829 },
        country: 'DE',
        publicTransport: { mode: 'S-Bahn S2/S3', costEur: 4, durationMins: 25 },
    },
    // ── Austria ──────────────────────────────────────────────────────────────
    VIE: {
        airport: { lat: 48.1103, lng:  16.5697 },
        city:    { lat: 48.2082, lng:  16.3738 },
        country: 'AT',
        publicTransport: { mode: 'CAT train / S-Bahn S7', costEur: 13, durationMins: 30 },
    },
    // ── Czech Republic ───────────────────────────────────────────────────────
    PRG: {
        airport: { lat: 50.1008, lng:  14.2600 },
        city:    { lat: 50.0755, lng:  14.4378 },
        country: 'CZ',
        publicTransport: { mode: 'Bus 119 + Metro', costEur: 2, durationMins: 50 },
    },
    // ── Hungary ──────────────────────────────────────────────────────────────
    BUD: {
        airport: { lat: 47.4298, lng:  19.2611 },
        city:    { lat: 47.4979, lng:  19.0402 },
        country: 'HU',
        publicTransport: { mode: 'Bus 100E express', costEur: 4, durationMins: 40 },
    },
    // ── Poland ───────────────────────────────────────────────────────────────
    KRK: {
        airport: { lat: 50.0777, lng:  19.7848 },
        city:    { lat: 50.0647, lng:  19.9450 },
        country: 'PL',
        publicTransport: { mode: 'Train + tram', costEur: 3, durationMins: 35 },
    },
    WRO: {
        airport: { lat: 51.1027, lng:  16.8858 },
        city:    { lat: 51.1079, lng:  17.0385 },
        country: 'PL',
        publicTransport: { mode: 'Tram 106', costEur: 2, durationMins: 30 },
    },
    GDN: {
        airport: { lat: 54.3776, lng:  18.4662 },
        city:    { lat: 54.3520, lng:  18.6466 },
        country: 'PL',
        publicTransport: { mode: 'Bus 210 / train PKM', costEur: 3, durationMins: 35 },
    },
    // ── Romania ──────────────────────────────────────────────────────────────
    OTP: {
        airport: { lat: 44.5722, lng:  26.1020 },
        city:    { lat: 44.4268, lng:  26.1025 },
        country: 'RO',
        publicTransport: { mode: 'Express bus 783', costEur: 2, durationMins: 50 },
    },
    // ── Bulgaria ─────────────────────────────────────────────────────────────
    SOF: {
        airport: { lat: 42.6967, lng:  23.4114 },
        city:    { lat: 42.6977, lng:  23.3219 },
        country: 'BG',
        publicTransport: { mode: 'Metro Line 1', costEur: 1, durationMins: 20 },
    },
    // ── Malta ────────────────────────────────────────────────────────────────
    MLA: {
        airport: { lat: 35.8575, lng:  14.4775 },
        city:    { lat: 35.8997, lng:  14.5148 },
        country: 'MT',
        publicTransport: { mode: 'Bus X4 / X1', costEur: 3, durationMins: 45 },
    },
    // ── Morocco ──────────────────────────────────────────────────────────────
    RAK: {
        airport: { lat: 31.6069, lng:  -8.0363 },
        city:    { lat: 31.6295, lng:  -7.9811 },
        country: 'MA',
        publicTransport: { mode: 'Bus L19', costEur: 2, durationMins: 35 },
    },
    // ── Denmark ──────────────────────────────────────────────────────────────
    CPH: {
        airport: { lat: 55.6181, lng:  12.6561 },
        city:    { lat: 55.6761, lng:  12.5683 },
        country: 'DK',
        publicTransport: { mode: 'Metro M2', costEur: 7, durationMins: 15 },
    },
    // ── Cyprus ───────────────────────────────────────────────────────────────
    PFO: {
        airport: { lat: 34.7180, lng:  32.4857 },
        city:    { lat: 34.7754, lng:  32.4225 },
        country: 'CY',
    },
};

// ─── Night hours: 22:00–06:00 ────────────────────────────────────────────────

const isNightArrival = (arrivalHour?: number): boolean =>
    typeof arrivalHour === 'number' && (arrivalHour >= 22 || arrivalHour < 6);

// ─── Main estimate function ───────────────────────────────────────────────────

/**
 * Estimate taxi cost from airport to city centre.
 *
 * @param airportCode IATA code (e.g. 'DUB', 'IBZ')
 * @param arrivalHour 0-23 local hour of arrival (used for night surcharge)
 * @returns TransferEstimate or null if the airport is unknown
 */
export const estimateAirportTransfer = (
    airportCode: string,
    arrivalHour?: number,
): TransferEstimate | null => {
    const data = AIRPORT_DATA[airportCode.toUpperCase()];
    if (!data) return null;

    const rate = TAXI_RATES[data.country];
    if (!rate) return null;

    const distanceKm = haversineKm(data.airport, data.city);
    // Road distance is typically 20–40% more than straight-line through the Haversine
    const roadDistanceKm = distanceKm * 1.3;

    const night = isNightArrival(arrivalHour);
    const multiplier = night ? rate.nightMultiplier : 1;
    const estimatedFare = Math.ceil((rate.flagFall + roadDistanceKm * rate.ratePerKm) * multiplier);

    return {
        distanceKm: Math.round(roadDistanceKm * 10) / 10,
        estimatedFare,
        currency: rate.currency,
        isNightRate: night,
        confidence: 'calculated',
        publicTransport: data.publicTransport,
    };
};

/**
 * Format the estimate as a human-readable label like "~€14" or "~€14 (night rate)".
 */
export const formatTransferLabel = (estimate: TransferEstimate): string => {
    const amount = `~€${estimate.estimatedFare}`;
    return estimate.isNightRate ? `${amount} (night rate)` : amount;
};

export const getAirportTransferContext = (airportCode: string): AirportTransferContext | null => {
    const data = AIRPORT_DATA[airportCode.toUpperCase()];
    if (!data) {
        return null;
    }

    return {
        airportCode: airportCode.toUpperCase(),
        airportCoordinates: {
            lat: data.airport.lat,
            lon: data.airport.lng,
        },
        cityCoordinates: {
            lat: data.city.lat,
            lon: data.city.lng,
        },
        country: data.country,
        publicTransport: data.publicTransport,
    };
};

/**
 * Utility: extract arrival hour from an ISO datetime string.
 */
export const getArrivalHour = (arrivalTime?: string): number | undefined => {
    if (!arrivalTime) return undefined;
    const d = new Date(arrivalTime);
    return Number.isNaN(d.getTime()) ? undefined : d.getHours();
};

