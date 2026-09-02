import { AntiCauchemarAnalysis } from './api';

export interface AntiCauchemarPricingSummary {
    currency: string;
    baseFare?: number;
    ticketPrice?: number;
    airportShuttleEstimate?: number;
    cabinBagEstimate?: number;
    estimatedEntryPrice?: number;
    /** Backend-computed auditedTotalCost (realCost + hiddenCostPenalty + lateArrivalMarkup). */
    auditedTotalCost?: number;
    /** Full door-to-trip price when firstMileAccess was supplied. */
    doorToTripPrice?: number;
    hasConcreteBreakdown: boolean;
    hasOpaquePenalty: boolean;
    /** True when the backend flagged one or more line items as MANUAL_CHECK_REQUIRED. */
    hasManualCheckRequired: boolean;
}

const asFiniteAmount = (value: unknown): number | undefined => {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : undefined;
    }

    if (typeof value === 'string') {
        const parsed = Number.parseFloat(value);
        return Number.isFinite(parsed) ? parsed : undefined;
    }

    return undefined;
};

export const getAntiCauchemarPricingSummary = (
    basePrice: number | string | undefined,
    truth?: AntiCauchemarAnalysis | null,
): AntiCauchemarPricingSummary => {
    const baseFare = asFiniteAmount(basePrice);
    const ticketPrice = asFiniteAmount(truth?.ticketPrice);
    const airportShuttleEstimate = asFiniteAmount(truth?.airportShuttleEstimate);
    const cabinBagEstimate = asFiniteAmount(truth?.cabinBagEstimate);
    const reportedEntryPrice = asFiniteAmount(truth?.realWorldEntryPrice ?? truth?.realCost);
    const auditedTotalCost = asFiniteAmount(truth?.auditedTotalCost);
    const doorToTripPrice = asFiniteAmount(truth?.doorToTripPrice ?? undefined);
    const knownFare = ticketPrice ?? baseFare;
    const knownExtrasTotal = (airportShuttleEstimate ?? 0) + (cabinBagEstimate ?? 0);
    const hasConcreteBreakdown = typeof knownFare === 'number' && (typeof airportShuttleEstimate === 'number' || typeof cabinBagEstimate === 'number' || (typeof ticketPrice === 'number' && typeof baseFare === 'number' && Math.abs(ticketPrice - baseFare) >= 1));

    // Backend's priceBreakdown signals manual check needed when shuttleFee or lateArrivalMarkup have status MANUAL_CHECK_REQUIRED
    const breakdown = truth?.priceBreakdown;
    const hasManualCheckRequired = Boolean(truth?.manualCheckRequired)
        || breakdown?.shuttleFee?.status === 'MANUAL_CHECK_REQUIRED'
        || breakdown?.lateArrivalMarkup?.status === 'MANUAL_CHECK_REQUIRED';

    let estimatedEntryPrice: number | undefined;
    if (typeof auditedTotalCost === 'number') {
        // Prefer the backend's fully-audited total (includes lateArrivalMarkup + hiddenCostPenalty)
        estimatedEntryPrice = auditedTotalCost;
    } else if (hasConcreteBreakdown && typeof knownFare === 'number') {
        const recomputedTotal = knownFare + knownExtrasTotal;
        estimatedEntryPrice = typeof reportedEntryPrice === 'number' && Math.abs(reportedEntryPrice - recomputedTotal) <= 3
            ? reportedEntryPrice
            : recomputedTotal;
    }

    return {
        currency: truth?.currency ?? 'EUR',
        baseFare,
        ticketPrice,
        airportShuttleEstimate,
        cabinBagEstimate,
        estimatedEntryPrice,
        auditedTotalCost,
        doorToTripPrice: doorToTripPrice ?? undefined,
        hasConcreteBreakdown,
        hasOpaquePenalty: !hasConcreteBreakdown && typeof asFiniteAmount(truth?.hiddenCostPenalty) === 'number',
        hasManualCheckRequired,
    };
};

/**
 * Returns a copy of the analysis with the cabin-bag estimate removed from
 * every total — for travellers with a small bag only. The bag line drops to
 * zero (so breakdown renderers hide it) and the stale with-bag PRICE
 * TRANSPARENCY sentence is removed from theCatch rather than left lying.
 */
export const stripCabinBag = (truth: AntiCauchemarAnalysis): AntiCauchemarAnalysis => {
    const bag = asFiniteAmount(truth.cabinBagEstimate) ?? 0;
    if (bag <= 0) {
        return truth;
    }
    const minusBag = (value?: number | null): number | undefined => (
        typeof value === 'number' && Number.isFinite(value) ? Math.round((value - bag) * 100) / 100 : undefined
    );
    const stripped: AntiCauchemarAnalysis = {
        ...truth,
        cabinBagEstimate: 0,
        realCost: minusBag(truth.realCost),
        realWorldEntryPrice: minusBag(truth.realWorldEntryPrice),
        auditedTotalCost: minusBag(truth.auditedTotalCost),
        doorToTripPrice: truth.doorToTripPrice != null ? minusBag(truth.doorToTripPrice) : truth.doorToTripPrice,
        theCatch: truth.theCatch
            ? truth.theCatch.split(' || ').filter((part) => !part.startsWith('PRICE TRANSPARENCY')).join(' || ') || undefined
            : truth.theCatch,
    };
    if (truth.priceBreakdown?.baggageEstimate) {
        stripped.priceBreakdown = {
            ...truth.priceBreakdown,
            baggageEstimate: {
                ...truth.priceBreakdown.baggageEstimate,
                amount: 0,
                status: 'EXACT',
                note: 'Cabin bag excluded — travelling with a small bag only.',
            },
        };
    }
    return stripped;
};

export const getComparableFlightPrice = (
    basePrice: number | string | undefined,
    truth?: AntiCauchemarAnalysis | null,
): number => {
    const pricing = getAntiCauchemarPricingSummary(basePrice, truth);
    if (typeof pricing.estimatedEntryPrice === 'number') {
        return pricing.estimatedEntryPrice;
    }

    if (typeof pricing.baseFare === 'number') {
        return pricing.baseFare;
    }

    return Number.MAX_SAFE_INTEGER;
};

