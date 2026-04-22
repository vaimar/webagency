const configuredApiBase = (process.env.REACT_APP_API_BASE ?? '').trim();

// Empty API_BASE means same-origin requests (uses CRA proxy in development).
export const API_BASE = configuredApiBase.replace(/\/$/, '');

const parseTimeoutMs = (value: string | undefined, fallback: number): number => {
    const parsed = Number.parseInt((value ?? '').trim(), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const REQUEST_TIMEOUT_MS = parseTimeoutMs(process.env.REACT_APP_REQUEST_TIMEOUT_MS, 5_000);
const AI_REQUEST_TIMEOUT_MS = parseTimeoutMs(process.env.REACT_APP_AI_REQUEST_TIMEOUT_MS, 45_000);

const buildApiUrl = (path: string, query?: Record<string, string>): string => {
    const endpoint = `${API_BASE}${path}`;
    if (!query) return endpoint;
    const params = new URLSearchParams(query);
    const queryString = params.toString();
    return queryString ? `${endpoint}?${queryString}` : endpoint;
};

// ─── Diagnostics ──────────────────────────────────────────────────────────────

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
            createDiagnostics(url, method, startedAt, { error: message }),
        );
    } finally {
        clearTimeout(timeoutId);
    }
};

const ensureOk = async (response: Response, diagnostics: ApiDiagnostics, fallbackMessage: string): Promise<void> => {
    if (response.ok) return;

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

// ─── Flights — FlightAvailable (canonical) + BackendFlight alias ──────────────

/**
 * Canonical flight shape from /api/flights (OpenAPI: FlightAvailable).
 * Legacy fields (flightNumber, airline, departureTime, arrivalTime, returnDate)
 * are kept for compatibility with mock data and older response formats.
 */
export interface FlightAvailable {
    id?: number;
    origin: string;
    destination: string;
    /** ISO date-time departure (canonical). */
    departureDate?: string;
    /** ISO date-time arrival (canonical). */
    arrivalDate?: string;
    price: number | string;
    currency?: string;
    fetchDate?: string;
    // Legacy / Ryanair live-flight fields — may be absent on cached flights
    flightNumber?: string;
    airline?: string;
    /** @deprecated Use departureDate */
    departureTime?: string;
    /** @deprecated Use arrivalDate */
    arrivalTime?: string;
    /** @deprecated Use arrivalDate */
    returnDate?: string;
}

/** @deprecated Use FlightAvailable */
export type BackendFlight = FlightAvailable;

export interface BackendFlightsResponse {
    flights?: FlightAvailable[];
    data?: FlightAvailable[];
    [key: string]: unknown;
}

// ─── AI ───────────────────────────────────────────────────────────────────────

export interface AiProvider {
    name: string;
    id?: string;
    /** Whether the provider key is configured on the backend (OpenAPI: AiProviderStatus.configured). */
    configured?: boolean;
    /** @deprecated Use configured */
    available?: boolean;
}

/** Full response envelope from POST /api/ai/messages (OpenAPI: AiMessageResponse). */
export interface AiMessageResponse {
    reply: string;
    /** Requested provider, or `default` when omitted. */
    provider?: string;
    /** Actual provider used (may differ when fallback triggered). */
    resolvedProvider?: string;
    success?: boolean;
    fallback?: boolean;
    cached?: boolean;
    timestamp?: string;
    durationMs?: number;
}

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    provider?: string;
    resolvedProvider?: string;
    fallback?: boolean;
    cached?: boolean;
    timestamp: string;
}

// ─── Trips — TripSuggestion ───────────────────────────────────────────────────

