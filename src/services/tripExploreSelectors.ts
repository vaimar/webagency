import {
    ActivityPlace,
    ExploreWarning,
    FlightResult,
    HiddenGemHotel,
    HotelRateQuote,
    HotelResult,
    TripExplorationResponse,
    UnifiedFlightOption,
} from '../types/tripExploration';
import { getAntiCauchemarPricingSummary } from './antiCauchemarPricing';
import { DriveEstimate, estimateDrive, originCityForAirport } from './driveEstimate';
import type { SelfConnectResult } from './selfConnect';

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
// Backend-constant sanitization — raw Java enums never reach the user.
// ─────────────────────────────────────────────────────────────────────────────

/** Known backend constants → shopper-friendly labels. Empty string = hide. */
const PROVIDER_LABELS: Record<string, string> = {
    EXTERNAL_PROVIDER: 'Partner Offer',
    EXTERNAL_SEARCH: '',
    RYANAIR_CACHE: 'Ryanair · cached fare',
    FALLBACK_ROUTING: 'Alternative route',
};

const FALLBACK_FLIGHT_RE = /^FALLBACK[-_]/i;

/**
 * True when the backend synthesised this option instead of finding it.
 * `FlightSearchService.buildHeuristicFallbackFlight` invents airline "Fallback
 * Routing", number "FALLBACK-<origin><dest>", a flat fare and placeholder times.
 * Exported so views can label it rather than each re-deriving the test.
 */
export const isFallbackOption = (flight?: { flightNumber?: string | null; airline?: string | null } | null): boolean => (
    Boolean(flight)
    && (FALLBACK_FLIGHT_RE.test(flight!.flightNumber ?? '')
        || /^fallback\s+routing$/i.test((flight!.airline ?? '').trim()))
);

export const sanitizeFlightNumber = (value?: string | null): string | null => {
    if (!value) return null;
    if (FALLBACK_FLIGHT_RE.test(value)) return null;
    return value;
};

export const sanitizeAirline = (value?: string | null): string | null => {
    if (!value) return null;
    if (FALLBACK_FLIGHT_RE.test(value) || /^FALLBACK\s/i.test(value)) return null;
    return value;
};

export const looksLikeBackendConstant = (value: string): boolean => (
    /^[A-Z0-9]+(?:[_\s][A-Z0-9()]+)*$/.test(value) && (value.includes('_') || value.length > 3)
);

const titleCaseConstant = (value: string): string => (
    value
        .toLowerCase()
        .split(/[_\s]+/)
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
);

/** Maps provider/source constants to clean labels; unknown enum-shaped values
 *  are title-cased, human text passes through, hidden labels become null. */
export const humanizeProviderLabel = (value?: string | null): string | null => {
    if (!value) {
        return null;
    }

    const trimmed = value.trim();
    const mapped = PROVIDER_LABELS[trimmed.toUpperCase()];
    if (mapped !== undefined) {
        return mapped === '' ? null : mapped;
    }

    return looksLikeBackendConstant(trimmed) ? titleCaseConstant(trimmed) : trimmed;
};

/** Drops leaked constant prefixes like "MANUAL_CHECK_REQUIRED: " from prose —
 *  the warning container already conveys the state. */
export const stripConstantPrefix = (value?: string | null): string | null => {
    if (!value) {
        return null;
    }

    const stripped = value.replace(/^[A-Z][A-Z0-9_]{2,}:\s*/, '').trim();
    return stripped.length > 0 ? stripped : null;
};

const ORCHESTRATION_STATUS_LABELS: Record<string, string> = {
    OK: 'Live',
    DEGRADED: 'Partial data',
    CITY_COORDINATES_UNAVAILABLE: 'Limited coverage',
};

/** Shopper-friendly wording for the orchestration status pill/banner. */
export const humanizeOrchestrationStatus = (status: string): string => (
    ORCHESTRATION_STATUS_LABELS[status.toUpperCase()] ?? titleCaseConstant(status)
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
        return stripConstantPrefix(warning) ?? warning;
    }

    const text = stripConstantPrefix(warning.message ?? warning.kind ?? 'Service warning') ?? 'Service warning';
    const sourceKey = warning.source?.trim() ?? '';
    const mappedSource = sourceKey ? PROVIDER_LABELS[sourceKey.toUpperCase()] : undefined;
    const source = sourceKey
        ? mappedSource !== undefined
            ? (mappedSource || null)
            : humanizeProviderLabel(sourceKey)
                ?? (looksLikeBackendConstant(sourceKey)
                    ? titleCaseConstant(sourceKey)
                    : sourceKey)
        : null;
    const prefixed = source ? `${source}: ${text}` : text;
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
        // Humanised here rather than at each call site: TripOverviewTab rendered
        // this field straight out and put the raw "EXTERNAL_SEARCH" constant on
        // screen under the fare. Sanitising at the source means no consumer can
        // forget to.
        provenance: humanizeProviderLabel(flight?.priceLabel ?? flight?.freshnessLabel ?? null),
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
    /** The underlying flight option — what gets promoted when the user selects
     *  this row. For merged FlightResult rows it is a synthesized equivalent. */
    option: UnifiedFlightOption;
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
    /** Lower = less friction when no route is fully Anti-Cauchemar-clean. */
    penaltyScore: number;
    catchMessage: string | null;
    transitSummary: string | null;
    /** Departs from a hub the traveller drives to (backend fly-drive expansion). */
    flyDrive: boolean;
    /** Backend-provided tip explaining the drive trade-off. */
    originAccessNote: string | null;
    /** 0 = direct; otherwise the number of layover stops. */
    stops: number;
    /** "1 stop · via LHR (2h24 wait)" — null when direct. */
    connectionSummary: string | null;
    /** Whole-journey duration incl. layovers, e.g. "10h25". */
    totalDurationLabel: string | null;
}

