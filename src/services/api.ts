export const API_BASE = 'http://localhost:9090';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BackendFlight {
    flightNumber?: string;
    origin: string;
    destination: string;
    departureTime?: string;
    arrivalTime?: string;
    departureDate?: string;
    returnDate?: string;
    price: number | string;
    currency?: string;
    airline?: string;
}

export interface BackendFlightsResponse {
    flights?: BackendFlight[];
    data?: BackendFlight[];
    [key: string]: unknown;
}

export interface TripSuggestion {
    origin: string;
    destination: string;
    suggestion: string;
    highlights?: string[];
    estimatedBudget?: string;
    bestTimeToVisit?: string;
    accommodation?: string;
    food?: string;
    rawText?: string;
}

export interface AiProvider {
    name: string;
    id?: string;
    available?: boolean;
}

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    provider?: string;
    timestamp: string;
}

// ─── Health ───────────────────────────────────────────────────────────────────

export const checkBackendHealth = async (): Promise<boolean> => {
    try {
        const response = await fetch(`${API_BASE}/actuator/health`, {
            signal: AbortSignal.timeout(3000),
        });
        if (!response.ok) return false;
        const data = (await response.json()) as { status?: string };
        return data.status === 'UP';
    } catch {
        return false;
    }
};

// ─── AI providers ─────────────────────────────────────────────────────────────

export const fetchAiProviders = async (): Promise<AiProvider[]> => {
    const response = await fetch(`${API_BASE}/ai/providers`);
    if (!response.ok) throw new Error(`Failed to fetch providers: ${response.status}`);
    const data = (await response.json()) as AiProvider[] | { providers?: AiProvider[] };
    return Array.isArray(data) ? data : (data.providers ?? []);
};

// ─── AI chat ──────────────────────────────────────────────────────────────────

export interface ChatParams {
    message: string;
    provider?: string;
}

export const sendChatMessage = async (params: ChatParams): Promise<string> => {
    const url = new URL(`${API_BASE}/ai/chat`);
    url.searchParams.set('message', params.message);
    if (params.provider) url.searchParams.set('provider', params.provider);

    const response = await fetch(url.toString());
    if (!response.ok) throw new Error(`Chat failed: ${response.status}`);

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
        const data = (await response.json()) as { reply?: string; message?: string; response?: string } | string;
        if (typeof data === 'string') return data;
        return data.reply ?? data.message ?? data.response ?? JSON.stringify(data);
    }
    return await response.text();
};

// ─── Flights ──────────────────────────────────────────────────────────────────

export interface FlightSearchParams {
    origin: string;
    destination: string;
}

export const searchFlights = async (params: FlightSearchParams): Promise<BackendFlight[]> => {
    const url = new URL(`${API_BASE}/flights`);
    url.searchParams.set('origin', params.origin.toUpperCase());
    url.searchParams.set('destination', params.destination.toUpperCase());

    const response = await fetch(url.toString());
    if (!response.ok) throw new Error(`Flights failed: ${response.status}`);

    const data = (await response.json()) as BackendFlightsResponse | BackendFlight[];
    if (Array.isArray(data)) return data;
    return data.flights ?? (data.data as BackendFlight[]) ?? [];
};

// ─── Trip suggestion ──────────────────────────────────────────────────────────

export interface TripSuggestParams {
    origin: string;
    destination: string;
}

export const fetchTripSuggestion = async (params: TripSuggestParams): Promise<TripSuggestion> => {
    const url = new URL(`${API_BASE}/trip/suggest`);
    url.searchParams.set('origin', params.origin.toUpperCase());
    url.searchParams.set('destination', params.destination.toUpperCase());

    const response = await fetch(url.toString());
    if (!response.ok) throw new Error(`Trip suggest failed: ${response.status}`);

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
        const data = (await response.json()) as TripSuggestion | string;
        if (typeof data === 'string') {
            return { origin: params.origin, destination: params.destination, suggestion: data, rawText: data };
        }
        return { origin: params.origin, destination: params.destination, ...data };
    }

    const text = await response.text();
    return { origin: params.origin, destination: params.destination, suggestion: text, rawText: text };
};

