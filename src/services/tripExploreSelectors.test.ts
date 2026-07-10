import {
    applyFlightViewMode,
    DEFAULT_STAYS_FILTERS,
    filterAndSortStays,
    getActivityPois,
    getFlightCatchMessage,
    buildConnectionSummary,
    getFlightRows,
    getFlightViewSelection,
    getGemDistanceKm,
    getMapPoints,
    getPoiCategory,
    getProviderBadges,
    getRestaurantPois,
    getSameFlightQuotes,
    getStayQuoteSummary,
    getStaysPriceCeiling,
    getTripCostEstimate,
    getTripVerdict,
    getWarningText,
    isAntiCauchemarApproved,
    isLateNightArrival,
    shouldPromotePendingStayAvailability,
} from './tripExploreSelectors';
import { HiddenGemHotel, TripExplorationResponse } from '../types/tripExploration';

describe('isLateNightArrival', () => {
    it('flags the 22:00–06:00 window used by the transfer estimator', () => {
        expect(isLateNightArrival('2026-07-10T23:10:00')).toBe(true);
        expect(isLateNightArrival('2026-07-10T05:30:00')).toBe(true);
        expect(isLateNightArrival('2026-07-10T14:00:00')).toBe(false);
        expect(isLateNightArrival(null)).toBe(false);
        expect(isLateNightArrival('not-a-date')).toBe(false);
    });
});

describe('isAntiCauchemarApproved', () => {
    it('rejects flights with a catch, manual check, hidden penalty, or late arrival', () => {
        expect(isAntiCauchemarApproved({ antiCauchemar: { theCatch: 'BVA trap' }, scheduledArrival: '2026-07-10T14:00:00' })).toBe(false);
        expect(isAntiCauchemarApproved({ antiCauchemar: { manualCheckRequired: true }, scheduledArrival: '2026-07-10T14:00:00' })).toBe(false);
        expect(isAntiCauchemarApproved({ antiCauchemar: { hiddenCostPenalty: 35 }, scheduledArrival: '2026-07-10T14:00:00' })).toBe(false);
        expect(isAntiCauchemarApproved({ antiCauchemar: {}, scheduledArrival: '2026-07-10T23:40:00' })).toBe(false);
    });

    it('approves clean daytime flights', () => {
        expect(isAntiCauchemarApproved({ antiCauchemar: {}, scheduledArrival: '2026-07-10T15:00:00' })).toBe(true);
    });
});

describe('getFlightRows', () => {
    it('prefers unifiedFlights and maps the honest price hierarchy', () => {
        const trip: TripExplorationResponse = {
            unifiedFlights: [
                {
                    airline: 'Ryanair',
                    flightNumber: 'FR 342',
                    sourceLabel: 'SerpApi live',
                    ticketPrice: 39.99,
                    antiCauchemar: { ticketPrice: 39.99, auditedTotalCost: 112.4, currency: 'EUR' },
                },
            ],
            flightComparison: { mergedFlights: [{ flightNumber: 'IGNORED' }] },
        };

        const rows = getFlightRows(trip);
        expect(rows).toHaveLength(1);
        expect(rows[0].flightNumber).toBe('FR 342');
        expect(rows[0].providerLabel).toBe('SerpApi live');
        expect(rows[0].baseFare).toBeCloseTo(39.99);
        expect(rows[0].honestTotal).toBeCloseTo(112.4);
    });

    it('falls back to flightComparison.mergedFlights when unifiedFlights is empty', () => {
        const trip: TripExplorationResponse = {
            unifiedFlights: [],
            flightComparison: {
                mergedFlights: [
                    {
                        flightNumber: 'FR 998',
                        provider: 'ryanair_cache',
                        estimatedTicketPrice: 54,
                        realWorldEntryPrice: 89.5,
                        scheduledArrival: '2026-07-10T15:00:00',
                    },
                ],
            },
        };

        const rows = getFlightRows(trip);
        expect(rows).toHaveLength(1);
        expect(rows[0].providerLabel).toBe('Ryanair · cached fare');
        expect(rows[0].baseFare).toBe(54);
        expect(rows[0].honestTotal).toBeCloseTo(89.5);
        expect(rows[0].approved).toBe(true);
    });
});