export interface TripSuggestion {
    origin: string;
    destination: string;
    cheapestFlight?: FlightAvailable;
    availableFlightDates?: string;
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
    // legacy fields kept for backward compat
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

// ─── Accounts ─────────────────────────────────────────────────────────────────

export interface Account {
    id?: number;
    username: string;
    email?: string;
}

export interface RegisterAccountRequest {
    username: string;
    password: string;
    email?: string;
}

export interface LoginRequest {
    username: string;
    password: string;
}

export interface LoginResponse {
    message?: string;
    authenticated?: boolean;
    username?: string;
}

export type TravelPace = 'relaxed' | 'balanced' | 'intense';
export type PreferredTransport = 'walking' | 'public_transport' | 'taxi' | 'rental_car';
export type AiProviderName = 'openai' | 'grok' | 'gemini';

export interface UserProfile {
    id?: number;
    dailyBudget?: number;
    pace?: TravelPace;
    preferredTransport?: PreferredTransport;
    foodPreferences?: string[];
    preferredAiProvider?: AiProviderName | null;
}

export interface UpdateUserProfileRequest {
    dailyBudget?: number;
    pace?: TravelPace;
    preferredTransport?: PreferredTransport;
    foodPreferences?: string[];
    preferredAiProvider?: AiProviderName | null;
}

// ─── Result wrappers ──────────────────────────────────────────────────────────

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
    resolvedProvider?: string;
    fallback?: boolean;
    cached?: boolean;
    diagnostics: ApiDiagnostics;
}

export interface FlightsResult {
    flights: FlightAvailable[];
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

// ─── AI providers  GET /api/ai/providers ─────────────────────────────────────

export const fetchAiProviders = async (): Promise<ProvidersResult> => {
    const url = buildApiUrl('/api/ai/providers');
    const { response, diagnostics } = await fetchWithDiagnostics(url, undefined, AI_REQUEST_TIMEOUT_MS);
    await ensureOk(response, diagnostics, 'Failed to fetch providers');
    const data = (await response.json()) as { providers?: AiProvider[] } | AiProvider[];

    return {
        providers: Array.isArray(data) ? data : (data.providers ?? []),
        diagnostics,
    };
};

// ─── AI chat  POST /api/ai/messages ──────────────────────────────────────────

export interface ChatParams {
    message: string;
    provider?: string;
}

export const sendChatMessage = async (params: ChatParams): Promise<ChatResult> => {
    const url = buildApiUrl('/api/ai/messages');

    const { response, diagnostics } = await fetchWithDiagnostics(
        url,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: params.message, provider: params.provider }),
        },
        AI_REQUEST_TIMEOUT_MS,
    );
    await ensureOk(response, diagnostics, 'Chat failed');

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
        const data = (await response.json()) as AiMessageResponse | { reply?: string; message?: string; response?: string } | string;

        if (typeof data === 'string') {
            return { reply: data, diagnostics };
        }

        const envelope = data as AiMessageResponse;
        return {
            reply: envelope.reply ?? (data as { reply?: string; message?: string; response?: string }).message ?? (data as { reply?: string; message?: string; response?: string }).response ?? JSON.stringify(data),
            resolvedProvider: envelope.resolvedProvider,
            fallback: envelope.fallback,
            cached: envelope.cached,
            diagnostics,
        };
    }

    return { reply: await response.text(), diagnostics };
};

// ─── Flights  GET /api/flights ────────────────────────────────────────────────

export interface FlightSearchParams {
    origin: string;
    destination: string;
}

export const searchFlights = async (params: FlightSearchParams): Promise<FlightsResult> => {
    const url = buildApiUrl('/api/flights', {
        origin: params.origin.toUpperCase(),
        destination: params.destination.toUpperCase(),
    });

    const { response, diagnostics } = await fetchWithDiagnostics(url);
    await ensureOk(response, diagnostics, 'Flights failed');

    const data = (await response.json()) as BackendFlightsResponse | FlightAvailable[];
    return {
        flights: Array.isArray(data) ? data : data.flights ?? (data.data as FlightAvailable[]) ?? [],
        diagnostics,
    };
};

// ─── Trip suggestion  GET /api/trips/suggestions ──────────────────────────────

export interface TripSuggestParams {
    origin: string;
    destination: string;
    provider?: string;
}

export const fetchTripSuggestion = async (params: TripSuggestParams): Promise<TripSuggestionResult> => {
    const query: Record<string, string> = {
        origin: params.origin.toUpperCase(),
        destination: params.destination.toUpperCase(),
    };
    if (params.provider) query.provider = params.provider;

    const url = buildApiUrl('/api/trips/suggestions', query);
    const { response, diagnostics } = await fetchWithDiagnostics(url, undefined, AI_REQUEST_TIMEOUT_MS);
    await ensureOk(response, diagnostics, 'Trip suggest failed');

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
        const data = (await response.json()) as TripSuggestion | string;
        if (typeof data === 'string') {
            return {
                suggestion: { origin: params.origin, destination: params.destination, suggestion: data, rawText: data },
                diagnostics,
            };
        }
        return {
            suggestion: { ...data, origin: params.origin, destination: params.destination },
            diagnostics,
        };
    }

    const text = await response.text();
    return {
        suggestion: { origin: params.origin, destination: params.destination, suggestion: text, rawText: text },
        diagnostics,
    };
};

