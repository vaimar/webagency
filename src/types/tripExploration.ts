import { AntiCauchemarAnalysis } from '../services/api';

// ─────────────────────────────────────────────────────────────────────────────
// Wire contract for POST /api/trips/explore.
//
// Every interface mirrors its Spring Boot DTO field-for-field (Jackson default
// camelCase — the backend declares no naming-strategy overrides). Source of
// truth, in the slumber repo:
//   TripExplorationService.TripExplorationResponse / UnifiedFlightOption /
//   SameFlightComparison / SameFlightComparisonSummary / AccommodationTradeoff
//   FlightSearchService.FlightComparisonResult / FlightResult
//   HotelSearchService.HotelResult / ActivityPlace
//   service.HiddenGemHotel, service.ExploreWarning
//   request.TripExploreRequest / FirstMileAccessRequest
//
// Java `double`/`boolean` primitives always serialize (0 / false when unset);
// wrapper types (Double, Integer, String, objects) may be null or absent, so
// everything is typed optional + nullable and consumers must guard.
// ─────────────────────────────────────────────────────────────────────────────

export type { AntiCauchemarAnalysis };

export interface TripExplorationResponse {
    originAirport?: string | null;
    destination?: string | null;
    travelDate?: string | null;
    resolvedArrivalAirport?: string | null;
    resolutionReason?: string | null;
    routeAvailable?: boolean | null;
    flightComparison?: FlightComparisonResult | null;
    unifiedFlights?: UnifiedFlightOption[] | null;
    bestUnifiedFlight?: UnifiedFlightOption | null;
    sameFlightComparisons?: SameFlightComparison[] | null;
    bestSameFlightComparison?: SameFlightComparison | null;
    routeSelectionSummary?: string | null;
    activityCandidates?: ActivityPlace[] | null;
    /** Nearby dining POIs (OpenTripMap foods) in the destination city. */
    restaurantCandidates?: ActivityPlace[] | null;
    primaryActivity?: ActivityPlace | null;
    accommodationTradeoffs?: AccommodationTradeoff[] | null;
    hiddenGemHotels?: HiddenGemHotel[] | null;
    orchestrationWarnings?: ExploreWarning[] | null;
    /** Backend emits "OK", "DEGRADED", or "CITY_COORDINATES_UNAVAILABLE". */
    orchestrationStatus?: string | null;
}

export interface ExploreWarning {
    source?: string | null;
    kind?: string | null;
    message?: string | null;
    /** True when this subsystem fell back to cached/heuristic data. */
    fallbackUsed?: boolean | null;
}

export interface UnifiedFlightOption {
    source?: string | null;
    sourceLabel?: string | null;
    flightNumber?: string | null;
    airline?: string | null;
    departureAirport?: string | null;
    arrivalAirport?: string | null;
    scheduledDeparture?: string | null;
    scheduledArrival?: string | null;
    /** Primitive double on the backend — 0 means "unknown", never a real fare. */
    ticketPrice?: number | null;
    realWorldEntryPrice?: number | null;
    doorToTripPrice?: number | null;
    priceLabel?: string | null;
    priceDisclaimer?: string | null;
    freshnessLabel?: string | null;
    provenanceLabel?: string | null;
    antiCauchemar?: AntiCauchemarAnalysis | null;
    selectionReason?: string | null;
    sourcePriority?: number | null;
    sameFlightQuoteStatus?: string | null;
    // Fly-drive expansion (origin-alternatives.json): this option departs from
    // a hub the traveller drives to, not from their nearest airport.
    alternativeOrigin?: boolean | null;
    originDriveMinutes?: number | null;
    originAccessNote?: string | null;
    // Connection detail: 0/absent = direct; otherwise the layover airports + waits.
    stops?: number | null;
    totalDurationMinutes?: number | null;
    layovers?: FlightLayover[] | null;
}

/** A stop on a non-direct itinerary. */
export interface FlightLayover {
    airport?: string | null;
    name?: string | null;
    durationMinutes?: number | null;
    overnight?: boolean | null;
}

export interface FlightResult {
    stops?: number | null;
    totalDurationMinutes?: number | null;
    layovers?: FlightLayover[] | null;
    flightNumber?: string | null;
    airline?: string | null;
    provider?: string | null;
    departureAirport?: string | null;
    arrivalAirport?: string | null;
    scheduledDeparture?: string | null;
    scheduledArrival?: string | null;
    flightStatus?: string | null;
    estimatedTicketPrice?: number | null;
    antiCauchemar?: AntiCauchemarAnalysis | null;
    realWorldEntryPrice?: number | null;
    doorToTripPrice?: number | null;
}

export interface FlightComparisonResult {
    originAirport?: string | null;
    arrivalAirport?: string | null;
    travelDate?: string | null;
    byProvider?: Record<string, FlightResult[]> | null;
    mergedFlights?: FlightResult[] | null;
    routeAvailable?: boolean | null;
    bestFlight?: FlightResult | null;
}