/** Human "1 stop · via FRA (2h06 wait), ATH (2h42 wait)" — null when direct. */
export const buildConnectionSummary = (
    flight: Pick<UnifiedFlightOption, 'stops' | 'layovers'>,
): string | null => {
    const layovers = flight.layovers ?? [];
    const stops = flight.stops ?? layovers.length;
    if (stops <= 0 && layovers.length === 0) {
        return null;
    }
    if (layovers.length === 0) {
        return `${stops} stop${stops > 1 ? 's' : ''}`;
    }
    const via = layovers
        .filter((l) => l?.airport)
        .map((l) => {
            const wait = formatMinutes(l.durationMinutes);
            const overnight = l.overnight ? ' overnight' : '';
            return wait ? `${l.airport} (${wait} wait${overnight})` : `${l.airport}${overnight}`;
        })
        .join(', ');
    return `${layovers.length} stop${layovers.length > 1 ? 's' : ''} · via ${via}`;
};

const buildRouteLabel = (departure?: string | null, arrival?: string | null): string | null => (
    departure && arrival ? `${departure} → ${arrival}` : null
);

const buildTransitSummary = (flight: UnifiedFlightOption): string | null => {
    const truth = flight.antiCauchemar;
    const driveMinutes = asPositiveAmount(flight.originDriveMinutes);
    const totalMinutes = asPositiveAmount(truth?.totalTravelTimeMinutes);
    // Honest total time: a fly-drive departure adds the drive to the hub on
    // top of the backend's flight + transfer total.
    const doorToDoor = totalMinutes != null
        ? formatMinutes(totalMinutes + (driveMinutes ?? 0))
        : null;

    const parts = [
        driveMinutes != null && `Drive ${formatMinutes(driveMinutes)}${flight.departureAirport ? ` to ${flight.departureAirport}` : ''}`,
        formatMinutes(truth?.flightDurationMinutes) && `Flight ${formatMinutes(truth?.flightDurationMinutes)}`,
        formatMinutes(truth?.transferToCenterMinutes) && `Transfer ~${formatMinutes(truth?.transferToCenterMinutes)}`,
        doorToDoor && `Door-to-door ${doorToDoor}${driveMinutes != null ? ' incl. drive' : ''}`,
    ].filter(Boolean) as string[];

    return parts.length > 0 ? parts.join(' · ') : null;
};

export const getFlightCatchMessage = (flight: UnifiedFlightOption | FlightResult): string | null => {
    const truth = flight.antiCauchemar;
    const reasons = truth?.manualCheckReasons
        ?.map((reason) => stripConstantPrefix(reason))
        .filter((reason): reason is string => Boolean(reason))
        .join(' · ');

    const disclaimer = 'priceDisclaimer' in flight
        ? stripConstantPrefix(flight.priceDisclaimer)
        : null;

    return stripConstantPrefix(truth?.theCatch) ?? disclaimer ?? reasons ?? null;
};

const getAntiCauchemarPenaltyScore = (flight: UnifiedFlightOption): number => {
    const truth = flight.antiCauchemar;
    const hiddenCostPenalty = asPositiveAmount(truth?.hiddenCostPenalty) ?? 0;
    const timePenaltyMinutes = asPositiveAmount(truth?.timePenaltyMinutes) ?? 0;
    const manualReasonsWeight = Math.min(12, (truth?.manualCheckReasons?.length ?? 0) * 4);

    return hiddenCostPenalty
        + (timePenaltyMinutes / 10)
        + (truth?.manualCheckRequired ? 25 : 0)
        + (truth?.theCatch ? 18 : 0)
        + (isLateNightArrival(flight.scheduledArrival) ? 15 : 0)
        + manualReasonsWeight;
};