// ─── Trip plan  POST /api/trips/plans ─────────────────────────────────────────

export interface TripPlanParams {
    destination: string;
    origin?: string;
    budget?: number;
    duration?: number;
    accommodation?: string;
    foodPreferences?: string[];
    restaurantTips?: string;
    activities?: string;
    favoriteActivities?: string;
    notes?: string;
    pace?: string;
    season?: string;
    preferredTransport?: string;
    provider?: string;
}

export const planTrip = async (params: TripPlanParams): Promise<TripSuggestionResult> => {
    const url = buildApiUrl('/api/trips/plans');

    const { response, diagnostics } = await fetchWithDiagnostics(
        url,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params),
        },
        AI_REQUEST_TIMEOUT_MS,
    );
    await ensureOk(response, diagnostics, 'Trip plan failed');

    const data = (await response.json()) as TripSuggestion;
    return {
        suggestion: { ...data, destination: params.destination },
        diagnostics,
    };
};

// ─── Itinerary  POST /api/trips/itineraries ───────────────────────────────────

export interface TripItineraryRequest {
    destination: string;
    days: number;
    origin?: string;
    /** Daily budget in euros. Falls back to the user's stored profile value if omitted. */
    budget?: number;
    pace?: TravelPace;
    preferredTransport?: PreferredTransport;
    foodPreferences?: string[];
    provider?: AiProviderName;
}

export const generateItinerary = async (params: TripItineraryRequest): Promise<TripSuggestionResult> => {
    const url = buildApiUrl('/api/trips/itineraries');

    const { response, diagnostics } = await fetchWithDiagnostics(
        url,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params),
        },
        AI_REQUEST_TIMEOUT_MS,
    );
    await ensureOk(response, diagnostics, 'Itinerary generation failed');

    const data = (await response.json()) as TripSuggestion;
    return {
        suggestion: { ...data, destination: params.destination },
        diagnostics,
    };
};

// ─── Accounts  /api/accounts/* ────────────────────────────────────────────────

export const registerAccount = async (request: RegisterAccountRequest): Promise<Account> => {
    const url = buildApiUrl('/api/accounts/register');
    const { response, diagnostics } = await fetchWithDiagnostics(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
    });
    await ensureOk(response, diagnostics, 'Registration failed');
    return (await response.json()) as Account;
};

export const loginAccount = async (request: LoginRequest): Promise<LoginResponse> => {
    const url = buildApiUrl('/api/accounts/login');
    const { response, diagnostics } = await fetchWithDiagnostics(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        credentials: 'include', // send/receive JSESSIONID cookie
    });
    await ensureOk(response, diagnostics, 'Login failed');
    return (await response.json()) as LoginResponse;
};

export const getProfile = async (): Promise<Account> => {
    const url = buildApiUrl('/api/accounts/profile');
    const { response, diagnostics } = await fetchWithDiagnostics(url, { credentials: 'include' });
    await ensureOk(response, diagnostics, 'Failed to load profile');
    return (await response.json()) as Account;
};

export const getPreferences = async (): Promise<UserProfile> => {
    const url = buildApiUrl('/api/accounts/preferences');
    const { response, diagnostics } = await fetchWithDiagnostics(url, { credentials: 'include' });
    await ensureOk(response, diagnostics, 'Failed to load preferences');
    return (await response.json()) as UserProfile;
};

export const updatePreferences = async (request: UpdateUserProfileRequest): Promise<UserProfile> => {
    const url = buildApiUrl('/api/accounts/preferences');
    const { response, diagnostics } = await fetchWithDiagnostics(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        credentials: 'include',
    });
    await ensureOk(response, diagnostics, 'Failed to update preferences');
    return (await response.json()) as UserProfile;
};

