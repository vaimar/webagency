import {
    ExploreWarning,
    FlightResult,
    HiddenGemHotel,
    TripExplorationResponse,
    UnifiedFlightOption,
} from '../types/tripExploration';
import { getAntiCauchemarPricingSummary } from './antiCauchemarPricing';

// Pure selectors and formatters over the /api/trips/explore wire contract.
// Everything here is side-effect free so tabs, modals, and tests can share
// one reading of the payload instead of re-deriving it per component.

// ─────────────────────────────────────────────────────────────────────────────
// Guards & formatting
// ─────────────────────────────────────────────────────────────────────────────

// Backend primitives (double) serialize as 0 when never set — treat 0 as
// "unknown" rather than pretending a €0 fare exists.
export const asPositiveAmount = (value: number | null | undefined): number | undefined => (
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
);

export const formatCurrency = (value: number | null | undefined, currency = 'EUR'): string => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return '—';
    }

    try {
        return new Intl.NumberFormat('en-IE', {
            style: 'currency',
            currency,
            maximumFractionDigits: 0,
        }).format(value);
    } catch {
        return `${Math.round(value)} ${currency}`;
    }
};

export const formatDate = (value?: string | null): string => {
    if (!value) {
        return 'TBD';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return new Intl.DateTimeFormat('en', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
    }).format(date);
};

