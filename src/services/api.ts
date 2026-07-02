const DEFAULT_PRODUCTION_API_BASE = 'https://slumber-production.up.railway.app';
const LOCAL_DEV_API_BASE = 'http://localhost:9090';
const rawApiBase = (process.env.REACT_APP_API_BASE ?? '').trim();
const isLocalBrowserHost = typeof window !== 'undefined'
    && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
const useLocalDevProxy = process.env.NODE_ENV !== 'production'
    && (!rawApiBase || /^https?:\/\/localhost:9090\/?$/i.test(rawApiBase));
const resolvedApiBase = rawApiBase || (isLocalBrowserHost ? LOCAL_DEV_API_BASE : DEFAULT_PRODUCTION_API_BASE);

export const API_BASE = useLocalDevProxy
    ? ''
    : resolvedApiBase.replace(/\/$/, '');

const DEV_AUTH_DEBUG = process.env.NODE_ENV !== 'production';
const AUTH_DEBUG_PATHS = new Set(['/api/accounts/login', '/api/accounts/profile']);
const AUTH_FAILURE_STATUSES = new Set([401, 403]);

export interface AuthFailureEvent {
    status: number;
    url: string;
    message: string;
}

let authFailureHandler: ((event: AuthFailureEvent) => void) | null = null;

export const setAuthFailureHandler = (handler: ((event: AuthFailureEvent) => void) | null): void => {
    authFailureHandler = handler;
};

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

const shouldDebugAuth = (url: string): boolean => {
    try {
        const { pathname } = new URL(url);
        return AUTH_DEBUG_PATHS.has(pathname);
    } catch {
        return false;
    }
};

const debugAuthRequest = (url: string, init?: RequestInit): void => {
    if (!DEV_AUTH_DEBUG || !shouldDebugAuth(url)) return;

    console.debug('[auth-debug] request', {
        requestUrl: url,
        credentials: init?.credentials ?? 'same-origin',
    });
};

const debugAuthResponse = (url: string, responseOrStatus: Response | number): void => {
    if (!DEV_AUTH_DEBUG || !shouldDebugAuth(url)) return;

    console.debug('[auth-debug] response', {
        requestUrl: url,
        credentials: 'include',
        status: typeof responseOrStatus === 'number' ? responseOrStatus : responseOrStatus.status,
    });
};

interface FetchWithDiagnosticsOptions {
    timeoutMs?: number;
    requiresAuth?: boolean;
}

