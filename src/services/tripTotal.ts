// Rough trip cost — one outbound fare and one stay, summed for a group.
//
// Spec: docs/specs/combined-trip-total.md (rev 4.1), sections 7.1–7.10.
//
// The two honest-total rules this module exists to keep:
//
//   · Nothing is guessed. A stay with no live rate, or a line in a currency
//     we do not convert, stays visible on the card but out of the sum, and
//     the sum is then labelled "from". No default nightly amount, ever.
//   · The headline is the FARE plus the stay, the same basis the flight cart
//     and the teaser row use (AGENTS.md, Route Hacker exception). The all-in
//     rides beside it, on the canonical hierarchy: auditedTotalCost first,
//     then the fare + shuttle + bag recompute. doorToTripPrice is never read.
//
// Money is integer cents from the first multiplication on, so the lines the
// card shows add up exactly to the figure under them.

import type { FlightAvailable } from './api';
import { getAntiCauchemarPricingSummary } from './antiCauchemarPricing';
import { formatShortDate } from './flightFormat';
import type { NearbyStay } from './stayGuide';

/** Same vocabulary as flightCart's FareBasis, plus the non-price state. */
export type LineBasis =
    | 'exact' // quoted for exactly this item, now (unused by this slice's adapters)
    | 'estimate' // derived / cached / not for the traveller's dates
    | 'floor' // cheapest on the route that day, may belong to another departure
    | 'manual-check'; // picked, but no usable price: amount null, not summed

export type TotalLineKind = 'outbound-flight' | 'stay';

export interface TotalComponent {
    /**
     * Stable pick identity, so a picked row is recognised after FlightTeaser
     * unmounts and refetches.
     * Flight: `${origin}|${destination}|${departureDate ?? ''}|${airline ?? ''}`
     * Stay:   NearbyStay.id
     */
    id: string;
    kind: TotalLineKind;
    /** "Ryanair DUB → NCE · Sat 3 Oct" for a flight, NearbyStay.name for a stay. */
    label: string;
    /** Per traveller (flight) or per night for one room (stay). null = no usable price. */
    unitAmount: number | null;
    /** ISO 4217. Adapters never emit ''; combineTripTotal still reads '' as 'EUR'. */
    currency: string;
    basis: LineBasis;
    /** Flights only: all-in per traveller. null = extras unknown. */
    allInUnitAmount?: number | null;
    /** Flights only: antiCauchemar says a cost could not be validated. */
    manualCheck?: boolean;
    /** Caveat shown under the line. Flight: priceDisclaimer ?? null. Stay: null. */
    note?: string | null;
}

export interface TripTotalInput {
    /** null = not chosen */
    outbound: TotalComponent | null;
    /** null = not chosen */
    stay: TotalComponent | null;
    /** Clamped to 1..NIGHTS_MAX, see `clampCount`. */
    nights: number;
    /** Clamped to 1..TRAVELLERS_MAX, see `clampCount`. */
    travellers: number;
    /** For the "Getting from NCE to the spot" exclusion. */
    arrivalAirport: string;
    /** The spot's tariff (`detail.prices`) is non-null with at least one line. */
    hasTariff: boolean;
}

export type LineState = 'included' | 'not-chosen' | 'unpriced' | 'not-converted';

export interface TripTotalLine {
    kind: TotalLineKind;
    state: LineState;
    component: TotalComponent | null;
    /** Travellers (flight) or nights (stay), after clamping. */
    quantity: number;
    /** Math.round(unitAmount × 100) × quantity; null unless state === 'included'. */
    amountCents: number | null;
    /** Same for allInUnitAmount, falling back to unitAmount; null unless included. */
    allInCents: number | null;
}

export type TotalPrefix = '≈ ' | 'from ';

export interface TripTotal {
    currency: 'EUR';
    /** Always two lines, fixed order: outbound-flight, stay. */
    lines: TripTotalLine[];
    /** Sum of included amountCents. null when no line is included. */
    totalCents: number | null;
    /** Sum of included allInCents. null when no line is included. */
    allInCents: number | null;
    /** Never '' in this slice: nothing here is paid or exact. */
    prefix: TotalPrefix;
    allInPrefix: TotalPrefix;
    /** Always present, in this order. */
    excluded: string[];
    /** The clamped values actually used — the card renders these. */
    nights: number;
    travellers: number;
}

export const NIGHTS_MAX = 14;
export const TRAVELLERS_MAX = 9;

/**
 * A stepper value made safe to multiply by: non-numbers, NaN and ±Infinity
 * become 1; anything else is rounded (2.5 → 3) and bounded to 1..max.
 */
export const clampCount = (value: unknown, max: number): number => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 1;
    return Math.min(max, Math.max(1, Math.round(value)));
};

/** A positive finite number, or null. Zero is not a price; it is a missing one. */
const usableAmount = (value: number | null | undefined): number | null => (
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
);

const toCents = (amount: number): number => Math.round(amount * 100);

const isEuro = (currency: string): boolean => (currency || 'EUR').toUpperCase() === 'EUR';

// ── Adapters: the only place source shapes are read ──────────────────────────

