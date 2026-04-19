const configuredApiBase = (process.env.REACT_APP_API_BASE ?? '').trim();

// Empty API_BASE means same-origin requests (uses CRA proxy in development).
export const API_BASE = configuredApiBase.replace(/\/$/, '');

const parseTimeoutMs = (value: string | undefined, fallback: number): number => {
    const parsed = Number.parseInt((value ?? '').trim(), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const REQUEST_TIMEOUT_MS = parseTimeoutMs(process.env.REACT_APP_REQUEST_TIMEOUT_MS, 5_000);
const AI_REQUEST_TIMEOUT_MS = parseTimeoutMs(process.env.REACT_APP_AI_REQUEST_TIMEOUT_MS, 30_000);

const buildApiUrl = (path: string, query?: Record<string, string>): string => {
    const endpoint = `${API_BASE}${path}`;

    if (!query) {
        return endpoint;
    }

    const params = new URLSearchParams(query);
    const queryString = params.toString();
    return queryString ? `${endpoint}?${queryString}` : endpoint;
};

export interface ApiDiagnostics {
    url: string;
    method: string;
    ok: boolean;
    status: number | null;
    statusText: string;
    durationMs: number;
    timestamp: string;
    error?: string;
}

export class ApiRequestError extends Error {
    diagnostics: ApiDiagnostics;

    constructor(message: string, diagnostics: ApiDiagnostics) {
        super(message);
        this.name = 'ApiRequestError';
        this.diagnostics = diagnostics;
    }
}

const createDiagnostics = (
    url: string,
    method: string,
    startedAt: number,
    overrides: Partial<ApiDiagnostics>,
): ApiDiagnostics => ({
    url,
    method,
    ok: false,
    status: null,
    statusText: '',
    durationMs: Date.now() - startedAt,
    timestamp: new Date().toISOString(),
    ...overrides,
});

const fetchWithDiagnostics = async (
    url: string,
    init?: RequestInit,
    timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<{ response: Response; diagnostics: ApiDiagnostics }> => {
    const method = init?.method ?? 'GET';
    const startedAt = Date.now();
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            ...init,
            signal: init?.signal ?? timeoutController.signal,
        });

        const diagnostics = createDiagnostics(url, method, startedAt, {
            ok: response.ok,
            status: response.status,
            statusText: response.statusText,
        });

        return { response, diagnostics };
    } catch (error) {
        const message = !init?.signal && timeoutController.signal.aborted
            ? `Request timed out after ${timeoutMs} ms`
            : error instanceof Error
                ? error.message
                : 'Unknown network error';

        throw new ApiRequestError(
            message,
            createDiagnostics(url, method, startedAt, {
                error: message,
            }),
        );
    } finally {
        clearTimeout(timeoutId);
    }
};

const ensureOk = async (response: Response, diagnostics: ApiDiagnostics, fallbackMessage: string): Promise<void> => {
    if (response.ok) {
        return;
    }

    let details = '';
    try {
        details = await response.text();
    } catch {
        details = '';
    }

    throw new ApiRequestError(
        `${fallbackMessage}: ${response.status}${details ? ` — ${details}` : ''}`,
        { ...diagnostics, error: details || response.statusText || fallbackMessage },
    );
};

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
    summary?: string;
    bestTimeToVisit?: string;
    estimatedBudget?: string;
    weather?: string;
    language?: string;
    currency?: string;
    neighborhoods?: Neighborhood[];
    restaurants?: Restaurant[];
    activities?: Activity[];
    accommodation?: AccommodationOption[];
    packingTips?: string[];
    localTips?: string[];
    dayItinerary?: DayPlan[];
    // legacy fields
    suggestion?: string;
    highlights?: string[];
    food?: string;
    rawText?: string;
}

export interface Neighborhood {
    name: string;
    vibe: string;
    bestFor: string;
}

export interface Restaurant {
    name: string;
    cuisine: string;
    priceRange: string;
    mustTry: string;
    tip: string;
}

export interface Activity {
    name: string;
    category: string;
    duration: string;
    cost: string;
    description: string;
}

export interface AccommodationOption {
    type: string;
    area: string;
    pricePerNight: string;
    tip: string;
}