const byLeastTransitFriction = (a: FlightRowView, b: FlightRowView): number => (
    a.penaltyScore - b.penaltyScore
    || ((a.honestTotal ?? a.baseFare ?? Number.MAX_SAFE_INTEGER)
        - (b.honestTotal ?? b.baseFare ?? Number.MAX_SAFE_INTEGER))
);

const toRowFromUnified = (flight: UnifiedFlightOption, index: number): FlightRowView => {
    const pricing = getFlightPricing(flight);
    return {
        key: `${flight.flightNumber ?? 'unified'}-${flight.source ?? index}-${flight.scheduledDeparture ?? ''}-${index}`,
        option: flight,
        airline: sanitizeAirline(flight.airline),
        flightNumber: sanitizeFlightNumber(flight.flightNumber),
        routeLabel: buildRouteLabel(flight.departureAirport, flight.arrivalAirport),
        departureLabel: formatDateTime(flight.scheduledDeparture),
        arrivalLabel: formatDateTime(flight.scheduledArrival),
        providerLabel: humanizeProviderLabel(flight.sourceLabel ?? flight.source ?? null),
        baseFare: pricing.baseFare,
        honestTotal: pricing.honestTotal,
        doorToTripPrice: pricing.doorToTripPrice,
        currency: pricing.currency,
        // Already humanised by getFlightPricing. It used to read
        // `humanizeProviderLabel(x) ?? x`, which defeated the point: the helper
        // returns null both when there is nothing to show *and* when the label is
        // one it is meant to suppress (PROVIDER_LABELS maps EXTERNAL_SEARCH to
        // ''), so the `??` resurrected the raw constant it had just hidden.
        provenance: pricing.provenance,
        approved: isAntiCauchemarApproved(flight),
        penaltyScore: getAntiCauchemarPenaltyScore(flight),
        catchMessage: getFlightCatchMessage(flight),
        transitSummary: buildTransitSummary(flight),
        flyDrive: Boolean(flight.alternativeOrigin) || asPositiveAmount(flight.originDriveMinutes) != null,
        originAccessNote: flight.originAccessNote ?? null,
        stops: flight.stops ?? (flight.layovers?.length ?? 0),
        connectionSummary: buildConnectionSummary(flight),
        totalDurationLabel: formatMinutes(flight.totalDurationMinutes),
    };
};

const toRowFromFlightResult = (flight: FlightResult, index: number): FlightRowView => {
    // Normalize the FlightResult shape (estimatedTicketPrice, provider) into a
    // UnifiedFlightOption so selection and pricing share one code path.
    const option: UnifiedFlightOption = {
        source: flight.provider,
        sourceLabel: flight.provider,
        airline: flight.airline,
        flightNumber: flight.flightNumber,
        departureAirport: flight.departureAirport,
        arrivalAirport: flight.arrivalAirport,
        scheduledDeparture: flight.scheduledDeparture,
        scheduledArrival: flight.scheduledArrival,
        ticketPrice: flight.estimatedTicketPrice,
        realWorldEntryPrice: flight.realWorldEntryPrice,
        doorToTripPrice: flight.doorToTripPrice,
        antiCauchemar: flight.antiCauchemar,
        stops: flight.stops,
        totalDurationMinutes: flight.totalDurationMinutes,
        layovers: flight.layovers,
    };

    const row = toRowFromUnified(option, index);
    return { ...row, key: `${flight.flightNumber ?? 'merged'}-${flight.provider ?? index}-${flight.scheduledDeparture ?? ''}-${index}` };
};

export const getFlightRows = (trip?: TripExplorationResponse | null): FlightRowView[] => {
    const unified = trip?.unifiedFlights ?? [];
    if (unified.length > 0) {
        return unified.map(toRowFromUnified);
    }

    return (trip?.flightComparison?.mergedFlights ?? []).map(toRowFromFlightResult);
};

export type FlightViewMode = 'all' | 'cheapest' | 'approved';

export interface FlightViewSelection {
    rows: FlightRowView[];
    fallbackUsed: boolean;
    warningMessage: string | null;
}

export const getFlightViewSelection = (rows: FlightRowView[], mode: FlightViewMode): FlightViewSelection => {
    if (mode === 'cheapest') {
        return {
            rows: [...rows].sort((a, b) => (
                (a.honestTotal ?? a.baseFare ?? Number.MAX_SAFE_INTEGER)
                - (b.honestTotal ?? b.baseFare ?? Number.MAX_SAFE_INTEGER)
            )),
            fallbackUsed: false,
            warningMessage: null,
        };
    }

    if (mode === 'approved') {
        const approved = rows.filter((row) => row.approved);
        if (approved.length > 0) {
            return { rows: approved, fallbackUsed: false, warningMessage: null };
        }

        if (rows.length === 0) {
            return { rows: [], fallbackUsed: false, warningMessage: null };
        }

        return {
            rows: [...rows].sort(byLeastTransitFriction).slice(0, 3),
            fallbackUsed: true,
            warningMessage: 'Note: No perfect flights found. Showing the options with the least transit friction.',
        };
    }

    return { rows, fallbackUsed: false, warningMessage: null };
};

