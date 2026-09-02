import { OfferingPrice, ResortVendor, VendorOffering } from './api';
import { matchPlannerSlug } from './skiMap';
import {
    estimatedDinnerFor,
    formatPrice,
    formatPrices,
    groupByCategory,
    isUnorderable,
    mainsRange,
    partyCost,
} from './resortOfferings';

const price = (over: Partial<OfferingPrice> = {}): OfferingPrice => ({
    basis: 'PER_ITEM',
    amount: 25,
    currency: 'EUR',
    minPartySize: null,
    ...over,
});

const offering = (over: Partial<VendorOffering> = {}): VendorOffering => ({
    slug: 'x',
    name: 'X',
    category: 'PLAT_PRINCIPAL',
    prices: [price()],
    ...over,
});

describe('formatPrice', () => {
    it('never renders a bare amount for a per-person dish', () => {
        // €27 on a fondue and €27 on a plate are different commitments; dropping
        // the basis is how a €54 dinner gets displayed as a €27 one.
        expect(formatPrice(price({ basis: 'PER_PERSON', amount: 27 }))).toBe('€27 per person');
    });

    it('surfaces the party minimum where there is one', () => {
        expect(formatPrice(price({ basis: 'PER_PERSON', amount: 25, minPartySize: 2 })))
            .toBe('€25 per person, min 2');
    });

    it('distinguishes half-day from full-day hire', () => {
        expect(formatPrice(price({ basis: 'PER_HALF_DAY', amount: 70 }))).toBe('€70 half day');
        expect(formatPrice(price({ basis: 'PER_DAY', amount: 95 }))).toBe('€95 day');
    });

    it('keeps cents when they are not round', () => {
        expect(formatPrice(price({ amount: 7.9 }))).toBe('€7.90');
        expect(formatPrice(price({ amount: 17.5 }))).toBe('€17.50');
        expect(formatPrice(price({ amount: 25 }))).toBe('€25');
    });

    it('joins a hire item\'s two rates into one line', () => {
        expect(formatPrices([
            price({ basis: 'PER_HALF_DAY', amount: 70 }),
            price({ basis: 'PER_DAY', amount: 95 }),
        ])).toBe('€70 half day · €95 day');
    });
});

describe('partyCost', () => {
    it('multiplies a per-person price by the party', () => {
        const fondue = offering({ prices: [price({ basis: 'PER_PERSON', amount: 27, minPartySize: 2 })] });
        expect(partyCost(fondue, 2)).toBe(54);
        expect(partyCost(fondue, 4)).toBe(108);
    });

    it('does not multiply a per-item price', () => {
        expect(partyCost(offering({ prices: [price({ amount: 25 })] }), 4)).toBe(25);
    });

    it('returns null when the party is under the minimum', () => {
        const fondue = offering({ prices: [price({ basis: 'PER_PERSON', amount: 27, minPartySize: 2 })] });
        expect(partyCost(fondue, 1)).toBeNull();
    });

    it('returns null for duration-based hire, where party size is the wrong axis', () => {
        const bike = offering({
            category: 'RENTAL',
            prices: [price({ basis: 'PER_HALF_DAY', amount: 70 }), price({ basis: 'PER_DAY', amount: 95 })],
        });
        expect(partyCost(bike, 2)).toBeNull();
    });
});

describe('isUnorderable', () => {
    it('flags a two-person fondue for a solo diner', () => {
        const fondue = offering({ prices: [price({ basis: 'PER_PERSON', amount: 27, minPartySize: 2 })] });
        expect(isUnorderable(fondue, 1)).toBe(true);
        expect(isUnorderable(fondue, 2)).toBe(false);
    });

    it('treats an unstated minimum as no minimum', () => {
        const raclette = offering({ prices: [price({ basis: 'PER_PERSON', amount: 29 })] });
        expect(isUnorderable(raclette, 1)).toBe(false);
    });
});