export interface DayPlan {
    day: number;
    title: string;
    morning: string;
    afternoon: string;
    evening: string;
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

export interface HealthCheckResult {
    ok: boolean;
    status: string;
    diagnostics: ApiDiagnostics;
}

export interface ProvidersResult {
    providers: AiProvider[];
    diagnostics: ApiDiagnostics;
}

export interface ChatResult {
    reply: string;
    diagnostics: ApiDiagnostics;
}

export interface FlightsResult {
    flights: BackendFlight[];
    diagnostics: ApiDiagnostics;
}

export interface TripSuggestionResult {
    suggestion: TripSuggestion;
    diagnostics: ApiDiagnostics;
}

// ─── Health ───────────────────────────────────────────────────────────────────

export const checkBackendHealth = async (): Promise<HealthCheckResult> => {
    const url = buildApiUrl('/actuator/health');
    const { response, diagnostics } = await fetchWithDiagnostics(url);
    await ensureOk(response, diagnostics, 'Health check failed');
    const data = (await response.json()) as { status?: string };

    return {
        ok: data.status === 'UP',
        status: data.status ?? 'UNKNOWN',
        diagnostics,
    };
};

// ─── AI providers ─────────────────────────────────────────────────────────────

export const fetchAiProviders = async (): Promise<ProvidersResult> => {
    const url = buildApiUrl('/ai/providers');
    const { response, diagnostics } = await fetchWithDiagnostics(url, undefined, AI_REQUEST_TIMEOUT_MS);
    await ensureOk(response, diagnostics, 'Failed to fetch providers');
    const data = (await response.json()) as AiProvider[] | { providers?: AiProvider[] };

    return {
        providers: Array.isArray(data) ? data : (data.providers ?? []),
        diagnostics,
    };
};

// ─── AI chat ──────────────────────────────────────────────────────────────────

export interface ChatParams {
    message: string;
    provider?: string;
}

export const sendChatMessage = async (params: ChatParams): Promise<ChatResult> => {
    const url = buildApiUrl('/ai/chat', {
        message: params.message,
        ...(params.provider ? { provider: params.provider } : {}),
    });

    const { response, diagnostics } = await fetchWithDiagnostics(url, undefined, AI_REQUEST_TIMEOUT_MS);
    await ensureOk(response, diagnostics, 'Chat failed');

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
        const data = (await response.json()) as { reply?: string; message?: string; response?: string } | string;
        return {
            reply: typeof data === 'string' ? data : data.reply ?? data.message ?? data.response ?? JSON.stringify(data),
            diagnostics,
        };
    }

    return {
        reply: await response.text(),
        diagnostics,
    };
};

// ─── Flights ──────────────────────────────────────────────────────────────────

export interface FlightSearchParams {
    origin: string;
    destination: string;
}

export const searchFlights = async (params: FlightSearchParams): Promise<FlightsResult> => {
    const url = buildApiUrl('/flights', {
        origin: params.origin.toUpperCase(),
        destination: params.destination.toUpperCase(),
    });

    const { response, diagnostics } = await fetchWithDiagnostics(url);
    await ensureOk(response, diagnostics, 'Flights failed');

    const data = (await response.json()) as BackendFlightsResponse | BackendFlight[];
    return {
        flights: Array.isArray(data) ? data : data.flights ?? (data.data as BackendFlight[]) ?? [],
        diagnostics,
    };
};

// ─── Trip suggestion ──────────────────────────────────────────────────────────

export interface TripSuggestParams {
    origin: string;
    destination: string;
}

export const fetchTripSuggestion = async (params: TripSuggestParams): Promise<TripSuggestionResult> => {
    const url = buildApiUrl('/trip/suggest', {
        origin: params.origin.toUpperCase(),
        destination: params.destination.toUpperCase(),
    });

    const { response, diagnostics } = await fetchWithDiagnostics(url, undefined, AI_REQUEST_TIMEOUT_MS);
    await ensureOk(response, diagnostics, 'Trip suggest failed');

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
        const data = (await response.json()) as TripSuggestion | string;
        if (typeof data === 'string') {
            return {
                suggestion: {
                    origin: params.origin,
                    destination: params.destination,
                    suggestion: data,
                    rawText: data,
                },
                diagnostics,
            };
        }

        return {
            suggestion: {
                ...data,
                origin: params.origin,
                destination: params.destination,
            },
            diagnostics,
        };
    }

    const text = await response.text();
    return {
        suggestion: {
            origin: params.origin,
            destination: params.destination,
            suggestion: text,
            rawText: text,
        },
        diagnostics,
    };
};

