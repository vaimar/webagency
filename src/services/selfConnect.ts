// Client for POST /api/trips/self-connect — DIY self-transfer routing (fly the
// local airport to a cheap hub, separate ticket onward). Loaded on demand
// because the backend fans out many flight searches.

export interface SelfConnectLeg {
    airline?: string | null;
    flightNumber?: string | null;
    departureAirport?: string | null;
    arrivalAirport?: string | null;
    scheduledDeparture?: string | null;
    scheduledArrival?: string | null;
    priceEur?: number | null;
    provider?: string | null;
}

export interface SelfConnectOption {
    hub?: string | null;
    hubName?: string | null;
    leg1?: SelfConnectLeg | null;
    leg2?: SelfConnectLeg | null;
    connectionType?: 'SAME_DAY' | 'OVERNIGHT' | string | null;
    layoverMinutes?: number | null;
    overnightHotelEur?: number | null;
    totalEur?: number | null;
    savingsVsDirectEur?: number | null;
}

export interface SelfConnectResult {
    origin?: string | null;
    destination?: string | null;
    travelDate?: string | null;
    directPriceEur?: number | null;
    searchedHubs?: string[] | null;
    options?: SelfConnectOption[] | null;
}

export const fetchSelfConnect = async (
    origin: string,
    destination: string,
    date?: string | null,
): Promise<SelfConnectResult> => {
    const response = await fetch('/api/trips/self-connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origin, destination, date: date ?? undefined }),
    });

    if (!response.ok) {
        throw new Error(`Self-connect request failed with status ${response.status}`);
    }

    return (await response.json()) as SelfConnectResult;
};