describe('mainsRange', () => {
    it('ignores sides and desserts so "from €4" is not a coleslaw', () => {
        const vendor = {
            slug: 'v', name: 'V', kind: 'RESTAURANT', confidence: 'LIKELY',
            offerings: [
                offering({ slug: 'burger', category: 'BURGER', prices: [price({ amount: 13 })] }),
                offering({ slug: 'side', category: 'SIDE', prices: [price({ amount: 4 })] }),
                offering({ slug: 'dessert', category: 'DESSERT', prices: [price({ amount: 10 })] }),
            ],
        } as ResortVendor;
        expect(mainsRange(vendor)).toEqual({ from: 13, to: 13 });
    });

    it('returns null when a vendor sells no mains at all', () => {
        const vendor = {
            slug: 'v', name: 'V', kind: 'RENTAL', confidence: 'LIKELY',
            offerings: [offering({ category: 'RENTAL', prices: [price({ basis: 'PER_DAY', amount: 95 })] })],
        } as ResortVendor;
        expect(mainsRange(vendor)).toBeNull();
    });
});

describe('estimatedDinnerFor', () => {
    it('skips anything the party is too small to order', () => {
        const vendor = {
            slug: 'v', name: 'V', kind: 'RESTAURANT', confidence: 'LIKELY',
            offerings: [
                offering({
                    slug: 'fondue', category: 'SPECIALITES_SAVOYARDES',
                    prices: [price({ basis: 'PER_PERSON', amount: 10, minPartySize: 2 })],
                }),
                offering({ slug: 'steak', category: 'PLAT_PRINCIPAL', prices: [price({ amount: 32 })] }),
            ],
        } as ResortVendor;

        // Solo: the €10pp fondue is unavailable, so the €32 steak is the floor.
        expect(estimatedDinnerFor(vendor, 1)).toBe(32);
        // Two: the fondue becomes orderable at €10 each.
        expect(estimatedDinnerFor(vendor, 2)).toBe(20);
    });

    it('charges a per-item main once per diner, not once per table', () => {
        // A €25 tartiflette is a plate, not a sharing platter. Counting it once
        // for a couple halves the estimate — the wrong direction to be wrong in
        // when someone is budgeting a week of dinners.
        const vendor = {
            slug: 'v', name: 'V', kind: 'RESTAURANT', confidence: 'LIKELY',
            offerings: [
                offering({ slug: 'tartiflette', category: 'SPECIALITES_SAVOYARDES', prices: [price({ amount: 25 })] }),
            ],
        } as ResortVendor;

        expect(estimatedDinnerFor(vendor, 1)).toBe(25);
        expect(estimatedDinnerFor(vendor, 2)).toBe(50);
        expect(estimatedDinnerFor(vendor, 4)).toBe(100);
    });
});

describe('groupByCategory', () => {
    it('orders sections the way a menu reads, not alphabetically', () => {
        const vendor = {
            slug: 'v', name: 'V', kind: 'RESTAURANT', confidence: 'LIKELY',
            offerings: [
                offering({ slug: 'd', category: 'DESSERT' }),
                offering({ slug: 'm', category: 'PLAT_PRINCIPAL' }),
                offering({ slug: 'e', category: 'ENTREE' }),
            ],
        } as ResortVendor;
        expect(groupByCategory(vendor).map((g) => g.category))
            .toEqual(['ENTREE', 'PLAT_PRINCIPAL', 'DESSERT']);
    });
});

describe('matchPlannerSlug', () => {
    const slugs = ['la-clusaz', 'chamonix'];

    it('matches the plain catalogue name', () => {
        expect(matchPlannerSlug('La Clusaz', slugs)).toBe('la-clusaz');
    });

    it('matches the mojibake linked-area name the catalogue also carries', () => {
        expect(matchPlannerSlug('La Clusaz-?Manigod', slugs)).toBe('la-clusaz');
    });

    it('does not match an unrelated resort', () => {
        expect(matchPlannerSlug('Les Gets', slugs)).toBeNull();
        expect(matchPlannerSlug('Clusaz Verte', slugs)).toBeNull();
    });

    it('tolerates missing names', () => {
        expect(matchPlannerSlug(null, slugs)).toBeNull();
        expect(matchPlannerSlug('', slugs)).toBeNull();
    });

    it('returns null when no planner profiles exist', () => {
        expect(matchPlannerSlug('La Clusaz', [])).toBeNull();
    });
});
