export interface AirportMetadata {
    code: string;
    city: string;
    country: string;
    flag: string;
    airportName: string;
    thumbnailUrl: string;
    fareHighlight?: string;
    aliases?: string[];
}

export interface AirportGroup {
    country: string;
    flag: string;
    airports: AirportMetadata[];
}

export interface AirportDisplay extends AirportMetadata {
    searchCode: string;
}

const AIRPORTS: AirportMetadata[] = [
    {
        code: 'DUB',
        city: 'Dublin',
        country: 'Ireland',
        flag: '🇮🇪',
        airportName: 'Dublin Airport',
        thumbnailUrl: 'https://images.unsplash.com/photo-1516483638261-f4dbaf036963?auto=format&fit=crop&w=1200&q=80',
        fareHighlight: 'Smart weekend base',
        aliases: ['DUBLIN'],
    },
    {
        code: 'BVA',
        city: 'Paris Beauvais',
        country: 'France',
        flag: '🇫🇷',
        airportName: 'Paris Beauvais Airport',
        thumbnailUrl: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1200&q=80',
        fareHighlight: 'Paris on a harder truth',
        aliases: ['PAR', 'PARIS', 'BEAUVAIS'],
    },
    {
        code: 'BCN',
        city: 'Barcelona',
        country: 'Spain',
        flag: '🇪🇸',
        airportName: 'Barcelona El Prat Airport',
        thumbnailUrl: 'https://images.unsplash.com/photo-1583422409516-2895a77efded?auto=format&fit=crop&w=1200&q=80',
        fareHighlight: 'Sun with clean transfers',
        aliases: ['BARCELONA'],
    },
    {
        code: 'LIS',
        city: 'Lisbon',
        country: 'Portugal',
        flag: '🇵🇹',
        airportName: 'Lisbon Airport',
        thumbnailUrl: 'https://images.unsplash.com/photo-1513735492246-483525079686?auto=format&fit=crop&w=1200&q=80',
        fareHighlight: 'Low-friction Atlantic hop',
        aliases: ['LISBON'],
    },
    {
        code: 'CIA',
        city: 'Rome Ciampino',
        country: 'Italy',
        flag: '🇮🇹',
        airportName: 'Rome Ciampino Airport',
        thumbnailUrl: 'https://images.unsplash.com/photo-1529260830199-42c24126f198?auto=format&fit=crop&w=1200&q=80',
        fareHighlight: 'Rome with a real last mile',
        aliases: ['ROM', 'ROME', 'CIAMPINO'],
    },
    {
        code: 'ATH',
        city: 'Athens',
        country: 'Greece',
        flag: '🇬🇷',
        airportName: 'Athens International Airport',
        thumbnailUrl: 'https://images.unsplash.com/photo-1555993539-1732b0258235?auto=format&fit=crop&w=1200&q=80',
        fareHighlight: 'Clear sky, longer transfer',
        aliases: ['ATHENS'],
    },
    {
        code: 'CPH',
        city: 'Copenhagen',
        country: 'Denmark',
        flag: '🇩🇰',
        airportName: 'Copenhagen Airport',
        thumbnailUrl: 'https://images.unsplash.com/photo-1513622470522-26c3c8a854bc?auto=format&fit=crop&w=1200&q=80',
        fareHighlight: 'Nordic clean line',
        aliases: ['COPENHAGEN'],
    },
    {
        code: 'RAK',
        city: 'Marrakech',
        country: 'Morocco',
        flag: '🇲🇦',
        airportName: 'Marrakech Menara Airport',
        thumbnailUrl: 'https://images.unsplash.com/photo-1597212618440-806262de4f6b?auto=format&fit=crop&w=1200&q=80',
        fareHighlight: 'Night landing premium',
        aliases: ['MARRAKECH'],
    },
    {
        code: 'STN',
        city: 'London Stansted',
        country: 'United Kingdom',
        flag: '🇬🇧',
        airportName: 'London Stansted Airport',
        thumbnailUrl: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=1200&q=80',
        fareHighlight: 'Fast fare, longer surface leg',
        aliases: ['LON', 'LONDON', 'STANSTED'],
    },
];

const AIRPORTS_BY_CODE = new Map(AIRPORTS.map((airport) => [airport.code, airport]));
const AIRPORTS_BY_ALIAS = new Map(
    AIRPORTS.flatMap((airport) => (airport.aliases ?? []).map((alias) => [alias, airport.code] as const)),
);

export const ORIGIN_AIRPORT_OPTIONS = ['DUB', 'STN', 'BCN', 'BVA'];
export const DESTINATION_AIRPORT_OPTIONS = ['BVA', 'BCN', 'LIS', 'CIA', 'ATH', 'CPH', 'RAK', 'STN'];

const normalizeFreeText = (value: string): string => value.trim().toUpperCase().replace(/[^A-Z]/g, '');

export const normalizeAirportCode = (value: string): string => {
    const trimmed = value.trim().toUpperCase();
    const bracketMatch = trimmed.match(/\(([A-Z]{3})\)$/);
    if (bracketMatch) {
        return normalizeAirportCode(bracketMatch[1]);
    }

    const token = normalizeFreeText(value);
    if (AIRPORTS_BY_CODE.has(token)) {
        return token;
    }

    const aliasTarget = AIRPORTS_BY_ALIAS.get(token);
    if (aliasTarget) {
        return aliasTarget;
    }

    return token.slice(0, 4);
};

export const getAirportMetadata = (value: string): AirportMetadata | null => {
    const code = normalizeAirportCode(value);
    return AIRPORTS_BY_CODE.get(code) ?? null;
};

export const getAirportDisplay = (value: string): AirportDisplay => {
    const metadata = getAirportMetadata(value);
    const searchCode = normalizeAirportCode(value);

    if (metadata) {
        return { ...metadata, searchCode };
    }

    return {
        code: searchCode || value.trim().toUpperCase(),
        city: searchCode || value.trim().toUpperCase(),
        country: 'Unknown destination',
        flag: '🏳️',
        airportName: `${searchCode || value.trim().toUpperCase()} airport`,
        thumbnailUrl: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=1200&q=80',
        searchCode,
    };
};

export const buildAirportSearchText = (airport: Pick<AirportMetadata, 'code' | 'city' | 'country' | 'airportName' | 'aliases'>): string => (
    [airport.code, airport.city, airport.country, airport.airportName, ...(airport.aliases ?? [])]
        .join(' ')
        .toLowerCase()
);

export const formatAirportOptionLabel = (code: string): string => {
    const metadata = getAirportDisplay(code);
    return `${metadata.flag} ${metadata.city}, ${metadata.country} (${metadata.code})`;
};

export const groupAirportsByCountry = (codes: string[]): AirportGroup[] => {
    const groups = new Map<string, AirportMetadata[]>();

    codes.forEach((code) => {
        const metadata = getAirportMetadata(code);
        if (!metadata) {
            return;
        }

        const current = groups.get(metadata.country) ?? [];
        current.push(metadata);
        groups.set(metadata.country, current);
    });

    return Array.from(groups.entries())
        .map(([country, airports]) => ({
            country,
            flag: airports[0]?.flag ?? '🏳️',
            airports: airports.sort((left, right) => left.city.localeCompare(right.city)),
        }))
        .sort((left, right) => left.country.localeCompare(right.country));
};