export const flightPickId = (flight: FlightAvailable): string => (
    `${flight.origin}|${flight.destination}|${flight.departureDate ?? ''}|${flight.airline ?? ''}`
);

/** "Ryanair DUB → NCE · Sat 3 Oct", dropping whichever of airline and date is missing. */
const flightLabel = (flight: FlightAvailable): string => {
    const route = `${flight.origin} → ${flight.destination}`;
    const airline = flight.airline?.trim();
    const date = formatShortDate(flight.departureDate);
    const head = airline ? `${airline} ${route}` : route;
    return date ? `${head} · ${date}` : head;
};

/**
 * The fare exactly as the teaser row reads it — parseFloat on a string price —
 * so the number on the row a traveller picks is the number in the card.
 */
const parseFare = (price: FlightAvailable['price']): number | null => {
    const value = typeof price === 'number' ? price : Number.parseFloat(String(price));
    return Number.isFinite(value) ? value : null;
};

export const outboundFromFlight = (flight: FlightAvailable): TotalComponent => {
    const summary = getAntiCauchemarPricingSummary(flight.price, flight.antiCauchemar);
    const allIn = summary.estimatedEntryPrice;
    return {
        id: flightPickId(flight),
        kind: 'outbound-flight',
        label: flightLabel(flight),
        unitAmount: parseFare(flight.price),
        // The field the teaser row formats with; antiCauchemar.currency is not read.
        currency: flight.currency || 'EUR',
        // Cached feed: never quoted for this traveller, now.
        basis: 'estimate',
        // Rounded to the cent here so a recompute like 49.99 + 5 + 24 is 78.99,
        // not 78.99000000000001. It is multiplied in cents either way.
        allInUnitAmount: typeof allIn === 'number' && Number.isFinite(allIn)
            ? toCents(allIn) / 100
            : null,
        manualCheck: summary.hasManualCheckRequired,
        note: flight.priceDisclaimer ?? null,
    };
};

export const stayFromNearby = (stay: NearbyStay): TotalComponent => {
    const rate = usableAmount(stay.pricePerNight);
    return {
        id: stay.id,
        kind: 'stay',
        label: stay.name,
        unitAmount: rate,
        currency: stay.priceCurrency || 'EUR',
        basis: rate != null ? 'estimate' : 'manual-check',
        note: null,
    };
};

// ── The sum ──────────────────────────────────────────────────────────────────

/** Line states, evaluated top-down; the first match wins (spec 7.2). */
const lineStateOf = (component: TotalComponent | null): LineState => {
    if (!component) return 'not-chosen';
    // Before the currency check on purpose: a GBP line with no amount has
    // nothing to show in its own currency either.
    if (usableAmount(component.unitAmount) == null || component.basis === 'manual-check') return 'unpriced';
    if (!isEuro(component.currency)) return 'not-converted';
    return 'included';
};

const buildLine = (kind: TotalLineKind, component: TotalComponent | null, quantity: number): TripTotalLine => {
    const state = lineStateOf(component);
    if (state !== 'included' || !component) {
        return { kind, state, component, quantity, amountCents: null, allInCents: null };
    }
    const unit = component.unitAmount as number;
    const amountCents = toCents(unit) * quantity;
    const allInUnit = usableAmount(component.allInUnitAmount);
    return {
        kind,
        state,
        component,
        quantity,
        amountCents,
        allInCents: allInUnit != null ? toCents(allInUnit) * quantity : amountCents,
    };
};

const excludedItems = (arrivalAirport: string, hasTariff: boolean): string[] => [
    'Flight home',
    `Getting from ${arrivalAirport} to the spot`,
    hasTariff ? 'Riding (see the tariff above)' : 'Riding (no tariff on file yet)',
    'Food and gear hire',
];

export const combineTripTotal = (input: TripTotalInput): TripTotal => {
    const nights = clampCount(input.nights, NIGHTS_MAX);
    const travellers = clampCount(input.travellers, TRAVELLERS_MAX);

    const flightLine = buildLine('outbound-flight', input.outbound, travellers);
    const stayLine = buildLine('stay', input.stay, nights);
    const lines = [flightLine, stayLine];
    const included = lines.filter((line) => line.state === 'included');

    const sum = (pick: (line: TripTotalLine) => number | null): number | null => (
        included.length > 0 ? included.reduce((total, line) => total + (pick(line) ?? 0), 0) : null
    );

    const prefix: TotalPrefix = included.length === lines.length ? '≈ ' : 'from ';
    // The all-in is a floor too when the flight's extras are unknown, or when
    // the backend left an unvalidated cost out of auditedTotalCost.
    const flightExtrasUnsure = flightLine.state === 'included'
        && (usableAmount(flightLine.component?.allInUnitAmount) == null || flightLine.component?.manualCheck === true);
    const allInPrefix: TotalPrefix = prefix === 'from ' || flightExtrasUnsure ? 'from ' : '≈ ';

    return {
        currency: 'EUR',
        lines,
        totalCents: sum((line) => line.amountCents),
        allInCents: sum((line) => line.allInCents),
        prefix,
        allInPrefix,
        excluded: excludedItems(input.arrivalAirport, input.hasTariff),
        nights,
        travellers,
    };
};