export const applyFlightViewMode = (rows: FlightRowView[], mode: FlightViewMode): FlightRowView[] => {
    return getFlightViewSelection(rows, mode).rows;
};

export const getProviderBadges = (trip?: TripExplorationResponse | null): string[] => {
    const byProvider = trip?.flightComparison?.byProvider ?? {};
    const counts = new Map<string, number>();

    Object.entries(byProvider).forEach(([provider, flights]) => {
        const label = humanizeProviderLabel(provider);
        if (!label) {
            return;
        }

        counts.set(label, (counts.get(label) ?? 0) + (flights?.length ?? 0));
    });

    return Array.from(counts.entries()).map(([label, count]) => `${label} (${count})`);
};

/** Quotes for the same physical flight (same number + departure) gathered by
 *  the backend across providers — lets the user compare departure-to-arrival
 *  identical options that differ only in price/provenance. */
export const getSameFlightQuotes = (
    trip: TripExplorationResponse | null | undefined,
    row: FlightRowView,
): UnifiedFlightOption[] => {
    if (!row.flightNumber) {
        return [];
    }

    const comparison = (trip?.sameFlightComparisons ?? []).find((candidate) => (
        candidate?.flightNumber === row.flightNumber
        && (
            !candidate?.scheduledDeparture
            || !row.option.scheduledDeparture
            || candidate.scheduledDeparture === row.option.scheduledDeparture
        )
    ));

    const quotes = comparison?.quotes ?? [];
    // A single quote is just the row itself — only a real comparison is useful.
    return quotes.length > 1 ? quotes : [];
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
    /** Strong stays with no nightly rate yet — kept visible outside the budget bucket. */
    pendingRate: HiddenGemHotel[];
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
    // Active rating/distance filters exclude records missing that field (can't
    // verify a match), but unpriced stays remain visible in a separate bucket so
    // the budget slider never turns strong recommendations into a dead end.
    const visible: HiddenGemHotel[] = [];
    const pendingRate: HiddenGemHotel[] = [];
    let hiddenCount = 0;

    gems.forEach((gem) => {
        if (filters.minRating > 0) {
            const rating = getGemRating(gem);
            if (rating == null || rating < filters.minRating) {
                hiddenCount += 1;
                return;
            }
        }

        if (filters.maxDistanceKm < STAYS_DISTANCE_LIMIT_KM) {
            const distance = getGemDistanceKm(gem);
            if (distance == null || distance > filters.maxDistanceKm) {
                hiddenCount += 1;
                return;
            }
        }

        const price = getGemPrice(gem);

        if (filters.maxPricePerNight != null) {
            if (price == null) {
                pendingRate.push(gem);
                return;
            }

            if (price > filters.maxPricePerNight) {
                hiddenCount += 1;
                return;
            }
        }

        if (price == null) {
            pendingRate.push(gem);
            return;
        }

        visible.push(gem);
    });

    return {
        visible: [...visible].sort(staysComparator(sortKey)),
        pendingRate: [...pendingRate].sort(staysComparator(sortKey === 'price' ? 'score' : sortKey)),
        hiddenCount,
    };
};

export const shouldPromotePendingStayAvailability = (gem?: HiddenGemHotel | null): boolean => (
    getGemPrice(gem) == null && (Boolean(gem?.selectionReason) || (gem?.compositeScore ?? 0) >= 0.75)
);

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

// ─────────────────────────────────────────────────────────────────────────────
// Points of interest — activities & restaurants (OpenTripMap ActivityPlace[])
// ─────────────────────────────────────────────────────────────────────────────

// OpenTripMap `kinds` is a comma list (e.g. "foods,cafes,tourist_facilities").
// We pick the most *specific* category present, not the first token — dining
// POIs always lead with generic "foods", so a priority scan yields Café / Bar /
// Beach instead of a bland "Restaurant" for everything.
const POI_CATEGORY_PRIORITY: Array<[string, string]> = [
    ['restaurants', 'Restaurant'],
    ['cafes', 'Café'],
    ['bars', 'Bar'],
    ['pubs', 'Pub'],
    ['fast_food', 'Fast food'],
    ['museums', 'Museum'],
    ['historic', 'Historic'],
    ['golden_sand_beaches', 'Beach'],
    ['urbans_beaches', 'Beach'],
    ['other_beaches', 'Beach'],
    ['beaches', 'Beach'],
    ['stadiums', 'Sports venue'],
    ['foods', 'Restaurant'],
    ['cultural', 'Culture'],
    ['sport', 'Sport'],
    ['natural', 'Nature'],
    ['interesting_places', 'Sight'],
];

