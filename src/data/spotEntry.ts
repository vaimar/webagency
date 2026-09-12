// Adding a spot, in one line.
//
// The catalogue's verification machinery is for facts nobody has checked.
// This is the other case: someone who has been to the place is telling us
// about it. That does not need a research sheet — it needs to take ten
// seconds and be impossible to get wrong.
//
//   Wake Paradise | Spay, France | cable | 36 | restaurant, shop, parking | Apr-Oct
//
// Anything after the name is optional. Leave a field empty and it stays
// unknown; nothing is invented to fill a gap.

import { ClimateBand, RideSpot, RideSurface, unverified, VenueFact } from './rideSpots';

export type Amenity =
    | 'restaurant' | 'bar' | 'shop' | 'rental' | 'school'
    | 'camping' | 'accommodation' | 'showers' | 'parking'
    | 'beginner-line' | 'kicker' | 'rails' | 'sauna';

export const KNOWN_AMENITIES: Amenity[] = [
    'restaurant', 'bar', 'shop', 'rental', 'school',
    'camping', 'accommodation', 'showers', 'parking',
    'beginner-line', 'kicker', 'rails', 'sauna',
];

export interface SpotEntry {
    name: string;
    locality?: string;
    country?: string;
    surface?: RideSurface;
    /** Per session, as the spot quotes it. */
    sessionEur?: number;
    sessionNote?: string;
    amenities: Amenity[];
    season?: { from: string; to: string } | 'year_round';
    videos: string[];
    note?: string;
    lat?: number;
    lon?: number;
}

const MONTHS: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

/** "Apr-Oct" or "April to October" or "year round". */
export const parseSeason = (raw: string): SpotEntry['season'] | undefined => {
    const text = raw.trim().toLowerCase();
    if (!text) return undefined;
    if (/year[\s-]?round|all year|toute l'année/.test(text)) return 'year_round';

    const months = text.match(/[a-zéû]{3,}/g) ?? [];
    const codes = months
        .map((m) => MONTHS[m.slice(0, 3)])
        .filter((c): c is string => Boolean(c));

    if (codes.length !== 2) return undefined;
    // First of the opening month to the end of the closing one.
    const endDay = ['04', '06', '09', '11'].includes(codes[1]) ? '30'
        : codes[1] === '02' ? '28' : '31';
    return { from: `${codes[0]}-01`, to: `${codes[1]}-${endDay}` };
};

const parseAmenities = (raw: string): Amenity[] => {
    const found: Amenity[] = [];
    for (const token of raw.split(/[,;/]/)) {
        const clean = token.trim().toLowerCase().replace(/\s+/g, '-');
        const match = KNOWN_AMENITIES.find((a) => a === clean || clean.includes(a));
        if (match && !found.includes(match)) {
            found.push(match);
        }
    }
    return found;
};

const parseSurface = (raw: string): RideSurface | undefined => {
    const text = raw.trim().toLowerCase();
    if (/cable|câble|teleski|téléski|winch/.test(text)) return 'cable';
    if (/boat|bateau/.test(text)) return 'boat';
    if (/sea|mer|ocean/.test(text)) return 'sea';
    return undefined;
};

/**
 * Parses one dictated line. Fields are positional and all optional after the
 * name:  name | place | surface | price | amenities | season | video url
 */
export const parseSpotLine = (line: string): SpotEntry | null => {
    const parts = line.split('|').map((p) => p.trim());
    const name = parts[0];
    if (!name) return null;

    const [, place = '', surface = '', price = '', amenities = '', season = '', video = ''] = parts;
    const [locality, country] = place.split(',').map((p) => p.trim());
    const priceMatch = price.match(/(\d+(?:[.,]\d+)?)/);

    return {
        name,
        locality: locality || undefined,
        country: country || undefined,
        surface: parseSurface(surface),
        sessionEur: priceMatch ? Number(priceMatch[1].replace(',', '.')) : undefined,
        sessionNote: price.trim() || undefined,
        amenities: parseAmenities(amenities),
        season: parseSeason(season),
        videos: video.trim() ? [video.trim()] : [],
    };
};

// ─────────────────────────────────────────────────────────────────────────────
// Becoming a catalogue row
// ─────────────────────────────────────────────────────────────────────────────

const reported = <T, >(value: T, on: string): VenueFact<T> => ({
    value,
    status: 'VERIFIED',
    sourceUrl: null,
    checkedOn: on,
    sourceKind: 'user_report',
    verifiedBy: 'human',
    note: 'Reported by someone who has been to the spot.',
});

export interface ToRideSpotOptions {
    arrivalAirport: string;
    reportedOn: string;
    climateBand?: ClimateBand;
    activity?: RideSpot['activity'];
}

/** Turns a dictated entry into a catalogue row, reported rather than researched. */
export const toRideSpot = (entry: SpotEntry, options: ToRideSpotOptions): RideSpot => ({
    label: entry.name,
    arrivalAirport: options.arrivalAirport,
    activity: options.activity ?? 'wakeboard',
    locality: [entry.locality, entry.country].filter(Boolean).join(', ') || undefined,

    surface: entry.surface
        ? reported(entry.surface, options.reportedOn)
        : unverified<RideSurface>('not stated'),
    openingSeason: entry.season
        ? reported(entry.season, options.reportedOn)
        : unverified('not stated'),
    // A school or a beginner line is what makes a spot beginner-friendly.
    beginnerFriendly: (entry.amenities.includes('school') || entry.amenities.includes('beginner-line'))
        ? reported(true, options.reportedOn)
        : unverified<boolean>('no school or beginner line mentioned'),
    climateBand: options.climateBand
        ? reported(options.climateBand, options.reportedOn)
        : unverified<ClimateBand>('not stated'),
    sessionPrice: typeof entry.sessionEur === 'number'
        ? reported({ hourlyEur: null, dayPassEur: entry.sessionEur }, options.reportedOn)
        : unverified('not stated'),

    cableCount: unverified<number>(),
    skillFloor: unverified(),
    operating: reported(true, options.reportedOn),
});

/** What a dictated line still leaves open — shown back so gaps are obvious. */
export const missingFrom = (entry: SpotEntry): string[] => {
    const gaps: string[] = [];
    if (!entry.surface) gaps.push('surface (cable / boat / sea)');
    if (typeof entry.sessionEur !== 'number') gaps.push('session price');
    if (!entry.season) gaps.push('season');
    if (entry.amenities.length === 0) gaps.push('what is on site');
    if (entry.lat === undefined || entry.lon === undefined) gaps.push('coordinates (for routing)');
    if (entry.videos.length === 0) gaps.push('a video');
    return gaps;
};