const fetchWithDiagnostics = async (
    url: string,
    init?: RequestInit,
    options?: FetchWithDiagnosticsOptions,
): Promise<{ response: Response; diagnostics: ApiDiagnostics }> => {
    const method = init?.method ?? 'GET';
    const startedAt = Date.now();
    const timeoutMs = options?.timeoutMs ?? REQUEST_TIMEOUT_MS;
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);

    try {
        debugAuthRequest(url, init);

        const response = await fetch(url, {
            ...init,
            signal: init?.signal ?? timeoutController.signal,
        });

        debugAuthResponse(url, response);

        if (options?.requiresAuth && AUTH_FAILURE_STATUSES.has(response.status) && authFailureHandler) {
            authFailureHandler({
                status: response.status,
                url,
                message: response.status === 403 ? 'Session expired, please sign in again.' : 'Authentication required. Please sign in again.',
            });
        }

        const diagnostics = createDiagnostics(url, method, startedAt, {
            ok: response.ok,
            status: response.status,
            statusText: response.statusText,
        });

        return { response, diagnostics };
    } catch (error) {
        debugAuthResponse(url, 0);
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

export type DataConfidence = 'live' | 'mixed' | 'estimated';
export type CostLineStatus = 'EXACT' | 'ESTIMATED' | 'MANUAL_CHECK_REQUIRED' | 'OVERRIDDEN_BY_LOCAL_ACCESS_KNOWLEDGE';
export type FirstMileStatus = 'USER_PROVIDED' | 'ESTIMATED' | 'UNAVAILABLE';
export type FirstMileMode = 'walking' | 'public_transport' | 'taxi' | 'rental_car' | 'other';

/**
 * OpenAPI: CostLine — one line item in the price transparency stack.
 */
export interface CostLine {
    /** Known amount in EUR. Null when status is MANUAL_CHECK_REQUIRED. */
    amount?: number | null;
    currency?: string;
    status?: CostLineStatus;
    note?: string;
}

/**
 * OpenAPI: PriceBreakdown — frontend-ready price transparency stack.
 */
export interface PriceBreakdown {
    baseFare?: CostLine;
    shuttleFee?: CostLine;
    baggageEstimate?: CostLine;
    lateArrivalMarkup?: CostLine;
    /** Optional first-mile access line item (home → departure airport). Present only when firstMileAccess is supplied. */
    firstMileLine?: CostLine;
    renderMode?: string;
}

/**
 * OpenAPI: FirstMileAccess — home → departure-airport first-mile access.
 * Additive context that extends the Anti-Nightmare analysis to full door-to-trip pricing.
 */
export interface FirstMileAccess {
    /** Cost in EUR to reach the departure airport from the user's home. Null when only travel time is known. */
    amount?: number | null;
    durationMinutes?: number;
    mode?: FirstMileMode;
    currency?: string;
    status?: FirstMileStatus;
    source?: string;
    note?: string;
}

/**
 * OpenAPI: AntiCauchemarAnalysis
 * Travel-friction analysis combining real cost and logistics context.
 */
export interface AntiCauchemarAnalysis {
    ticketPrice?: number;
    airportShuttleEstimate?: number;
    cabinBagEstimate?: number;
    realCost?: number;
    realWorldEntryPrice?: number;
    flightDurationMinutes?: number;
    transferToCenterMinutes?: number;
    totalTravelTimeMinutes?: number;
    currency?: string;
    logisticVerdict?: string;
    dataConfidence?: DataConfidence;
    // ── Travel Auditor fields ──────────────────────────────────────────────
    hiddenCostPenalty?: number;
    timePenaltyMinutes?: number;
    /** realCost + hiddenCostPenalty + lateArrivalMarkup: the true transparent out-of-pocket cost. */
    auditedTotalCost?: number;
    /** 'The Catch' — non-null when the flight has significant hidden costs or logistic risks. */
    theCatch?: string;
    priceBreakdown?: PriceBreakdown;
    manualCheckRequired?: boolean;
    manualCheckReasons?: string[];
    localAccessKnowledgeOverrideApplied?: boolean;
    localAccessKnowledgeNote?: string;
    // ── First-mile / Door-to-trip pricing ─────────────────────────────────
    firstMileAccess?: FirstMileAccess;
    /** auditedTotalCost + firstMileAccess.amount. Null when firstMileAccess is not supplied. */
    doorToTripPrice?: number | null;
}

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
    antiCauchemar?: AntiCauchemarAnalysis;
    /**
     * Honest Price = price + mandatory shuttle + average cabin-bag fee.
     * Sorted ascending on /api/flights responses. Never persisted.
     */
    realWorldEntryPrice?: number;
    /** "Current" when data is fresh (< 12 h), "Estimated (Cached)" when stale. */
    priceLabel?: string;
    /** Non-null only when priceLabel is "Estimated (Cached)". */
    priceDisclaimer?: string;
    /**
     * Richer home-to-trip price when firstMileAccess was supplied.
     * Never redefines realWorldEntryPrice — parallel field.
     */
    doorToTripPrice?: number | null;
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

interface FlightPriceEnvelope {
    total?: number | string;
    currency?: string;
}

interface RawFlightAvailable extends Omit<FlightAvailable, 'price' | 'currency'> {
    price?: number | string | FlightPriceEnvelope;
    currency?: string;
}

export interface BackendFlightsResponse {
    flights?: FlightAvailable[];
    data?: FlightAvailable[];
    [key: string]: unknown;
}

const normalizeFlight = (flight: RawFlightAvailable): FlightAvailable => {
    const priceValue = flight.price;
    const price = typeof priceValue === 'object' && priceValue !== null
        ? priceValue.total ?? 0
        : priceValue ?? 0;
    const nestedCurrency = typeof priceValue === 'object' && priceValue !== null
        ? priceValue.currency
        : undefined;

    return {
        ...flight,
        price,
        currency: flight.currency ?? nestedCurrency,
    };
};

const extractFlights = (data: BackendFlightsResponse | RawFlightAvailable[]): FlightAvailable[] => {
    const rawFlights = Array.isArray(data) ? data : data.flights ?? (data.data as RawFlightAvailable[]) ?? [];
    return rawFlights.map(normalizeFlight);
};

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
    antiCauchemar?: AntiCauchemarAnalysis;
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

type GenericRecord = Record<string, unknown>;

interface RawTripSuggestion extends Omit<Partial<TripSuggestion>, 'restaurants' | 'accommodation'> {
    restaurants?: unknown;
    restaurantRecommendations?: unknown;
    recommendedRestaurants?: unknown;
    foodSpots?: unknown;
    accommodation?: unknown;
    hotels?: unknown;
    hotelRecommendations?: unknown;
    stays?: unknown;
    stayOptions?: unknown;
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
    name?: string;
    area: string;
    pricePerNight: string;
    tip: string;
    officialWebsiteUrl?: string;
}

const asHttpUrl = (value: unknown): string | undefined => {
    const url = asString(value);
    if (!url) return undefined;

    try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : undefined;
    } catch {
        return undefined;
    }
};