/** Most specific human-meaningful category from an OpenTripMap kinds string. */
export const getPoiCategory = (kinds?: string | null): string | null => {
    if (!kinds) {
        return null;
    }
    const tokens = new Set(kinds.split(',').map((k) => k.trim()).filter(Boolean));
    for (const [token, label] of POI_CATEGORY_PRIORITY) {
        if (tokens.has(token)) {
            return label;
        }
    }
    // Fall back to the first meaningful token, title-cased.
    const first = [...tokens].find((k) => k !== 'tourist_facilities' && k !== 'other');
    return first ? first.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : null;
};

export const getActivityPois = (trip?: TripExplorationResponse | null): ActivityPlace[] => (
    (trip?.activityCandidates ?? []).filter((poi): poi is ActivityPlace => Boolean(poi?.name))
);

export const getRestaurantPois = (trip?: TripExplorationResponse | null): ActivityPlace[] => (
    (trip?.restaurantCandidates ?? []).filter((poi): poi is ActivityPlace => Boolean(poi?.name))
);

// ─────────────────────────────────────────────────────────────────────────────
// Map points — geo-locate the ride spot, stays, activities and restaurants
// ─────────────────────────────────────────────────────────────────────────────

export type MapPointKind = 'spot' | 'stay' | 'activity' | 'restaurant';

export interface TripMapPoint {
    lat: number;
    lon: number;
    label: string;
    detail: string | null;
    kind: MapPointKind;
}

const asCoord = (value: number | null | undefined): number | undefined => (
    typeof value === 'number' && Number.isFinite(value) ? value : undefined
);

// 0,0 (Gulf of Guinea) is the backend's "no coordinate" sentinel for these
// POIs — never a real Slumber location, so treat it as missing.
const toMapPoint = (
    lat: number | null | undefined,
    lon: number | null | undefined,
    label: string | null | undefined,
    detail: string | null,
    kind: MapPointKind,
): TripMapPoint | null => {
    const latN = asCoord(lat);
    const lonN = asCoord(lon);
    if (latN == null || lonN == null || (latN === 0 && lonN === 0) || !label) {
        return null;
    }
    return { lat: latN, lon: lonN, label, detail, kind };
};

export const getMapPoints = (
    trip: TripExplorationResponse | null | undefined,
    extraStays: Array<{ name?: string | null; latitude?: number | null; longitude?: number | null; pricePerNight?: number | null; priceCurrency?: string | null }> = [],
): TripMapPoint[] => {
    const points: Array<TripMapPoint | null> = [];

    const spot = trip?.primaryActivity;
    if (spot) {
        points.push(toMapPoint(spot.latitude, spot.longitude, spot.name, 'Your ride spot', 'spot'));
    }

    for (const gem of trip?.hiddenGemHotels ?? []) {
        const price = getGemPrice(gem);
        points.push(toMapPoint(
            gem.hotel?.latitude,
            gem.hotel?.longitude,
            gem.hotel?.name,
            price != null ? formatCurrency(price, getGemCurrency(gem)) + '/night' : 'Rate pending',
            'stay',
        ));
    }

    for (const stay of extraStays) {
        const price = asCoord(stay.pricePerNight);
        points.push(toMapPoint(
            stay.latitude,
            stay.longitude,
            stay.name,
            price != null && price > 0 ? formatCurrency(price, stay.priceCurrency ?? 'EUR') + '/night' : 'Rate pending',
            'stay',
        ));
    }

    for (const poi of trip?.activityCandidates ?? []) {
        points.push(toMapPoint(poi.latitude, poi.longitude, poi.name, getPoiCategory(poi.kinds), 'activity'));
    }

    for (const poi of trip?.restaurantCandidates ?? []) {
        points.push(toMapPoint(poi.latitude, poi.longitude, poi.name, getPoiCategory(poi.kinds), 'restaurant'));
    }

    return points.filter((point): point is TripMapPoint => point != null);
};

// ─────────────────────────────────────────────────────────────────────────────
// Door-to-trip cost estimate — Flight + Sleep + Food + Transport
// Ported from the legacy TripGuide package so the unified explore view carries
// the same honest total. Every component is labelled; unknown parts are omitted
// rather than faked, and `partial` flags when a driver was missing.
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_TRIP_NIGHTS = 3;
const ESTIMATED_MEAL_EUR = 18;
const MEALS_PER_DAY = 2;
const ESTIMATED_LOCAL_TRANSPORT_PER_DAY_EUR = 15;

export interface TripCostEstimate {
    flight?: number;
    sleep?: number;
    food: number;
    transport: number;
    /** Home → departure-airport driving cost (fuel + tolls + parking), car mode only. */
    drive?: number;
    total: number;
    currency: string;
    nights: number;
    /** True when flight and/or sleep could not be priced, so the total is a floor. */
    partial: boolean;
}

