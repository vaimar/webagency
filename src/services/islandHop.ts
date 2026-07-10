// Client for the island-hop tour planner (/api/trips/island-hop).

export interface IslandHopStopRequest {
    island: string;
    nights: number;
}

export interface TourTemplate {
    id: string;
    name: string;
    description: string;
    stops: IslandHopStopRequest[];
}

export interface StayOption {
    name?: string | null;
    area?: string | null;
    pricePerNight?: number | null;
    priceCurrency?: string | null;
    rating?: number | null;
    bookingLink?: string | null;
    provider?: string | null;
}

export interface TourStop {
    island: string;
    airport: string;
    nights: number;
    nightlyEstimateEur: number;
    stayEur: number;
    /** True when the stay total came from a live hotel rate, not the estimate. */
    stayPriceLive?: boolean | null;
    cityLatitude?: number | null;
    cityLongitude?: number | null;
    stays?: StayOption[] | null;
}

export interface TourFlight {
    from?: string | null;
    to?: string | null;
    airline?: string | null;
    scheduledDeparture?: string | null;
    scheduledArrival?: string | null;
    priceEur?: number | null;
    provider?: string | null;
}

export interface FerryLeg {
    fromIsland: string;
    toIsland: string;
    durationMinutes: number;
    priceEur: number;
}

export interface IslandHopResult {
    origin?: string | null;
    startDate?: string | null;
    stops?: TourStop[] | null;
    flyIn?: TourFlight | null;
    flyOut?: TourFlight | null;
    ferries?: FerryLeg[] | null;
    totalNights?: number | null;
    flightsEur?: number | null;
    ferriesEur?: number | null;
    staysEur?: number | null;
    totalEur?: number | null;
    currency?: string | null;
    warnings?: string[] | null;
}

/** Greek islands the catalog resolves — used for the "add island" picker. */
export const ISLAND_OPTIONS = ['Santorini', 'Paros', 'Naxos', 'Mykonos', 'Athens'] as const;

export const fetchIslandHopTemplates = async (): Promise<TourTemplate[]> => {
    const response = await fetch('/api/trips/island-hop/templates');
    if (!response.ok) {
        throw new Error(`Templates request failed with status ${response.status}`);
    }
    return (await response.json()) as TourTemplate[];
};

export const fetchIslandHop = async (
    origin: string,
    startDate: string,
    stops: IslandHopStopRequest[],
): Promise<IslandHopResult> => {
    const response = await fetch('/api/trips/island-hop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origin, startDate, stops }),
    });
    if (!response.ok) {
        throw new Error(`Island-hop request failed with status ${response.status}`);
    }
    return (await response.json()) as IslandHopResult;
};