describe('getSameFlightQuotes', () => {
    const trip: TripExplorationResponse = {
        unifiedFlights: [
            { flightNumber: 'FR 342', scheduledDeparture: '2026-07-10T18:20:00', ticketPrice: 40 },
            { flightNumber: 'FR 998', scheduledDeparture: '2026-07-10T07:10:00', ticketPrice: 29 },
        ],
        sameFlightComparisons: [
            {
                flightNumber: 'FR 342',
                scheduledDeparture: '2026-07-10T18:20:00',
                quotes: [
                    { sourceLabel: 'SerpApi live', ticketPrice: 40 },
                    { sourceLabel: 'Ryanair cache', ticketPrice: 45 },
                ],
            },
            {
                flightNumber: 'FR 998',
                scheduledDeparture: '2026-07-10T07:10:00',
                quotes: [{ sourceLabel: 'SerpApi live', ticketPrice: 29 }],
            },
        ],
    };

    it('returns the quotes for the matching flight number and departure', () => {
        const rows = getFlightRows(trip);
        const quotes = getSameFlightQuotes(trip, rows[0]);
        expect(quotes).toHaveLength(2);
        expect(quotes[1].sourceLabel).toBe('Ryanair cache');
    });

    it('returns nothing for single-quote comparisons or unmatched rows', () => {
        const rows = getFlightRows(trip);
        expect(getSameFlightQuotes(trip, rows[1])).toHaveLength(0);
        expect(getSameFlightQuotes({}, rows[0])).toHaveLength(0);
    });
});

describe('applyFlightViewMode', () => {
    const rows = getFlightRows({
        unifiedFlights: [
            { flightNumber: 'A', ticketPrice: 80, antiCauchemar: { ticketPrice: 80, auditedTotalCost: 150, currency: 'EUR' }, scheduledArrival: '2026-07-10T14:00:00' },
            { flightNumber: 'B', ticketPrice: 30, antiCauchemar: { ticketPrice: 30, auditedTotalCost: 95, currency: 'EUR' }, scheduledArrival: '2026-07-10T23:30:00' },
            { flightNumber: 'C', ticketPrice: 0, scheduledArrival: '2026-07-10T12:00:00' },
        ],
    });

    it('sorts by honest total (unknown prices last) in cheapest mode', () => {
        const sorted = applyFlightViewMode(rows, 'cheapest');
        expect(sorted.map((row) => row.flightNumber)).toEqual(['B', 'A', 'C']);
    });

    it('keeps only approved flights in approved mode', () => {
        const approved = applyFlightViewMode(rows, 'approved');
        expect(approved.map((row) => row.flightNumber)).toEqual(['A', 'C']);
    });

    it('falls back to the top 3 least-friction routes when nothing is fully approved', () => {
        const rejectedRows = getFlightRows({
            unifiedFlights: [
                {
                    flightNumber: 'BVA-1',
                    ticketPrice: 35,
                    scheduledArrival: '2026-07-10T23:30:00',
                    antiCauchemar: { ticketPrice: 35, hiddenCostPenalty: 80, timePenaltyMinutes: 100, theCatch: 'BVA trap' },
                },
                {
                    flightNumber: 'STN-2',
                    ticketPrice: 45,
                    scheduledArrival: '2026-07-10T22:30:00',
                    antiCauchemar: { ticketPrice: 45, manualCheckRequired: true, timePenaltyMinutes: 60 },
                },
                {
                    flightNumber: 'MRS-3',
                    ticketPrice: 50,
                    scheduledArrival: '2026-07-10T20:00:00',
                    antiCauchemar: { ticketPrice: 50, hiddenCostPenalty: 20, timePenaltyMinutes: 20 },
                },
                {
                    flightNumber: 'CIA-4',
                    ticketPrice: 40,
                    scheduledArrival: '2026-07-10T21:30:00',
                    antiCauchemar: { ticketPrice: 40, hiddenCostPenalty: 10, timePenaltyMinutes: 15, theCatch: 'Late transfer' },
                },
            ],
        });

        const selection = getFlightViewSelection(rejectedRows, 'approved');
        expect(selection.fallbackUsed).toBe(true);
        expect(selection.warningMessage).toContain('No perfect flights found');
        expect(selection.rows.map((row) => row.flightNumber)).toEqual(['MRS-3', 'CIA-4', 'STN-2']);
    });

    it('returns the original order in all mode', () => {
        expect(applyFlightViewMode(rows, 'all').map((row) => row.flightNumber)).toEqual(['A', 'B', 'C']);
    });
});