const asRecord = (value: unknown): GenericRecord | null => (
    typeof value === 'object' && value !== null ? value as GenericRecord : null
);

const asString = (value: unknown): string => {
    if (typeof value === 'string') {
        return value.trim();
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value);
    }

    return '';
};

const asNumber = (value: unknown): number | null => {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }

    if (typeof value === 'string') {
        const normalized = value.replace(/[^\d.,-]/g, '').replace(',', '.');
        const parsed = Number.parseFloat(normalized);
        return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
};

const asStringArray = (value: unknown): string[] => (
    Array.isArray(value)
        ? value.map((item) => asString(item)).filter(Boolean)
        : []
);

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const normalizeHotelResult = (value: unknown): HotelResult | null => {
    const record = asRecord(value);
    if (!record) {
        return null;
    }

    const point = asRecord(record.point);
    const xid = asString(record.xid ?? record.id ?? record.placeId);
    const name = asString(record.name ?? record.title ?? record.hotelName ?? record.propertyName);
    const latitude = asNumber(record.latitude ?? record.lat ?? point?.lat ?? point?.latitude);
    const longitude = asNumber(record.longitude ?? record.lon ?? record.lng ?? point?.lon ?? point?.lng ?? point?.longitude);

    if (!name && !xid) {
        return null;
    }

    return {
        xid: xid || undefined,
        name: name || undefined,
        latitude: latitude ?? undefined,
        longitude: longitude ?? undefined,
        kinds: asString(record.kinds ?? record.kind) || undefined,
        provider: asString(record.provider ?? record.source) || undefined,
        rating: asNumber(record.rating ?? record.stars ?? record.reviewScore),
        reviewsCount: asNumber(record.reviewsCount ?? record.reviewCount ?? record.totalReviews),
        pricePerNight: asNumber(record.pricePerNight ?? record.nightlyRate ?? record.price),
        priceCurrency: asString(record.priceCurrency ?? record.currency) || undefined,
        bookingLink: asHttpUrl(record.bookingLink ?? record.bookingUrl ?? record.booking_url ?? record.url),
        thumbnailUrl: asHttpUrl(record.thumbnailUrl ?? record.imageUrl ?? record.image ?? record.thumbnail),
        reviewSummary: asString(record.reviewSummary ?? record.summary) || undefined,
    };
};

const normalizeHotelResults = (value: unknown): HotelResult[] => {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map(normalizeHotelResult)
        .filter((hotel): hotel is HotelResult => Boolean(hotel));
};

const dedupeBy = <T,>(items: T[], getKey: (item: T) => string): T[] => {
    const seen = new Set<string>();

    return items.filter((item) => {
        const key = getKey(item).trim().toLowerCase();
        if (!key || seen.has(key)) {
            return false;
        }

        seen.add(key);
        return true;
    });
};

const normalizeRestaurant = (value: unknown): Restaurant | null => {
    if (typeof value === 'string') {
        const name = value.trim();
        return name ? { name, cuisine: 'Recommended', priceRange: 'Varies', mustTry: 'Ask the locals for the signature dish.', tip: '' } : null;
    }

    const record = asRecord(value);
    if (!record) {
        return null;
    }

    const name = asString(record.name ?? record.title ?? record.restaurantName ?? record.place);
    if (!name) {
        return null;
    }

    return {
        name,
        cuisine: asString(record.cuisine ?? record.category ?? record.style ?? record.type) || 'Recommended',
        priceRange: asString(record.priceRange ?? record.price ?? record.priceLevel ?? record.price_level ?? record.budget) || 'Varies',
        mustTry: asString(record.mustTry ?? record.signatureDish ?? record.highlight ?? record.recommendation) || 'House specialty',
        tip: asString(record.tip ?? record.note ?? record.reason ?? record.whyGo),
    };
};