export const getTripCostEstimate = (
    trip: TripExplorationResponse | null | undefined,
    nights: number = DEFAULT_TRIP_NIGHTS,
    driveEur?: number,
    /** Prices this flight instead of the backend's best — keeps the total in
     *  sync with the user's pick in the flights tab. */
    flightOverride?: UnifiedFlightOption | null,
): TripCostEstimate => {
    const safeNights = Number.isFinite(nights) && nights > 0 ? Math.round(nights) : DEFAULT_TRIP_NIGHTS;
    const pricing = getFlightPricing(flightOverride ?? trip?.bestUnifiedFlight);
    const flight = pricing.honestTotal ?? pricing.baseFare;

    // Backend pre-sorts hiddenGemHotels by composite score; lead stay drives the estimate.
    const nightly = getGemPrice((trip?.hiddenGemHotels ?? [])[0]);
    const sleep = nightly != null ? nightly * safeNights : undefined;

    const food = ESTIMATED_MEAL_EUR * MEALS_PER_DAY * safeNights;
    const transport = ESTIMATED_LOCAL_TRANSPORT_PER_DAY_EUR * safeNights;
    const drive = typeof driveEur === 'number' && Number.isFinite(driveEur) && driveEur > 0 ? driveEur : undefined;

    // Strict-round the compiled sum so IEEE-754 leaks never reach the headline.
    const total = Number(((flight ?? 0) + (sleep ?? 0) + food + transport + (drive ?? 0)).toFixed(2));

    return {
        flight,
        sleep,
        food,
        transport,
        drive,
        total,
        currency: pricing.currency,
        nights: safeNights,
        partial: flight == null || sleep == null,
    };
};

/** First-mile drive estimate for whichever airport this flight departs from —
 *  shared by the overview package card and the verdict so both quote the same
 *  fuel/toll/parking money. Null when not driving or the route is unknown. */
export const getFirstMileDrive = (
    trip: TripExplorationResponse | null | undefined,
    flight: UnifiedFlightOption | null | undefined,
    nights?: number,
    driveMode?: boolean,
): DriveEstimate | null => {
    const originCity = originCityForAirport(trip?.originAirport);
    if (!driveMode || !originCity || !flight?.departureAirport) {
        return null;
    }

    return estimateDrive({
        originCity,
        departureAirport: flight.departureAirport,
        nights: nights ?? DEFAULT_TRIP_NIGHTS,
        // Home airport as the assumed return — a fly-drive (park at DUB, home
        // is SNN) trips the open-jaw split-airport guard.
        returnAirport: trip?.originAirport ?? undefined,
    });
};

// ─────────────────────────────────────────────────────────────────────────────
// The verdict — the one answer the shopper came for, with receipts.
// Headline: the honest door-to-trip total. Savings: concrete euro amounts the
// engine found vs the obvious route (fly-drive, booking channel, self-transfer).
// Catches: the traps hiding behind the teaser fare. Every number is derived
// from payload data already on screen elsewhere — this just leads with it.
// ─────────────────────────────────────────────────────────────────────────────

/** Spreads under this are noise (fare volatility), not a finding. */
export const MIN_VERDICT_SAVING_EUR = 5;

export type VerdictTargetTab = 'flights' | 'selfConnect' | 'stays';

export interface VerdictSaving {
    kind: 'flyDrive' | 'sameFlightQuote' | 'selfTransfer' | 'sameRoomQuote';
    /** Whole euros saved vs the obvious option. */
    amount: number;
    currency: string;
    title: string;
    detail: string | null;
    /** Tab holding the receipts for this saving. */
    targetTab: VerdictTargetTab;
}

export interface VerdictCatch {
    kind: 'hiddenCosts' | 'flightCatch' | 'lateArrival';
    text: string;
}

export interface TripVerdict {
    cost: TripCostEstimate;
    /** Sorted by amount, biggest first. */
    savings: VerdictSaving[];
    catches: VerdictCatch[];
}

const rowComparablePrice = (row: FlightRowView): number | undefined => row.honestTotal ?? row.baseFare;

const cheapestRow = (rows: FlightRowView[]): FlightRowView | undefined => (
    rows.reduce<FlightRowView | undefined>((best, row) => (
        best == null || (rowComparablePrice(row) ?? Infinity) < (rowComparablePrice(best) ?? Infinity) ? row : best
    ), undefined)
);