describe('backend primitive sanitization', () => {
    it('maps provider badges to shopper-friendly labels and hides raw external-search constants', () => {
        const badges = getProviderBadges({
            flightComparison: {
                byProvider: {
                    EXTERNAL_PROVIDER: [{ flightNumber: 'A' }],
                    EXTERNAL_SEARCH: [{ flightNumber: 'B' }],
                    RYANAIR_CACHE: [{ flightNumber: 'C' }, { flightNumber: 'D' }],
                },
            },
        });

        expect(badges).toEqual(['Partner Offer (1)', 'Ryanair · cached fare (2)']);
    });

    it('strips leaked MANUAL_CHECK_REQUIRED prefixes from user-facing prose', () => {
        expect(getFlightCatchMessage({
            antiCauchemar: {
                manualCheckReasons: ['MANUAL_CHECK_REQUIRED: Taxi fare could not be validated'],
            },
        })).toBe('Taxi fare could not be validated');

        expect(getWarningText({
            source: 'EXTERNAL_SEARCH',
            message: 'MANUAL_CHECK_REQUIRED: Cached fare used',
            fallbackUsed: true,
        })).toBe('Cached fare used (fallback data)');
    });
});

describe('fly-drive alternative rows', () => {
    const trip: TripExplorationResponse = {
        unifiedFlights: [
            {
                flightNumber: 'FR 1976',
                departureAirport: 'DUB',
                arrivalAirport: 'IBZ',
                ticketPrice: 80,
                scheduledArrival: '2026-07-10T15:00:00',
                alternativeOrigin: true,
                originDriveMinutes: 120,
                originAccessNote: '🚗 Drive ~2h to Dublin Airport (DUB) to unlock direct routes and lower fares instead of multi-stop departures from Shannon (SNN).',
                antiCauchemar: { ticketPrice: 80, totalTravelTimeMinutes: 255, currency: 'EUR' },
            },
            {
                flightNumber: 'EI 388',
                departureAirport: 'SNN',
                arrivalAirport: 'IBZ',
                ticketPrice: 555,
                scheduledArrival: '2026-07-11T23:00:00',
                antiCauchemar: { ticketPrice: 555, totalTravelTimeMinutes: 300, currency: 'EUR' },
            },
        ],
    };

    it('flags fly-drive rows and carries the backend access note', () => {
        const [flyDrive, local] = getFlightRows(trip);

        expect(flyDrive.flyDrive).toBe(true);
        expect(flyDrive.originAccessNote).toContain('Dublin Airport (DUB)');
        expect(local.flyDrive).toBe(false);
        expect(local.originAccessNote).toBeNull();
    });

    it('adds the drive overhead to the honest door-to-door time', () => {
        const [flyDrive, local] = getFlightRows(trip);

        // 255 min flight+transfer + 120 min drive = 375 min → 6h15.
        expect(flyDrive.transitSummary).toContain('Drive 2h00 to DUB');
        expect(flyDrive.transitSummary).toContain('Door-to-door 6h15 incl. drive');

        // Local departure stays untouched: 300 min → 5h00, no drive suffix.
        expect(local.transitSummary).toContain('Door-to-door 5h00');
        expect(local.transitSummary).not.toContain('incl. drive');
    });
});