const normalizeAccommodation = (value: unknown): AccommodationOption | null => {
    if (typeof value === 'string') {
        const area = value.trim();
        return area ? { type: 'Stay', name: area, area, pricePerNight: 'Varies', tip: '' } : null;
    }

    const record = asRecord(value);
    if (!record) {
        return null;
    }

    const name = asString(record.name ?? record.hotelName ?? record.title ?? record.propertyName);
    const area = asString(record.area ?? record.neighborhood ?? record.district ?? record.location ?? name);
    if (!area) {
        return null;
    }

    return {
        type: asString(record.type ?? record.category ?? record.accommodationType ?? record.kind) || 'Stay',
        name: name || undefined,
        area,
        pricePerNight: asString(record.pricePerNight ?? record.price ?? record.nightlyRate ?? record.priceRange ?? record.budget) || 'Varies',
        tip: asString(record.tip ?? record.note ?? record.reason ?? record.whyStay),
        officialWebsiteUrl: asHttpUrl(record.officialWebsiteUrl ?? record.officialUrl ?? record.websiteUrl ?? record.website),
    };
};

const normalizeTripSuggestion = (value: RawTripSuggestion, fallback: { origin: string; destination: string }): TripSuggestion => {
    const restaurants = dedupeBy(
        [value.restaurants, value.restaurantRecommendations, value.recommendedRestaurants, value.foodSpots]
            .flatMap((items) => asArray(items))
            .map(normalizeRestaurant)
            .filter((item): item is Restaurant => Boolean(item)),
        (item) => item.name,
    );

    const accommodation = dedupeBy(
        [value.accommodation, value.hotels, value.hotelRecommendations, value.stays, value.stayOptions]
            .flatMap((items) => asArray(items))
            .map(normalizeAccommodation)
            .filter((item): item is AccommodationOption => Boolean(item)),
        (item) => `${item.type}:${item.area}`,
    );

    return {
        ...value,
        origin: asString(value.origin) || fallback.origin,
        destination: asString(value.destination) || fallback.destination,
        restaurants,
        accommodation,
        packingTips: asStringArray(value.packingTips),
        localTips: asStringArray(value.localTips),
        highlights: asStringArray(value.highlights),
    };
};

export interface DayPlan {
    day: number;
    title: string;
    morning: string;
    afternoon: string;
    evening: string;
}

export interface FlightSearchResult {
    flightNumber?: string;
    airline?: string;
    departureAirport?: string;
    arrivalAirport?: string;
    scheduledDeparture?: string;
    scheduledArrival?: string;
    flightStatus?: string;
    estimatedTicketPrice?: number;
    antiCauchemar?: AntiCauchemarAnalysis;
}

export interface HotelResult {
    xid?: string;
    name?: string;
    latitude?: number;
    longitude?: number;
    kinds?: string;
    provider?: string;
    // SerpApi enrichment fields (additive — present when enrichment is enabled)
    rating?: number | null;
    reviewsCount?: number | null;
    pricePerNight?: number | null;
    priceCurrency?: string;
    bookingLink?: string;
    thumbnailUrl?: string;
    reviewSummary?: string;
}

export interface ReviewSnippet {
    title?: string;
    text?: string;
    rating?: number;
    date?: string;
}

export interface ReviewCategoryRating {
    category?: string;
    rating?: number;
}

export interface ReviewBreakdown {
    source?: string;
    averageRating?: number | null;
    totalReviews?: number | null;
    summary?: string;
    snippets?: ReviewSnippet[];
    positiveMentions?: string[];
    criticalMentions?: string[];
    categoryRatings?: ReviewCategoryRating[];
}

/** OpenAPI: HotelEnrichmentResponse — SerpApi-backed enrichment for a single OpenTripMap place. */
export interface HotelEnrichmentResponse {
    xid?: string;
    name?: string;
    provider?: string;
    matched?: boolean;
    matchStrategy?: string;
    matchedPropertyName?: string;
    propertyToken?: string;
    rating?: number | null;
    reviewsCount?: number | null;
    reviewSummary?: string;
    reviewHighlights?: string[];
    reviewBreakdown?: ReviewBreakdown;
    pricePerNight?: number | null;
    priceCurrency?: string;
    bookingLink?: string;
    thumbnailUrl?: string;
    amenities?: string[];
    nearbyPlaces?: string[];
}