export const formatDateTime = (value?: string | null): string | null => {
    if (!value) {
        return null;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return new Intl.DateTimeFormat('en', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).format(date);
};

export const formatMinutes = (minutes: number | null | undefined): string | null => {
    const value = asPositiveAmount(minutes);
    if (value == null) {
        return null;
    }

    const hours = Math.floor(value / 60);
    const remainder = Math.round(value % 60);
    return hours > 0 ? `${hours}h${String(remainder).padStart(2, '0')}` : `${remainder} min`;
};

export const formatKm = (km: number | null | undefined): string | null => (
    typeof km === 'number' && Number.isFinite(km)
        // One decimal so "0.1 km" never rounds down to a misleading flat "0 km".
        ? `${km.toFixed(1)} km`
        : null
);

// ─────────────────────────────────────────────────────────────────────────────
// Orchestration status
// ─────────────────────────────────────────────────────────────────────────────

/** Backend emits "OK", "DEGRADED", or "CITY_COORDINATES_UNAVAILABLE". */
export const getOrchestrationStatus = (trip?: TripExplorationResponse | null): string => (
    (trip?.orchestrationStatus ?? 'OK').toUpperCase()
);

export const isDegradedResponse = (trip?: TripExplorationResponse | null): boolean => (
    getOrchestrationStatus(trip) !== 'OK'
);

export const getWarningText = (warning: ExploreWarning | string): string => {
    if (typeof warning === 'string') {
        return warning;
    }

    const text = warning.message ?? warning.kind ?? 'Service warning';
    const prefixed = warning.source ? `${warning.source}: ${text}` : text;
    return warning.fallbackUsed ? `${prefixed} (fallback data)` : prefixed;
};

// ─────────────────────────────────────────────────────────────────────────────
// Flights
// ─────────────────────────────────────────────────────────────────────────────

export interface FlightPricingView {
    /** Headline number — the fare itself, never the marketing price of another field. */
    baseFare?: number;
    /** auditedTotalCost → recomputed extras → realWorldEntryPrice, per the honest hierarchy. */
    honestTotal?: number;
    /** Additive door-to-trip context — never replaces the flight-only price. */
    doorToTripPrice?: number;
    currency: string;
    manualCheckRequired: boolean;
    /** Backend-provided provenance label (e.g. "Estimated (Cached)"). */
    provenance: string | null;
}

export const getFlightPricing = (flight?: UnifiedFlightOption | null): FlightPricingView => {
    const pricing = getAntiCauchemarPricingSummary(asPositiveAmount(flight?.ticketPrice), flight?.antiCauchemar);
    return {
        baseFare: pricing.ticketPrice ?? pricing.baseFare,
        honestTotal: pricing.estimatedEntryPrice ?? asPositiveAmount(flight?.realWorldEntryPrice),
        doorToTripPrice: asPositiveAmount(flight?.doorToTripPrice) ?? pricing.doorToTripPrice,
        currency: pricing.currency,
        manualCheckRequired: pricing.hasManualCheckRequired,
        provenance: flight?.priceLabel ?? flight?.freshnessLabel ?? null,
    };
};

/** Night window matches the transfer estimator's rate table (22:00–06:00 local). */
export const isLateNightArrival = (isoArrival?: string | null): boolean => {
    if (!isoArrival) {
        return false;
    }

    const date = new Date(isoArrival);
    if (Number.isNaN(date.getTime())) {
        return false;
    }

    const hour = date.getHours();
    return hour >= 22 || hour < 6;
};

/** "Anti-Cauchemar approved" = no backend catch, no manual check, no hidden
 *  airport penalty, and no late-night arrival. */
export const isAntiCauchemarApproved = (flight: Pick<UnifiedFlightOption, 'antiCauchemar' | 'scheduledArrival'>): boolean => {
    const truth = flight.antiCauchemar;
    return !truth?.theCatch
        && !truth?.manualCheckRequired
        && asPositiveAmount(truth?.hiddenCostPenalty) == null
        && !isLateNightArrival(flight.scheduledArrival);
};

/** Normalized row consumed by the flights tab — one shape whether the data
 *  came from unifiedFlights or flightComparison.mergedFlights. */
export interface FlightRowView {
    key: string;
    airline: string | null;
    flightNumber: string | null;
    routeLabel: string | null;
    departureLabel: string | null;
    arrivalLabel: string | null;
    providerLabel: string | null;
    baseFare?: number;
    honestTotal?: number;
    doorToTripPrice?: number;
    currency: string;
    provenance: string | null;
    approved: boolean;
    catchMessage: string | null;
    transitSummary: string | null;
}

const buildRouteLabel = (departure?: string | null, arrival?: string | null): string | null => (
    departure && arrival ? `${departure} → ${arrival}` : null
);

const buildTransitSummary = (flight: UnifiedFlightOption | FlightResult): string | null => {
    const truth = flight.antiCauchemar;
    const parts = [
        formatMinutes(truth?.flightDurationMinutes) && `Flight ${formatMinutes(truth?.flightDurationMinutes)}`,
        formatMinutes(truth?.transferToCenterMinutes) && `Transfer ~${formatMinutes(truth?.transferToCenterMinutes)}`,
        formatMinutes(truth?.totalTravelTimeMinutes) && `Door-to-door ${formatMinutes(truth?.totalTravelTimeMinutes)}`,
    ].filter(Boolean) as string[];

    return parts.length > 0 ? parts.join(' · ') : null;
};

const getCatchMessage = (flight: UnifiedFlightOption | FlightResult): string | null => {
    const truth = flight.antiCauchemar;
    return truth?.theCatch
        ?? (truth?.manualCheckReasons?.length ? truth.manualCheckReasons.join(' · ') : null);
};

const toRowFromUnified = (flight: UnifiedFlightOption, index: number): FlightRowView => {
    const pricing = getFlightPricing(flight);
    return {
        key: `${flight.flightNumber ?? 'unified'}-${flight.source ?? index}-${index}`,
        airline: flight.airline ?? null,
        flightNumber: flight.flightNumber ?? null,
        routeLabel: buildRouteLabel(flight.departureAirport, flight.arrivalAirport),
        departureLabel: formatDateTime(flight.scheduledDeparture),
        arrivalLabel: formatDateTime(flight.scheduledArrival),
        providerLabel: flight.sourceLabel ?? flight.source ?? null,
        baseFare: pricing.baseFare,
        honestTotal: pricing.honestTotal,
        doorToTripPrice: pricing.doorToTripPrice,
        currency: pricing.currency,
        provenance: pricing.provenance,
        approved: isAntiCauchemarApproved(flight),
        catchMessage: getCatchMessage(flight),
        transitSummary: buildTransitSummary(flight),
    };
};

const toRowFromFlightResult = (flight: FlightResult, index: number): FlightRowView => {
    const pricing = getAntiCauchemarPricingSummary(asPositiveAmount(flight.estimatedTicketPrice), flight.antiCauchemar);
    return {
        key: `${flight.flightNumber ?? 'merged'}-${flight.provider ?? index}-${index}`,
        airline: flight.airline ?? null,
        flightNumber: flight.flightNumber ?? null,
        routeLabel: buildRouteLabel(flight.departureAirport, flight.arrivalAirport),
        departureLabel: formatDateTime(flight.scheduledDeparture),
        arrivalLabel: formatDateTime(flight.scheduledArrival),
        providerLabel: flight.provider ?? null,
        baseFare: pricing.ticketPrice ?? pricing.baseFare,
        honestTotal: pricing.estimatedEntryPrice ?? asPositiveAmount(flight.realWorldEntryPrice),
        doorToTripPrice: asPositiveAmount(flight.doorToTripPrice) ?? pricing.doorToTripPrice,
        currency: pricing.currency,
        provenance: null,
        approved: isAntiCauchemarApproved(flight),
        catchMessage: getCatchMessage(flight),
        transitSummary: buildTransitSummary(flight),
    };
};

export const getFlightRows = (trip?: TripExplorationResponse | null): FlightRowView[] => {
    const unified = trip?.unifiedFlights ?? [];
    if (unified.length > 0) {
        return unified.map(toRowFromUnified);
    }

    return (trip?.flightComparison?.mergedFlights ?? []).map(toRowFromFlightResult);
};

export type FlightViewMode = 'all' | 'cheapest' | 'approved';

export const applyFlightViewMode = (rows: FlightRowView[], mode: FlightViewMode): FlightRowView[] => {
    if (mode === 'cheapest') {
        return [...rows].sort((a, b) => (
            (a.honestTotal ?? a.baseFare ?? Number.MAX_SAFE_INTEGER)
            - (b.honestTotal ?? b.baseFare ?? Number.MAX_SAFE_INTEGER)
        ));
    }

    if (mode === 'approved') {
        return rows.filter((row) => row.approved);
    }

    return rows;
};

export const getProviderBadges = (trip?: TripExplorationResponse | null): string[] => {
    const byProvider = trip?.flightComparison?.byProvider ?? {};
    return Object.entries(byProvider).map(([provider, flights]) => `${provider} (${flights?.length ?? 0})`);
};

// ─────────────────────────────────────────────────────────────────────────────
// Stays
// ─────────────────────────────────────────────────────────────────────────────

export const getGemPrice = (gem?: HiddenGemHotel | null): number | undefined => (
    asPositiveAmount(gem?.hotel?.pricePerNight)
);

export const getGemCurrency = (gem?: HiddenGemHotel | null): string => (
    gem?.hotel?.priceCurrency ?? 'EUR'
);

export const getGemRating = (gem?: HiddenGemHotel | null): number | undefined => {
    const rating = gem?.hotel?.rating;
    return typeof rating === 'number' && Number.isFinite(rating) ? rating : undefined;
};

export const formatRating = (rating: number | undefined): string | null => (
    rating != null ? `${rating.toFixed(rating % 1 === 0 ? 0 : 1)}★` : null
);

// The backend's own selectionReason prose ("...0.1 km away...") often carries
// the precise distance even when the structured distanceToActivityKm field is
// missing/stale. We surface that real number instead of a fake default.
export const extractDistanceFromReason = (reason?: string | null): number | null => {
    if (!reason) {
        return null;
    }

    const match = reason.match(/(\d+(?:\.\d+)?)\s*km/i);
    if (!match) {
        return null;
    }

    const parsed = Number.parseFloat(match[1]);
    return Number.isFinite(parsed) ? parsed : null;
};

/** distanceToActivityKm lives on the HiddenGemHotel wrapper (sibling of
 *  `hotel`), already rounded to one decimal by HiddenGemScorerService.
 *  0.0 is a valid "right at the spot" value, so it is kept as-is. */
export const getGemDistanceKm = (gem?: HiddenGemHotel | null): number | undefined => {
    const structured = gem?.distanceToActivityKm;
    if (typeof structured === 'number' && Number.isFinite(structured)) {
        return structured;
    }

    return extractDistanceFromReason(gem?.selectionReason) ?? undefined;
};

export type StaysSortKey = 'score' | 'price' | 'distance';

export interface StaysFilters {
    /** 0 = any rating. */
    minRating: number;
    /** Values at or above STAYS_DISTANCE_LIMIT_KM mean "no distance cap". */
    maxDistanceKm: number;
    /** null = no budget cap. */
    maxPricePerNight: number | null;
}

export const STAYS_DISTANCE_LIMIT_KM = 10;

export const DEFAULT_STAYS_FILTERS: StaysFilters = {
    minRating: 0,
    maxDistanceKm: STAYS_DISTANCE_LIMIT_KM,
    maxPricePerNight: null,
};

export interface FilteredStays {
    visible: HiddenGemHotel[];
    /** Stays excluded by active filters — surfaced, never silently dropped. */
    hiddenCount: number;
}

const staysComparator = (sortKey: StaysSortKey) => (a: HiddenGemHotel, b: HiddenGemHotel): number => {
    if (sortKey === 'price') {
        return (getGemPrice(a) ?? Number.MAX_SAFE_INTEGER) - (getGemPrice(b) ?? Number.MAX_SAFE_INTEGER);
    }

    if (sortKey === 'distance') {
        return (getGemDistanceKm(a) ?? Number.MAX_SAFE_INTEGER) - (getGemDistanceKm(b) ?? Number.MAX_SAFE_INTEGER);
    }

    return (b.compositeScore ?? 0) - (a.compositeScore ?? 0);
};

export const filterAndSortStays = (
    gems: HiddenGemHotel[],
    filters: StaysFilters,
    sortKey: StaysSortKey,
): FilteredStays => {
    // Active filters exclude records missing that field (can't verify a match),
    // but the exclusion is counted and reported to the user.
    const visible = gems.filter((gem) => {
        if (filters.minRating > 0) {
            const rating = getGemRating(gem);
            if (rating == null || rating < filters.minRating) {
                return false;
            }
        }

        if (filters.maxDistanceKm < STAYS_DISTANCE_LIMIT_KM) {
            const distance = getGemDistanceKm(gem);
            if (distance == null || distance > filters.maxDistanceKm) {
                return false;
            }
        }

        if (filters.maxPricePerNight != null) {
            const price = getGemPrice(gem);
            if (price == null || price > filters.maxPricePerNight) {
                return false;
            }
        }

        return true;
    });

    return {
        visible: [...visible].sort(staysComparator(sortKey)),
        hiddenCount: gems.length - visible.length,
    };
};

/** Upper bound for the budget slider, derived from the data (rounded up to
 *  the next €10), with a sane floor when no stay has a price yet. */
export const getStaysPriceCeiling = (gems: HiddenGemHotel[]): number => {
    const prices = gems
        .map((gem) => getGemPrice(gem))
        .filter((price): price is number => price != null);

    if (prices.length === 0) {
        return 300;
    }

    return Math.max(50, Math.ceil(Math.max(...prices) / 10) * 10);
};