describe('stays filtering and sorting', () => {
    const gems: HiddenGemHotel[] = [
        {
            hotel: { name: 'Lavande', pricePerNight: 84, rating: 4.6 },
            compositeScore: 0.82,
            distanceToActivityKm: 0.1,
        },
        {
            hotel: { name: 'Auberge', pricePerNight: 52, rating: 3.8 },
            compositeScore: 0.61,
            distanceToActivityKm: 2.4,
        },
        {
            // No rating, no price — excluded (and counted) when those filters activate.
            hotel: { name: 'Mystery' },
            compositeScore: 0.5,
            selectionReason: 'Nearby stay with a strong hidden-gem score (0.4 km away, composite score 0.50).',
        },
    ];

    it('filters by minimum rating and counts hidden stays', () => {
        const { visible, hiddenCount } = filterAndSortStays(gems, { ...DEFAULT_STAYS_FILTERS, minRating: 4 }, 'score');
        expect(visible.map((gem) => gem.hotel?.name)).toEqual(['Lavande']);
        expect(hiddenCount).toBe(2);
    });

    it('keeps unknown-price stays visible in the pending bucket when they pass distance filters', () => {
        const { visible, pendingRate, hiddenCount } = filterAndSortStays(gems, { ...DEFAULT_STAYS_FILTERS, maxDistanceKm: 1 }, 'score');
        expect(visible.map((gem) => gem.hotel?.name)).toEqual(['Lavande']);
        expect(pendingRate.map((gem) => gem.hotel?.name)).toEqual(['Mystery']);
        expect(hiddenCount).toBe(1);
    });

    it('keeps unknown-price stays in a separate pending bucket when a budget cap is active', () => {
        const { visible, pendingRate, hiddenCount } = filterAndSortStays(gems, { ...DEFAULT_STAYS_FILTERS, maxPricePerNight: 60 }, 'score');
        expect(visible.map((gem) => gem.hotel?.name)).toEqual(['Auberge']);
        expect(pendingRate.map((gem) => gem.hotel?.name)).toEqual(['Mystery']);
        expect(hiddenCount).toBe(1);
    });

    it('sorts priced stays by price/distance while unpriced stays live in the pending bucket', () => {
        const byPrice = filterAndSortStays(gems, DEFAULT_STAYS_FILTERS, 'price').visible;
        expect(byPrice.map((gem) => gem.hotel?.name)).toEqual(['Auberge', 'Lavande']);

        const pendingByPrice = filterAndSortStays(gems, DEFAULT_STAYS_FILTERS, 'price').pendingRate;
        expect(pendingByPrice.map((gem) => gem.hotel?.name)).toEqual(['Mystery']);

        const byDistance = filterAndSortStays(gems, DEFAULT_STAYS_FILTERS, 'distance').visible;
        expect(byDistance.map((gem) => gem.hotel?.name)).toEqual(['Lavande', 'Auberge']);

        const pendingByDistance = filterAndSortStays(gems, DEFAULT_STAYS_FILTERS, 'distance').pendingRate;
        expect(pendingByDistance.map((gem) => gem.hotel?.name)).toEqual(['Mystery']);
    });

    it('derives the budget ceiling from the data, rounded up to the next €10', () => {
        expect(getStaysPriceCeiling(gems)).toBe(90);
        expect(getStaysPriceCeiling([])).toBe(300);
    });

    it('keeps a structured 0.0 km distance and rescues distance from selectionReason', () => {
        expect(getGemDistanceKm({ distanceToActivityKm: 0 })).toBe(0);
        expect(getGemDistanceKm(gems[2])).toBeCloseTo(0.4);
        expect(getGemDistanceKm({})).toBeUndefined();
    });

    it('promotes strong unpriced stays to an availability CTA instead of a dead-end label', () => {
        expect(shouldPromotePendingStayAvailability(gems[2])).toBe(true);
        expect(shouldPromotePendingStayAvailability(gems[0])).toBe(false);
        expect(shouldPromotePendingStayAvailability({ hotel: { name: 'Empty' }, compositeScore: 0.4 })).toBe(false);
    });
});

describe('points of interest', () => {
    it('humanizes OpenTripMap kinds to a readable category', () => {
        // Most specific category wins, not the first token (dining leads with "foods").
        expect(getPoiCategory('foods,restaurants,tourist_facilities')).toBe('Restaurant');
        expect(getPoiCategory('foods,cafes,tourist_facilities')).toBe('Café');
        expect(getPoiCategory('foods,bars,tourist_facilities')).toBe('Bar');
        expect(getPoiCategory('natural,interesting_places,beaches')).toBe('Beach');
        expect(getPoiCategory('sport,stadiums')).toBe('Sports venue');
        expect(getPoiCategory(null)).toBeNull();
        // Unknown-but-present token falls back to a title-cased label, skipping generic wrappers.
        expect(getPoiCategory('tourist_facilities,marinas')).toBe('Marinas');
    });

    it('reads activity and restaurant candidates, dropping nameless entries', () => {
        const trip = {
            activityCandidates: [{ name: 'Cable Park', distanceKm: 0.3 }, { name: null }],
            restaurantCandidates: [{ name: 'Torremar', kinds: 'foods,bars', distanceKm: 0.1 }],
        } as any;
        expect(getActivityPois(trip).map((p) => p.name)).toEqual(['Cable Park']);
        expect(getRestaurantPois(trip)).toHaveLength(1);
        expect(getActivityPois(null)).toEqual([]);
        expect(getRestaurantPois({})).toEqual([]);
    });
});