export type GenericJsonObject = Record<string, unknown>;

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
    const { response, diagnostics } = await fetchWithDiagnostics(url, undefined, { timeoutMs: AI_REQUEST_TIMEOUT_MS });
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
        { timeoutMs: AI_REQUEST_TIMEOUT_MS },
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
    date?: string;
}

/** Optional first-mile access query params for flight endpoints. */
export interface FirstMileAccessParams {
    firstMileAmount?: number;
    firstMileDurationMinutes?: number;
    firstMileMode?: FirstMileMode;
    firstMileCurrency?: string;
    firstMileStatus?: FirstMileStatus;
    firstMileSource?: string;
    firstMileNote?: string;
}

export interface FlightsRefreshResult {
    message?: string;
    origin?: string;
    destination?: string;
    date?: string;
    diagnostics: ApiDiagnostics;
}

const DEFAULT_FLIGHT_REFRESH_OFFSET_DAYS = 21;
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

const resolveFlightDate = (date?: string): string => {
    if (date && DATE_ONLY_RE.test(date)) {
        return date;
    }

    const target = new Date();
    target.setUTCDate(target.getUTCDate() + DEFAULT_FLIGHT_REFRESH_OFFSET_DAYS);
    return target.toISOString().slice(0, 10);
};

const buildFirstMileQuery = (fm?: FirstMileAccessParams): Record<string, string> => {
    if (!fm) return {};
    const out: Record<string, string> = {};
    if (fm.firstMileAmount != null) out.firstMileAmount = String(fm.firstMileAmount);
    if (fm.firstMileDurationMinutes != null) out.firstMileDurationMinutes = String(fm.firstMileDurationMinutes);
    if (fm.firstMileMode) out.firstMileMode = fm.firstMileMode;
    if (fm.firstMileCurrency) out.firstMileCurrency = fm.firstMileCurrency;
    if (fm.firstMileStatus) out.firstMileStatus = fm.firstMileStatus;
    if (fm.firstMileSource) out.firstMileSource = fm.firstMileSource;
    if (fm.firstMileNote) out.firstMileNote = fm.firstMileNote;
    return out;
};

const fetchFlightsFromPath = async (
    path: string,
    params: FlightSearchParams,
    init?: RequestInit,
    firstMile?: FirstMileAccessParams,
): Promise<FlightsResult> => {
    const query: Record<string, string> = {
        origin: params.origin.toUpperCase(),
        destination: params.destination.toUpperCase(),
        ...buildFirstMileQuery(firstMile),
    };
    const url = buildApiUrl(path, query);

    const { response, diagnostics } = await fetchWithDiagnostics(url, init);
    await ensureOk(response, diagnostics, 'Flights failed');

    const data = (await response.json()) as BackendFlightsResponse | RawFlightAvailable[];
    return {
        flights: extractFlights(data),
        diagnostics,
    };
};

export const searchFlights = async (
    params: FlightSearchParams,
    firstMile?: FirstMileAccessParams,
): Promise<FlightsResult> => {
    return fetchFlightsFromPath('/api/flights', params, undefined, firstMile);
};

export const refreshFlights = async (params: FlightSearchParams): Promise<FlightsRefreshResult> => {
    const resolvedDate = resolveFlightDate(params.date);
    const url = buildApiUrl('/api/flights/refresh', {
        origin: params.origin.toUpperCase(),
        destination: params.destination.toUpperCase(),
        date: resolvedDate,
    });

    const { response, diagnostics } = await fetchWithDiagnostics(url, {
        method: 'POST',
    });
    await ensureOk(response, diagnostics, 'Flights refresh failed');

    let payload: Omit<FlightsRefreshResult, 'diagnostics'> = {};
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
        payload = await response.json() as Omit<FlightsRefreshResult, 'diagnostics'>;
    }

    return {
        ...payload,
        date: payload.date ?? resolvedDate,
        diagnostics,
    };
};

// ─── Flight by date  GET /api/flights/by-date ─────────────────────────────────

export interface FlightByDateResult {
    flight: FlightAvailable;
    diagnostics: ApiDiagnostics;
}

