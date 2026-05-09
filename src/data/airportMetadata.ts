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
    {
        code: 'MAN',
        city: 'Manchester',
        country: 'United Kingdom',
        flag: '🇬🇧',
        airportName: 'Manchester Airport',
        thumbnailUrl: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=1200&q=80',
        fareHighlight: 'Northern low-cost gateway',
        aliases: ['MANCHESTER'],
    },
    {
        code: 'EDI',
        city: 'Edinburgh',
        country: 'United Kingdom',
        flag: '🇬🇧',
        airportName: 'Edinburgh Airport',
        thumbnailUrl: 'https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?auto=format&fit=crop&w=1200&q=80',
        fareHighlight: 'Cold city break line',
        aliases: ['EDINBURGH'],
    },
    {
        code: 'CRL',
        city: 'Brussels Charleroi',
        country: 'Belgium',
        flag: '🇧🇪',
        airportName: 'Brussels South Charleroi Airport',
        thumbnailUrl: 'https://images.unsplash.com/photo-1491553895911-0055eca6402d?auto=format&fit=crop&w=1200&q=80',
        fareHighlight: 'Brussels with a transfer asterisk',
        aliases: ['BRU', 'BRUSSELS', 'CHARLEROI'],
    },
    {
        code: 'BER',
        city: 'Berlin',
        country: 'Germany',
        flag: '🇩🇪',
        airportName: 'Berlin Brandenburg Airport',
        thumbnailUrl: 'https://images.unsplash.com/photo-1560969184-10fe8719e047?auto=format&fit=crop&w=1200&q=80',
        fareHighlight: 'Sharp fare, clean rail link',
        aliases: ['BERLIN'],
    },
    {
        code: 'MAD',
        city: 'Madrid',
        country: 'Spain',
        flag: '🇪🇸',
        airportName: 'Adolfo Suárez Madrid–Barajas Airport',
        thumbnailUrl: 'https://images.unsplash.com/photo-1539037116277-4db20889f2d4?auto=format&fit=crop&w=1200&q=80',
        fareHighlight: 'Major city, stronger rail spine',
        aliases: ['MADRID'],
    },
    {
        code: 'AGP',
        city: 'Málaga',
        country: 'Spain',
        flag: '🇪🇸',
        airportName: 'Málaga Airport',
        thumbnailUrl: 'https://images.unsplash.com/photo-1558642084-fd07fae5282e?auto=format&fit=crop&w=1200&q=80',
        fareHighlight: 'Sun route with a cleaner last mile',
        aliases: ['MALAGA', 'MÁLAGA'],
    },
    {
        code: 'ALC',
        city: 'Alicante',
        country: 'Spain',
        flag: '🇪🇸',
        airportName: 'Alicante Airport',
        thumbnailUrl: 'https://images.unsplash.com/photo-1500375592092-40eb2168fd21?auto=format&fit=crop&w=1200&q=80',
        fareHighlight: 'Easy coast hop',
        aliases: ['ALICANTE'],
    },
    {
        code: 'PMI',
        city: 'Palma de Mallorca',
        country: 'Spain',
        flag: '🇪🇸',
        airportName: 'Palma de Mallorca Airport',
        thumbnailUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80',
        fareHighlight: 'Island fare, summer transfer pressure',
        aliases: ['PALMA', 'MALLORCA'],
    },
    {
        code: 'SVQ',
        city: 'Seville',
        country: 'Spain',
        flag: '🇪🇸',
        airportName: 'Seville Airport',
        thumbnailUrl: 'https://images.unsplash.com/photo-1515962179533-7b7e7b29c02f?auto=format&fit=crop&w=1200&q=80',
        fareHighlight: 'Heat with a fairly clean bus leg',
        aliases: ['SEVILLE', 'SEVILLA'],
    },
    {
        code: 'OPO',
        city: 'Porto',
        country: 'Portugal',
        flag: '🇵🇹',
        airportName: 'Porto Airport',
        thumbnailUrl: 'https://images.unsplash.com/photo-1555881400-74d7acaacd8b?auto=format&fit=crop&w=1200&q=80',
        fareHighlight: 'Metro-friendly Atlantic entry',
        aliases: ['PORTO'],
    },
    {
        code: 'FAO',
        city: 'Faro',
        country: 'Portugal',
        flag: '🇵🇹',
        airportName: 'Faro Airport',
        thumbnailUrl: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80',
        fareHighlight: 'Algarve on a cleaner bus leg',
        aliases: ['FARO'],
    },
    {
        code: 'VIE',
        city: 'Vienna',
        country: 'Austria',
        flag: '🇦🇹',
        airportName: 'Vienna Airport',
        thumbnailUrl: 'https://images.unsplash.com/photo-1516550893923-42d28e5677af?auto=format&fit=crop&w=1200&q=80',
        fareHighlight: 'Clean airport rail line',
        aliases: ['VIENNA'],
    },
    {
        code: 'PRG',
        city: 'Prague',
        country: 'Czech Republic',
        flag: '🇨🇿',
        airportName: 'Prague Airport',
        thumbnailUrl: 'https://images.unsplash.com/photo-1541849546-216549ae216d?auto=format&fit=crop&w=1200&q=80',
        fareHighlight: 'Old city, manageable transfer',
        aliases: ['PRAGUE'],
    },
    {
        code: 'BUD',
        city: 'Budapest',
        country: 'Hungary',
        flag: '🇭🇺',
        airportName: 'Budapest Airport',
        thumbnailUrl: 'https://images.unsplash.com/photo-1549877452-9c387954fbc2?auto=format&fit=crop&w=1200&q=80',
        fareHighlight: 'Thermal city with a bus reality check',
        aliases: ['BUDAPEST'],
    },
    {
        code: 'KRK',
        city: 'Kraków',
        country: 'Poland',
        flag: '🇵🇱',
        airportName: 'Kraków Airport',
        thumbnailUrl: 'https://images.unsplash.com/photo-1519197924294-4ba991a11128?auto=format&fit=crop&w=1200&q=80',
        fareHighlight: 'Old town with an honest train link',
        aliases: ['KRAKOW', 'KRAKÓW'],
    },
    {
        code: 'WRO',
        city: 'Wrocław',
        country: 'Poland',
        flag: '🇵🇱',
        airportName: 'Wrocław Airport',
        thumbnailUrl: 'https://images.unsplash.com/photo-1516483638261-f4dbaf036963?auto=format&fit=crop&w=1200&q=80',
        fareHighlight: 'Lower fare, lighter crowd pressure',
        aliases: ['WROCLAW', 'WROCŁAW'],
    },
    {
        code: 'GDN',
        city: 'Gdańsk',
        country: 'Poland',
        flag: '🇵🇱',
        airportName: 'Gdańsk Airport',
        thumbnailUrl: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80',
        fareHighlight: 'Baltic edge with a solid rail path',
        aliases: ['GDANSK', 'GDAŃSK'],
    },
    {
        code: 'OTP',
        city: 'Bucharest',
        country: 'Romania',
        flag: '🇷🇴',
        airportName: 'Henri Coandă Airport',
        thumbnailUrl: 'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=1200&q=80',
        fareHighlight: 'Low fare, longer city leg',
        aliases: ['BUCHAREST'],
    },
    {
        code: 'SOF',
        city: 'Sofia',
        country: 'Bulgaria',
        flag: '🇧🇬',
        airportName: 'Sofia Airport',
        thumbnailUrl: 'https://images.unsplash.com/photo-1526481280695-3c4691f8b58f?auto=format&fit=crop&w=1200&q=80',
        fareHighlight: 'Mountain-city value line',
        aliases: ['SOFIA'],
    },
    {
        code: 'MLA',
        city: 'Malta',
        country: 'Malta',
        flag: '🇲🇹',
        airportName: 'Malta International Airport',
        thumbnailUrl: 'https://images.unsplash.com/photo-1500375592092-40eb2168fd21?auto=format&fit=crop&w=1200&q=80',
        fareHighlight: 'Island route with a bus-first finish',
        aliases: ['MALTA'],
    },
    {
        code: 'MRS',
        city: 'Marseille',
        country: 'France',
        flag: '🇫🇷',
        airportName: 'Marseille Provence Airport',
        thumbnailUrl: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1200&q=80',
        fareHighlight: 'Cheap headline, harder airport leg',
        aliases: ['MARSEILLE'],
    },
    {
        code: 'TSF',
        city: 'Venice Treviso',
        country: 'Italy',
        flag: '🇮🇹',
        airportName: 'Treviso Airport',
        thumbnailUrl: 'https://images.unsplash.com/photo-1514890547357-a9ee288728e0?auto=format&fit=crop&w=1200&q=80',
        fareHighlight: 'Venice with an extra ground leg',
        aliases: ['VCE', 'VENICE', 'TREVISO'],
    },
    {
        code: 'PFO',
        city: 'Paphos',
        country: 'Cyprus',
        flag: '🇨🇾',
        airportName: 'Paphos Airport',
        thumbnailUrl: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80',
        fareHighlight: 'Sun route with taxi risk at night',
        aliases: ['PAPHOS'],
    },
];

const AIRPORTS_BY_CODE = new Map(AIRPORTS.map((airport) => [airport.code, airport]));
const AIRPORTS_BY_ALIAS = new Map(
    AIRPORTS.flatMap((airport) => (airport.aliases ?? []).map((alias) => [alias, airport.code] as const)),
);

export const ALL_AIRPORT_OPTIONS = AIRPORTS.map((airport) => airport.code);
export const ORIGIN_AIRPORT_OPTIONS = ALL_AIRPORT_OPTIONS;
export const DESTINATION_AIRPORT_OPTIONS = ALL_AIRPORT_OPTIONS;
export const LANDING_DISCOVERY_AIRPORT_OPTIONS = ['BVA', 'LIS', 'BCN', 'CIA', 'OPO', 'AGP', 'PRG', 'BUD'];

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