describe('getTripCostEstimate', () => {
    const trip = {
        bestUnifiedFlight: {
            ticketPrice: 80,
            antiCauchemar: { ticketPrice: 80, auditedTotalCost: 150, currency: 'EUR' },
        },
        hiddenGemHotels: [{ hotel: { name: 'Lavande', pricePerNight: 90, priceCurrency: 'EUR' } }],
    } as any;

    it('sums flight + sleep + food + transport over the nights', () => {
        const cost = getTripCostEstimate(trip, 3);
        expect(cost.nights).toBe(3);
        expect(cost.flight).toBeCloseTo(150);      // honest total
        expect(cost.sleep).toBe(270);              // 90 * 3
        expect(cost.food).toBe(108);               // 18 * 2 * 3
        expect(cost.transport).toBe(45);           // 15 * 3
        expect(cost.total).toBe(573);
        expect(cost.partial).toBe(false);
    });

    it('flags partial and floors the total when flight/sleep are unknown', () => {
        const cost = getTripCostEstimate({ bestUnifiedFlight: { ticketPrice: 0 }, hiddenGemHotels: [] } as any, 2);
        expect(cost.flight).toBeUndefined();
        expect(cost.sleep).toBeUndefined();
        expect(cost.partial).toBe(true);
        expect(cost.total).toBe(18 * 2 * 2 + 15 * 2); // food + transport only
    });

    it('defaults to 3 nights on a bad nights value', () => {
        expect(getTripCostEstimate(trip, 0).nights).toBe(3);
        expect(getTripCostEstimate(trip, NaN).nights).toBe(3);
    });
});

describe('getMapPoints', () => {
    const trip = {
        primaryActivity: { name: 'Sporting Plage', latitude: 43.694, longitude: 7.261, kinds: 'beaches' },
        hiddenGemHotels: [
            { hotel: { name: 'Westminster', latitude: 43.695, longitude: 7.260, pricePerNight: 120, priceCurrency: 'EUR' } },
            { hotel: { name: 'No Coords', latitude: null, longitude: null, pricePerNight: 90 } },
            { hotel: { name: 'Sentinel', latitude: 0, longitude: 0 } },
        ],
        activityCandidates: [{ name: 'Cable Park', latitude: 43.70, longitude: 7.25, kinds: 'sport,stadiums' }],
        restaurantCandidates: [{ name: 'La Piazza', latitude: 43.69, longitude: 7.27, kinds: 'foods,restaurants' }],
    } as any;

    it('collects ride spot, priced stays, activities and restaurants with valid coords', () => {
        const points = getMapPoints(trip);
        const byKind = points.reduce((acc, p) => { acc[p.kind] = (acc[p.kind] || 0) + 1; return acc; }, {} as Record<string, number>);
        expect(byKind).toEqual({ spot: 1, stay: 1, activity: 1, restaurant: 1 });

        const spot = points.find((p) => p.kind === 'spot')!;
        expect(spot.label).toBe('Sporting Plage');
        expect(spot.detail).toBe('Your ride spot');

        const stay = points.find((p) => p.kind === 'stay')!;
        expect(stay.detail).toBe('€120/night');
        const restaurant = points.find((p) => p.kind === 'restaurant')!;
        expect(restaurant.detail).toBe('Restaurant');
    });

    it('drops entries with missing or 0,0 sentinel coordinates', () => {
        const labels = getMapPoints(trip).map((p) => p.label);
        expect(labels).not.toContain('No Coords');
        expect(labels).not.toContain('Sentinel');
    });

    it('includes direct extraStays and returns empty for no geo data', () => {
        const withExtra = getMapPoints({ primaryActivity: null } as any, [
            { name: 'Hostal Talamanca', latitude: 38.9, longitude: 1.43, pricePerNight: 95, priceCurrency: 'EUR' },
        ]);
        expect(withExtra).toHaveLength(1);
        expect(withExtra[0].kind).toBe('stay');
        expect(withExtra[0].detail).toBe('€95/night');
        expect(getMapPoints({} as any)).toEqual([]);
        expect(getMapPoints(null)).toEqual([]);
    });
});