/**
 * DateGuard: returns 404 (throws) when no cached flight departs on the exact requested date.
 */
export const getFlightByDate = async (
    params: FlightSearchParams & { date: string },
    firstMile?: FirstMileAccessParams,
): Promise<FlightByDateResult> => {
    const query: Record<string, string> = {
        origin: params.origin.toUpperCase(),
        destination: params.destination.toUpperCase(),
        date: params.date,
        ...buildFirstMileQuery(firstMile),
    };
    const url = buildApiUrl('/api/flights/by-date', query);
    const { response, diagnostics } = await fetchWithDiagnostics(url);
    await ensureOk(response, diagnostics, 'Flight by date failed');
    const data = normalizeFlight((await response.json()) as RawFlightAvailable);
    return { flight: data, diagnostics };
};

// ─── External flight search  GET /api/flight-search/* ────────────────────────

export type FlightSearchProvider = 'serpapi' | 'aviationstack' | 'kiwi';

export interface ExternalFlightSearchResult {
    results: FlightSearchResult[];
    diagnostics: ApiDiagnostics;
}

/**
 * Search live/scheduled departures from an airport via SerpApi / AviationStack / Kiwi.
 * GET /api/flight-search/departures?iata=DUB&provider=serpapi
 */
export const searchFlightsByDeparture = async (
    iata: string,
    provider?: FlightSearchProvider,
): Promise<ExternalFlightSearchResult> => {
    const query: Record<string, string> = { iata: iata.toUpperCase() };
    if (provider) query.provider = provider;
    const url = buildApiUrl('/api/flight-search/departures', query);
    const { response, diagnostics } = await fetchWithDiagnostics(url);
    await ensureOk(response, diagnostics, 'Flight departures search failed');
    return { results: (await response.json()) as FlightSearchResult[], diagnostics };
};

/**
 * Search live/scheduled flights between two airports.
 * GET /api/flight-search/routes?from=DUB&to=BCN&provider=serpapi
 */
export const searchFlightRoutes = async (
    from: string,
    to: string,
    provider?: FlightSearchProvider,
): Promise<ExternalFlightSearchResult> => {
    const query: Record<string, string> = {
        from: from.toUpperCase(),
        to: to.toUpperCase(),
    };
    if (provider) query.provider = provider;
    const url = buildApiUrl('/api/flight-search/routes', query);
    const { response, diagnostics } = await fetchWithDiagnostics(url);
    await ensureOk(response, diagnostics, 'Flight routes search failed');
    return { results: (await response.json()) as FlightSearchResult[], diagnostics };
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
    const { response, diagnostics } = await fetchWithDiagnostics(url, undefined, { timeoutMs: AI_REQUEST_TIMEOUT_MS });
    await ensureOk(response, diagnostics, 'Trip suggest failed');

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
        const data = (await response.json()) as RawTripSuggestion | string;
        if (typeof data === 'string') {
            return {
                suggestion: { origin: params.origin, destination: params.destination, suggestion: data, rawText: data },
                diagnostics,
            };
        }
        return {
            suggestion: normalizeTripSuggestion(data, { origin: params.origin, destination: params.destination }),
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
    pace?: TravelPace;
    season?: string;
    preferredTransport?: PreferredTransport;
    provider?: AiProviderName;
}

export const planTrip = async (params: TripPlanParams): Promise<TripSuggestionResult> => {
    const url = buildApiUrl('/api/trips/plans');

    const { response, diagnostics } = await fetchWithDiagnostics(
        url,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params),
            credentials: 'include',
        },
        { timeoutMs: AI_REQUEST_TIMEOUT_MS, requiresAuth: true },
    );
    await ensureOk(response, diagnostics, 'Trip plan failed');

    const data = (await response.json()) as RawTripSuggestion;
    return {
        suggestion: normalizeTripSuggestion(data, { origin: params.origin ?? '', destination: params.destination }),
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
            credentials: 'include',
        },
        { timeoutMs: AI_REQUEST_TIMEOUT_MS, requiresAuth: true },
    );
    await ensureOk(response, diagnostics, 'Itinerary generation failed');

    const data = (await response.json()) as RawTripSuggestion;
    return {
        suggestion: normalizeTripSuggestion(data, { origin: params.origin ?? '', destination: params.destination }),
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
        credentials: 'include',
    });
    await ensureOk(response, diagnostics, 'Login failed');
    return (await response.json()) as LoginResponse;
};