/** Cheapest fly-drive departure vs cheapest home-airport departure. */
const getFlyDriveSaving = (rows: FlightRowView[]): VerdictSaving | null => {
    const priced = rows.filter((row) => rowComparablePrice(row) != null);
    const homeBest = cheapestRow(priced.filter((row) => !row.flyDrive));
    const driveBest = cheapestRow(priced.filter((row) => row.flyDrive));
    if (!homeBest || !driveBest) {
        return null;
    }

    const saving = rowComparablePrice(homeBest)! - rowComparablePrice(driveBest)!;
    if (saving < MIN_VERDICT_SAVING_EUR) {
        return null;
    }

    const hub = driveBest.option.departureAirport ?? 'another airport';
    const home = homeBest.option.departureAirport ?? 'your local airport';
    const driveLabel = formatMinutes(driveBest.option.originDriveMinutes);
    return {
        kind: 'flyDrive',
        amount: Math.round(saving),
        currency: driveBest.currency,
        title: `Fly-drive via ${hub} — save ${formatCurrency(Math.round(saving), driveBest.currency)}`,
        detail: `Cheapest from ${home} is ${formatCurrency(rowComparablePrice(homeBest), homeBest.currency)}; departing ${hub} costs ${formatCurrency(rowComparablePrice(driveBest), driveBest.currency)}${driveLabel ? ` (~${driveLabel} drive each way)` : ''}.`,
        targetTab: 'flights',
    };
};

/** Widest price spread across quotes for the identical physical flight. */
const getSameFlightQuoteSaving = (trip?: TripExplorationResponse | null): VerdictSaving | null => {
    let best: VerdictSaving | null = null;

    for (const comparison of trip?.sameFlightComparisons ?? []) {
        const quotes = (comparison?.quotes ?? [])
            .map((quote) => ({
                price: asPositiveAmount(quote?.ticketPrice),
                label: humanizeProviderLabel(quote?.sourceLabel ?? quote?.source ?? null),
            }))
            .filter((quote): quote is { price: number; label: string | null } => quote.price != null);
        if (quotes.length < 2) {
            continue;
        }

        const cheapest = quotes.reduce((a, b) => (b.price < a.price ? b : a));
        const priciest = quotes.reduce((a, b) => (b.price > a.price ? b : a));
        const spread = priciest.price - cheapest.price;
        if (spread < MIN_VERDICT_SAVING_EUR || (best != null && Math.round(spread) <= best.amount)) {
            continue;
        }

        // Deliberately no flight number here — the receipts live in the tab.
        best = {
            kind: 'sameFlightQuote',
            amount: Math.round(spread),
            currency: 'EUR',
            title: `Same flight, ${formatCurrency(Math.round(spread))} cheaper${cheapest.label ? ` via ${cheapest.label}` : ''}`,
            detail: `The identical seat is quoted from ${formatCurrency(cheapest.price)} to ${formatCurrency(priciest.price)} across channels — where you book matters.`,
            targetTab: 'flights',
        };
    }

    return best;
};

/** Best DIY 2-leg routing found by /api/trips/self-connect, when loaded. */
const getSelfTransferSaving = (selfConnect?: SelfConnectResult | null): VerdictSaving | null => {
    const options = (selfConnect?.options ?? [])
        .filter((option) => asPositiveAmount(option?.savingsVsDirectEur) != null);
    if (options.length === 0) {
        return null;
    }

    const best = options.reduce((a, b) => ((b.savingsVsDirectEur ?? 0) > (a.savingsVsDirectEur ?? 0) ? b : a));
    const saving = best.savingsVsDirectEur ?? 0;
    if (saving < MIN_VERDICT_SAVING_EUR) {
        return null;
    }

    const route = [best.leg1?.departureAirport, best.hub, best.leg2?.arrivalAirport]
        .filter(Boolean)
        .join(' → ');
    const total = asPositiveAmount(best.totalEur);
    const direct = asPositiveAmount(selfConnect?.directPriceEur);
    return {
        kind: 'selfTransfer',
        amount: Math.round(saving),
        currency: 'EUR',
        title: `Self-transfer via ${best.hubName ?? best.hub ?? 'a hub'} — save ${formatCurrency(Math.round(saving))}`,
        detail: `${route || 'Two separate tickets'}${total != null ? ` totals ${formatCurrency(total)}` : ''}${direct != null ? ` vs ${formatCurrency(direct)} direct` : ''}. Separate tickets — a missed connection is not protected.`,
        targetTab: 'selfConnect',
    };
};

export interface StayQuoteSpread {
    cheapest: HotelRateQuote;
    priciest: HotelRateQuote;
    perNight: number;
    quoteCount: number;
}

/** Cheapest vs priciest per-OTA quote for the same room — null without a real spread. */
export const getStayQuoteSpread = (hotel?: HotelResult | null): StayQuoteSpread | null => {
    const quotes = (hotel?.rateQuotes ?? [])
        .filter((quote): quote is HotelRateQuote => asPositiveAmount(quote?.ratePerNight) != null);
    if (quotes.length < 2) {
        return null;
    }

    const cheapest = quotes.reduce((a, b) => ((b.ratePerNight ?? Infinity) < (a.ratePerNight ?? Infinity) ? b : a));
    const priciest = quotes.reduce((a, b) => ((b.ratePerNight ?? 0) > (a.ratePerNight ?? 0) ? b : a));
    const perNight = (priciest.ratePerNight ?? 0) - (cheapest.ratePerNight ?? 0);
    return perNight >= 1 ? { cheapest, priciest, perNight, quoteCount: quotes.length } : null;
};