describe('connecting-flight detail', () => {
    it('summarizes stops with the layover airports and wait times', () => {
        expect(buildConnectionSummary({
            stops: 2,
            layovers: [
                { airport: 'FRA', durationMinutes: 126 },
                { airport: 'ATH', durationMinutes: 162, overnight: false },
            ],
        })).toBe('2 stops · via FRA (2h06 wait), ATH (2h42 wait)');
    });

    it('flags overnight layovers and falls back to a count without airports', () => {
        expect(buildConnectionSummary({ stops: 1, layovers: [{ airport: 'LHR', durationMinutes: 915, overnight: true }] }))
            .toBe('1 stop · via LHR (15h15 wait overnight)');
        expect(buildConnectionSummary({ stops: 1, layovers: [] })).toBe('1 stop');
    });

    it('returns null for direct flights', () => {
        expect(buildConnectionSummary({ stops: 0, layovers: [] })).toBeNull();
        expect(buildConnectionSummary({})).toBeNull();
    });

    it('carries stops + connection summary + total duration onto flight rows', () => {
        const rows = getFlightRows({
            unifiedFlights: [{
                flightNumber: 'DE 1',
                departureAirport: 'SNN',
                arrivalAirport: 'JTR',
                ticketPrice: 300,
                stops: 2,
                totalDurationMinutes: 625,
                layovers: [{ airport: 'FRA', durationMinutes: 126 }, { airport: 'ATH', durationMinutes: 162 }],
            }],
        });
        expect(rows[0].stops).toBe(2);
        expect(rows[0].connectionSummary).toContain('via FRA (2h06 wait)');
        expect(rows[0].totalDurationLabel).toBe('10h25');
    });
});