export const logoutAccount = async (): Promise<{ message?: string }> => {
    const url = buildApiUrl('/api/accounts/logout');
    let { response, diagnostics } = await fetchWithDiagnostics(url, {
        method: 'POST',
        credentials: 'include',
    });

    if (response.status === 404) {
        const fallback = await fetchWithDiagnostics(`${API_BASE}/logout`, {
            method: 'POST',
            credentials: 'include',
        });
        response = fallback.response;
        diagnostics = fallback.diagnostics;
    }

    await ensureOk(response, diagnostics, 'Logout failed');

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
        return { message: 'Logout successful' };
    }

    return (await response.json()) as { message?: string };
};

export const getProfile = async (): Promise<Account> => {
    const url = buildApiUrl('/api/accounts/profile');
    const { response, diagnostics } = await fetchWithDiagnostics(url, { credentials: 'include' }, { requiresAuth: true });
    await ensureOk(response, diagnostics, 'Failed to load profile');
    return (await response.json()) as Account;
};

export const getPreferences = async (): Promise<UserProfile> => {
    const url = buildApiUrl('/api/accounts/preferences');
    const { response, diagnostics } = await fetchWithDiagnostics(url, { credentials: 'include' }, { requiresAuth: true });
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
    }, { requiresAuth: true });
    await ensureOk(response, diagnostics, 'Failed to update preferences');
    return (await response.json()) as UserProfile;
};

// ─── Hotels  /api/hotels/* ────────────────────────────────────────────────────

export interface HotelsResult {
    hotels: HotelResult[];
    diagnostics: ApiDiagnostics;
}

export interface HotelEnrichmentResult {
    enrichment: HotelEnrichmentResponse;
    diagnostics: ApiDiagnostics;
}

/**
 * Find nearby hotels via OpenTripMap with optional SerpApi enrichment.
 * GET /api/hotels/nearby?lat=48.8566&lon=2.3522&radius=2000
 */
export const getHotelsNearby = async (
    lat: number,
    lon: number,
    radius: number = 2000,
): Promise<HotelsResult> => {
    const url = buildApiUrl('/api/hotels/nearby', {
        lat: String(lat),
        lon: String(lon),
        radius: String(radius),
    });
    const { response, diagnostics } = await fetchWithDiagnostics(url);
    await ensureOk(response, diagnostics, 'Hotels nearby failed');
    return { hotels: normalizeHotelResults(await response.json()), diagnostics };
};

/**
 * Find hotels inside a bounding box.
 * GET /api/hotels/search/bbox?lonMin=...&latMin=...&lonMax=...&latMax=...
 */
export const getHotelsByBbox = async (
    lonMin: number,
    latMin: number,
    lonMax: number,
    latMax: number,
): Promise<HotelsResult> => {
    const url = buildApiUrl('/api/hotels/search/bbox', {
        lonMin: String(lonMin),
        latMin: String(latMin),
        lonMax: String(lonMax),
        latMax: String(latMax),
    });
    const { response, diagnostics } = await fetchWithDiagnostics(url);
    await ensureOk(response, diagnostics, 'Hotels bbox search failed');
    return { hotels: normalizeHotelResults(await response.json()), diagnostics };
};

/**
 * Get raw OpenTripMap place details for a single hotel.
 * GET /api/hotels/{xid}
 */
export const getHotelDetails = async (xid: string): Promise<{ details: GenericJsonObject; diagnostics: ApiDiagnostics }> => {
    const url = buildApiUrl(`/api/hotels/${encodeURIComponent(xid)}`);
    const { response, diagnostics } = await fetchWithDiagnostics(url);
    await ensureOk(response, diagnostics, 'Hotel details failed');
    return { details: (await response.json()) as GenericJsonObject, diagnostics };
};

/**
 * Get SerpApi-backed enrichment (reviews, rating, price, amenities) for a single place.
 * GET /api/hotels/{xid}/enrichment
 */
export const getHotelEnrichment = async (xid: string): Promise<HotelEnrichmentResult> => {
    const url = buildApiUrl(`/api/hotels/${encodeURIComponent(xid)}/enrichment`);
    const { response, diagnostics } = await fetchWithDiagnostics(url);
    await ensureOk(response, diagnostics, 'Hotel enrichment failed');
    return { enrichment: (await response.json()) as HotelEnrichmentResponse, diagnostics };
};