export interface SameFlightComparisonSummary {
    hasCachedFallback?: boolean | null;
    winnerSource?: string | null;
    winnerIsCached?: boolean | null;
    savingsVsCachedEur?: number | null;
}

export interface SameFlightComparison {
    comparisonKey?: string | null;
    flightNumber?: string | null;
    airline?: string | null;
    departureAirport?: string | null;
    arrivalAirport?: string | null;
    scheduledDeparture?: string | null;
    scheduledArrival?: string | null;
    quoteCount?: number | null;
    quotes?: UnifiedFlightOption[] | null;
    winnerQuote?: UnifiedFlightOption | null;
    bestCachedQuote?: UnifiedFlightOption | null;
    winnerVsCachedGapEur?: number | null;
    summary?: SameFlightComparisonSummary | null;
    comparisonSummary?: string | null;
}

/** One OTA's nightly quote for the same room (XoteloRateService.XoteloRateQuote). */
export interface HotelRateQuote {
    code?: string | null;
    name?: string | null;
    ratePerNight?: number | null;
}

export interface HotelResult {
    xid?: string | null;
    name?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    kinds?: string | null;
    provider?: string | null;
    enrichmentStatus?: string | null;
    enrichmentMessage?: string | null;
    rating?: number | null;
    reviewsCount?: number | null;
    /** Nullable Double on the backend — null when enrichment found no rate. */
    pricePerNight?: number | null;
    priceCurrency?: string | null;
    bookingLink?: string | null;
    thumbnailUrl?: string | null;
    reviewSummary?: string | null;
    /** Per-OTA quotes (TripAdvisor via Xotelo), cheapest first — null when never looked up. */
    rateQuotes?: HotelRateQuote[] | null;
    /** Curated TripAdvisor key (g{geo}-d{hotel}) resolved for this hotel, or null. */
    tripadvisorKey?: string | null;
}

/** Hotel details are nested under `hotel`; the composite-score fields live on
 *  the wrapper object itself. */
export interface HiddenGemHotel {
    hotel?: HotelResult | null;
    compositeScore?: number | null;
    selectionReason?: string | null;
    /** Primitive double, already rounded to one decimal by HiddenGemScorerService. */
    distanceToActivityKm?: number | null;
    estimatedNightlyValueScore?: number | null;
    serviceQualityScore?: number | null;
}

export interface ActivityPlace {
    xid?: string | null;
    name?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    kinds?: string | null;
    provider?: string | null;
    distanceKm?: number | null;
    matchScore?: number | null;
    selectionReason?: string | null;
    thumbnailUrl?: string | null;
}

export interface AccommodationTradeoff {
    hotel?: HotelResult | null;
    distanceToActivityKm?: number | null;
    averageRoundTripTransferCostEur?: number | null;
    averageRoundTripTransferMinutes?: number | null;
    baselineFlightRealWorldEntryPriceEur?: number | null;
    baselineFlightDoorToTripPriceEur?: number | null;
    flightReferenceSummary?: string | null;
    estimatedFlightPlusLocalTransferEur?: number | null;
    tradeoffScore?: number | null;
    recommendationReason?: string | null;
    selectionRole?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Request contract — request.TripExploreRequest / FirstMileAccessRequest.
// Keys not listed here are silently dropped by Jackson on the backend.
// ─────────────────────────────────────────────────────────────────────────────

export type FirstMileRequestMode = 'walking' | 'public_transport' | 'taxi' | 'rental_car' | 'other';

export interface FirstMileAccessRequestPayload {
    amount?: number | null;
    durationMinutes?: number;
    mode?: FirstMileRequestMode;
    currency?: string;
    status?: 'USER_PROVIDED' | 'ESTIMATED' | 'UNAVAILABLE';
    source?: string;
    note?: string;
}

export interface TripExploreRequestPayload {
    origin: string;
    destination: string;
    arrivalAirport?: string;
    travelDate: string;
    activity?: string;
    providers?: string[];
    firstMileAccess?: FirstMileAccessRequestPayload;
    activityRadiusMeters?: number;
    hotelRadiusMeters?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cross-tab persistence — the last exploration result is kept in the app-wide
// CacheProvider so route changes (which unmount the explore tab) don't lose it
// and any other tab can read the full nested payload under this key.
// ─────────────────────────────────────────────────────────────────────────────

export const TRIP_EXPLORE_CACHE_KEY = 'trip-explore:last-result';

export interface StoredTripExploration {
    request: TripExploreRequestPayload;
    response: TripExplorationResponse;
    storedAt: string;
}

// Back-compat aliases for earlier component-local type names.
export type TripExplorePayload = TripExplorationResponse;
export type UnifiedFlight = UnifiedFlightOption;
export type HotelDetails = HotelResult;