describe('getTripVerdict', () => {
    // SNN traveller: the obvious departure costs €555, driving to DUB costs €80.
    const dublinFlyDrive = {
        flightNumber: 'FR 1976',
        departureAirport: 'DUB',
        arrivalAirport: 'IBZ',
        ticketPrice: 80,
        alternativeOrigin: true,
        originDriveMinutes: 120,
        scheduledArrival: '2026-07-10T14:35:00',
        antiCauchemar: { ticketPrice: 80, currency: 'EUR' },
    };
    const shannonDirect = {
        flightNumber: 'EI 388',
        departureAirport: 'SNN',
        arrivalAirport: 'IBZ',
        ticketPrice: 555,
        scheduledArrival: '2026-07-10T15:00:00',
        antiCauchemar: { ticketPrice: 555, currency: 'EUR' },
    };
    const trip: TripExplorationResponse = {
        originAirport: 'SNN',
        bestUnifiedFlight: dublinFlyDrive,
        unifiedFlights: [dublinFlyDrive, shannonDirect],
        hiddenGemHotels: [{ hotel: { name: 'Casa Blanca', pricePerNight: 90, priceCurrency: 'EUR' } }],
    };

    it('finds the fly-drive saving vs the cheapest home-airport departure', () => {
        const verdict = getTripVerdict(trip);

        expect(verdict.savings).toHaveLength(1);
        expect(verdict.savings[0]).toMatchObject({ kind: 'flyDrive', amount: 475, targetTab: 'flights' });
        expect(verdict.savings[0].title).toContain('DUB');
        expect(verdict.savings[0].detail).toContain('€555');
        expect(verdict.savings[0].detail).toContain('2h00');
    });

    it('surfaces the widest same-flight quote spread and ignores sub-threshold noise', () => {
        const withQuotes: TripExplorationResponse = {
            ...trip,
            bestUnifiedFlight: shannonDirect,
            unifiedFlights: [shannonDirect],
            sameFlightComparisons: [
                {
                    flightNumber: 'EI 388',
                    quotes: [
                        { sourceLabel: 'SerpApi live', ticketPrice: 555 },
                        { sourceLabel: 'Partner Offer', ticketPrice: 590 },
                    ],
                },
                // €2 spread = fare noise, never a "saving".
                { flightNumber: 'EI 389', quotes: [{ ticketPrice: 100 }, { ticketPrice: 102 }] },
            ],
        };

        const verdict = getTripVerdict(withQuotes);

        expect(verdict.savings).toHaveLength(1);
        expect(verdict.savings[0]).toMatchObject({ kind: 'sameFlightQuote', amount: 35, targetTab: 'flights' });
        expect(verdict.savings[0].title).toContain('SerpApi live');
        expect(verdict.savings[0].detail).toContain('€555');
        expect(verdict.savings[0].detail).toContain('€590');
    });

    it('adds the self-transfer saving once routing results are loaded, sorted by amount', () => {
        const verdict = getTripVerdict(trip, {
            selfConnect: {
                directPriceEur: 532,
                options: [
                    {
                        hub: 'STN',
                        hubName: 'London Stansted',
                        totalEur: 154,
                        savingsVsDirectEur: 378,
                        leg1: { departureAirport: 'SNN', arrivalAirport: 'STN' },
                        leg2: { departureAirport: 'STN', arrivalAirport: 'IBZ' },
                    },
                    { hub: 'BGY', totalEur: 400, savingsVsDirectEur: 132 },
                ],
            },
        });

        const selfTransfer = verdict.savings.find((saving) => saving.kind === 'selfTransfer');
        expect(selfTransfer).toMatchObject({ amount: 378, targetTab: 'selfConnect' });
        expect(selfTransfer?.title).toContain('London Stansted');
        expect(selfTransfer?.detail).toContain('SNN → STN → IBZ');
        expect(selfTransfer?.detail).toContain('not protected');
        // Biggest saving leads: fly-drive €475 before self-transfer €378.
        expect(verdict.savings.map((saving) => saving.kind)).toEqual(['flyDrive', 'selfTransfer']);
    });

    it('reports the advertised-vs-audited gap plus the backend catch', () => {
        const verdict = getTripVerdict({
            bestUnifiedFlight: {
                ticketPrice: 39.99,
                scheduledArrival: '2026-07-10T21:35:00',
                antiCauchemar: {
                    ticketPrice: 39.99,
                    auditedTotalCost: 112.4,
                    currency: 'EUR',
                    theCatch: 'Late arrival: last public transport leaves before landing.',
                },
            },
        });

        expect(verdict.catches.map((item) => item.kind)).toEqual(['hiddenCosts', 'flightCatch']);
        expect(verdict.catches[0].text).toContain('€40');
        expect(verdict.catches[0].text).toContain('€112');
        expect(verdict.catches[1].text).toContain('last public transport');
    });

    it('flags a late-night arrival only when the backend worded no catch itself', () => {
        const verdict = getTripVerdict({
            bestUnifiedFlight: {
                ticketPrice: 60,
                scheduledArrival: '2026-07-10T23:40:00',
                antiCauchemar: { currency: 'EUR' },
            },
        });

        expect(verdict.catches).toEqual([
            { kind: 'lateArrival', text: expect.stringContaining('Late-night arrival') },
        ]);
    });

    it('prices the selected flight, not the backend best', () => {
        const verdict = getTripVerdict(trip, { selectedFlight: shannonDirect, nights: 2 });

        // 555 flight + 2×90 sleep + 2×36 food + 2×15 transport = 837.
        expect(verdict.cost.flight).toBe(555);
        expect(verdict.cost.total).toBe(837);
        expect(verdict.cost.partial).toBe(false);
    });
});