/** "Same room across channels: €195/night on Agoda.com vs €236 on Trip.com" — stays tab. */
export const getStayQuoteSummary = (hotel?: HotelResult | null): string | null => {
    const spread = getStayQuoteSpread(hotel);
    if (!spread) {
        return null;
    }
    const currency = hotel?.priceCurrency ?? 'EUR';
    return `Same room across ${spread.quoteCount} channels: ${formatCurrency(spread.cheapest.ratePerNight, currency)}/night`
        + `${spread.cheapest.name ? ` on ${spread.cheapest.name}` : ''} vs ${formatCurrency(spread.priciest.ratePerNight, currency)}`
        + `${spread.priciest.name ? ` on ${spread.priciest.name}` : ''} — TripAdvisor rates.`;
};

/** Booking-channel spread on the best stay that has per-OTA quotes, scaled to
 *  the trip length. Gems are score-sorted, so the first spread found belongs to
 *  the strongest recommendation with channel data — the lead gem itself may be
 *  an unpriced apartment with no TripAdvisor listing. */
const getSameRoomQuoteSaving = (
    trip: TripExplorationResponse | null | undefined,
    nights: number,
    extraStays: HotelResult[],
): VerdictSaving | null => {
    const candidates: Array<HotelResult | null | undefined> = [
        ...(trip?.hiddenGemHotels ?? []).map((gem) => gem?.hotel),
        ...extraStays,
    ];
    const hotel = candidates.find((candidate) => getStayQuoteSpread(candidate) != null) ?? null;
    const spread = getStayQuoteSpread(hotel);
    if (!hotel || !spread) {
        return null;
    }

    const total = spread.perNight * nights;
    if (total < MIN_VERDICT_SAVING_EUR) {
        return null;
    }

    const currency = hotel.priceCurrency ?? 'EUR';
    return {
        kind: 'sameRoomQuote',
        amount: Math.round(total),
        currency,
        title: `Same room, ${formatCurrency(Math.round(total), currency)} cheaper${spread.cheapest.name ? ` via ${spread.cheapest.name}` : ''}`,
        detail: `${hotel.name ?? 'The lead stay'} is ${formatCurrency(spread.cheapest.ratePerNight, currency)}/night`
            + `${spread.cheapest.name ? ` on ${spread.cheapest.name}` : ''} vs ${formatCurrency(spread.priciest.ratePerNight, currency)}`
            + `${spread.priciest.name ? ` on ${spread.priciest.name}` : ''} — over ${nights} nights (TripAdvisor rates).`,
        targetTab: 'stays',
    };
};

const getVerdictCatches = (flight?: UnifiedFlightOption | null): VerdictCatch[] => {
    if (!flight) {
        return [];
    }

    const catches: VerdictCatch[] = [];
    const pricing = getFlightPricing(flight);
    if (pricing.baseFare != null && pricing.honestTotal != null && pricing.honestTotal - pricing.baseFare >= 1) {
        catches.push({
            kind: 'hiddenCosts',
            text: `The advertised ${formatCurrency(pricing.baseFare, pricing.currency)} fare really costs ${formatCurrency(pricing.honestTotal, pricing.currency)} once airport extras are audited.`,
        });
    }

    const catchMessage = getFlightCatchMessage(flight);
    if (catchMessage) {
        catches.push({ kind: 'flightCatch', text: catchMessage });
    } else if (isLateNightArrival(flight.scheduledArrival)) {
        // Only when the backend didn't already word a catch — no double warning.
        catches.push({ kind: 'lateArrival', text: 'Late-night arrival — check the last transfer into town before booking.' });
    }

    return catches;
};

export const getTripVerdict = (
    trip: TripExplorationResponse | null | undefined,
    options: {
        selectedFlight?: UnifiedFlightOption | null;
        nights?: number;
        driveEur?: number;
        selfConnect?: SelfConnectResult | null;
        /** Direct /api/hotels/nearby fallback stays — lead-stay source when the
         *  backend returned no hidden gems for this destination. */
        extraStays?: HotelResult[];
    } = {},
): TripVerdict => {
    const flight = options.selectedFlight ?? trip?.bestUnifiedFlight ?? null;
    const cost = getTripCostEstimate(trip, options.nights, options.driveEur, flight);
    const savings = [
        getFlyDriveSaving(getFlightRows(trip)),
        getSameFlightQuoteSaving(trip),
        getSelfTransferSaving(options.selfConnect),
        getSameRoomQuoteSaving(trip, cost.nights, options.extraStays ?? []),
    ]
        .filter((saving): saving is VerdictSaving => saving != null)
        .sort((a, b) => b.amount - a.amount);

    return {
        cost,
        savings,
        catches: getVerdictCatches(flight),
    };
};