describe('getTripVerdict — same-room quote saving (Xotelo per-OTA rates)', () => {
    const leadStayTrip: TripExplorationResponse = {
        bestUnifiedFlight: {
            ticketPrice: 120,
            scheduledArrival: '2026-07-10T15:00:00',
            antiCauchemar: { ticketPrice: 120, currency: 'EUR' },
        },
        hiddenGemHotels: [
            {
                hotel: {
                    name: 'hotel central playa',
                    pricePerNight: 195,
                    priceCurrency: 'EUR',
                    rateQuotes: [
                        { code: 'Agoda', name: 'Agoda.com', ratePerNight: 195 },
                        { code: 'BookingCom', name: 'Booking.com', ratePerNight: 232 },
                        { code: 'CtripTA', name: 'Trip.com', ratePerNight: 236 },
                    ],
                },
            },
        ],
    };

    it('scales the lead-stay channel spread to the trip length and targets the stays tab', () => {
        const verdict = getTripVerdict(leadStayTrip, { nights: 3 });

        const saving = verdict.savings.find((entry) => entry.kind === 'sameRoomQuote');
        // (236 − 195) × 3 nights = €123.
        expect(saving).toMatchObject({ amount: 123, targetTab: 'stays' });
        expect(saving?.title).toContain('Agoda.com');
        expect(saving?.detail).toContain('hotel central playa');
        expect(saving?.detail).toContain('€236');
    });

    it('falls back to the first direct-search stay when there are no hidden gems', () => {
        const verdict = getTripVerdict(
            { ...leadStayTrip, hiddenGemHotels: [] },
            {
                nights: 2,
                extraStays: [{
                    name: 'hostal pitiusa',
                    priceCurrency: 'EUR',
                    rateQuotes: [
                        { name: 'Agoda.com', ratePerNight: 100 },
                        { name: 'Booking.com', ratePerNight: 140 },
                    ],
                }],
            },
        );

        expect(verdict.savings.find((entry) => entry.kind === 'sameRoomQuote'))
            .toMatchObject({ amount: 80, targetTab: 'stays' });
    });

    it('stays silent without at least two priced quotes or a real spread', () => {
        const singleQuote = getTripVerdict({
            ...leadStayTrip,
            hiddenGemHotels: [{ hotel: { name: 'Solo', rateQuotes: [{ name: 'Agoda.com', ratePerNight: 100 }] } }],
        }, { nights: 3 });
        const flatSpread = getTripVerdict({
            ...leadStayTrip,
            hiddenGemHotels: [{
                hotel: {
                    name: 'Flat',
                    rateQuotes: [
                        { name: 'Agoda.com', ratePerNight: 100 },
                        { name: 'Booking.com', ratePerNight: 100.4 },
                    ],
                },
            }],
        }, { nights: 3 });

        expect(singleQuote.savings.find((entry) => entry.kind === 'sameRoomQuote')).toBeUndefined();
        expect(flatSpread.savings.find((entry) => entry.kind === 'sameRoomQuote')).toBeUndefined();
    });
});

describe('getStayQuoteSummary', () => {
    it('formats the cheapest-vs-priciest channel line', () => {
        const summary = getStayQuoteSummary({
            name: 'hotel central playa',
            priceCurrency: 'EUR',
            rateQuotes: [
                { name: 'Agoda.com', ratePerNight: 195 },
                { name: 'Booking.com', ratePerNight: 232 },
                { name: 'Trip.com', ratePerNight: 236 },
            ],
        });

        expect(summary).toContain('3 channels');
        expect(summary).toContain('€195/night on Agoda.com');
        expect(summary).toContain('€236 on Trip.com');
    });

    it('returns null for missing, single, or zero-rate quote lists', () => {
        expect(getStayQuoteSummary(null)).toBeNull();
        expect(getStayQuoteSummary({ name: 'X' })).toBeNull();
        expect(getStayQuoteSummary({ name: 'X', rateQuotes: [{ name: 'A', ratePerNight: 90 }] })).toBeNull();
        expect(getStayQuoteSummary({ name: 'X', rateQuotes: [{ name: 'A', ratePerNight: 0 }, { name: 'B', ratePerNight: 90 }] })).toBeNull();
    });
});

describe('getTripVerdict — same-room saving skips quote-less lead gems', () => {
    it('uses the best-scored stay that actually has channel quotes', () => {
        const verdict = getTripVerdict({
            bestUnifiedFlight: { ticketPrice: 89, antiCauchemar: { ticketPrice: 89, currency: 'EUR' } },
            hiddenGemHotels: [
                // Lead gem: unpriced apartment with no TripAdvisor listing.
                { hotel: { name: 'Apartamentos Mar Y Playa' }, compositeScore: 0.68 },
                {
                    hotel: {
                        name: 'hotel central playa',
                        pricePerNight: 195,
                        priceCurrency: 'EUR',
                        rateQuotes: [
                            { name: 'Agoda.com', ratePerNight: 195 },
                            { name: 'Trip.com', ratePerNight: 236 },
                        ],
                    },
                    compositeScore: 0.63,
                },
            ],
        }, { nights: 3 });

        // (236 − 195) × 3 = €123 on the second gem.
        expect(verdict.savings.find((entry) => entry.kind === 'sameRoomQuote'))
            .toMatchObject({ amount: 123, targetTab: 'stays' });
    });
});
