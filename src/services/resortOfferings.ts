import {
    AgeBand,
    DietaryFlag,
    OfferingCategory,
    OfferingPrice,
    ResortOfferingsResponse,
    ResortVendor,
    VendorKind,
    VendorOffering,
} from './api';

/**
 * Presentation helpers for a resort's vendor catalogue.
 *
 * <p>The rule everything here enforces: a price is never rendered without its
 * basis. "€27" on a fondue and "€27" on a plate are different commitments, and
 * dropping the basis to make a tidy column is how a €54 dinner gets shown as a
 * €27 one.
 */

const CATEGORY_LABELS: Record<OfferingCategory, string> = {
    ENTREE: 'Starters',
    PLAT_PRINCIPAL: 'Mains',
    SPECIALITES_SAVOYARDES: 'Savoyard specialities',
    PIZZA: 'Pizza',
    BURGER: 'Burgers',
    A_PARTAGER: 'To share',
    SNACKING: 'Snacks & sandwiches',
    FORMULE: 'Set menus',
    SIDE: 'Sides',
    DESSERT: 'Desserts',
    MENU_ENFANT: "Children's menu",
    RENTAL: 'Hire',
    LIFT_PASS: 'Lift passes',
    ACTIVITY: 'Activities',
    SKI_LESSON: 'Ski lessons',
    SUPPLEMENT: 'Compulsory extras',
    AUTRE: 'Other',
};

const KIND_LABELS: Record<VendorKind, string> = {
    RESTAURANT: 'Restaurant',
    BAR: 'Bar',
    SNACKING: 'Snacking',
    RENTAL: 'Hire shop',
    LIFT_OPERATOR: 'Lift company',
    SKI_SCHOOL: 'Ski school',
    ACTIVITY: 'Activity',
    OTHER: 'Other',
};

const AGE_LABELS: Record<AgeBand, string> = {
    KID: 'Kid',
    JUNIOR: 'Junior',
    ADULT: 'Adult',
    SENIOR: 'Senior',
    VETERAN: 'Veteran',
};

const DIETARY_LABELS: Record<DietaryFlag, string> = {
    VEGETARIAN: 'Vegetarian',
    VEGAN: 'Vegan',
    GLUTEN_FREE: 'Gluten free',
    DRINK_INCLUDED: 'Drink included',
};

/** Order sections the way a menu reads, not alphabetically. */
const CATEGORY_ORDER: OfferingCategory[] = [
    'LIFT_PASS', 'SUPPLEMENT', 'SKI_LESSON', 'ACTIVITY',
    'FORMULE', 'A_PARTAGER', 'ENTREE', 'SPECIALITES_SAVOYARDES', 'PLAT_PRINCIPAL',
    'PIZZA', 'BURGER', 'SNACKING', 'SIDE', 'DESSERT', 'MENU_ENFANT', 'RENTAL', 'AUTRE',
];

export const categoryLabel = (category: OfferingCategory): string => CATEGORY_LABELS[category] ?? category;
export const kindLabel = (kind: VendorKind): string => KIND_LABELS[kind] ?? kind;
export const dietaryLabel = (flag: DietaryFlag): string => DIETARY_LABELS[flag] ?? flag;

export const formatEuros = (amount: number): string =>
    `€${amount.toFixed(2).replace(/\.00$/, '')}`;

/**
 * A price with its basis spelled out. Never returns a bare amount — see the
 * module note.
 */
export const formatPrice = (price: OfferingPrice): string => {
    const amount = formatEuros(price.amount);

    // A lift pass price is meaningless without both axes: "€285" alone could be
    // an adult week or a child fortnight.
    const qualifiers: string[] = [];
    if (price.ageBand) qualifiers.push(AGE_LABELS[price.ageBand] ?? price.ageBand);
    if (price.durationLabel) qualifiers.push(price.durationLabel);
    else if (price.durationDays != null && price.basis !== 'PER_HALF_DAY' && price.basis !== 'PER_DAY') {
        qualifiers.push(`${price.durationDays} days`);
    }
    if (price.coversPeople != null && price.coversPeople > 1) {
        qualifiers.push(`covers ${price.coversPeople}`);
    }
    if (qualifiers.length > 0) {
        return `${amount} · ${qualifiers.join(', ')}`;
    }

    switch (price.basis) {
        case 'PER_PERSON':
            return price.minPartySize != null
                ? `${amount} per person, min ${price.minPartySize}`
                : `${amount} per person`;
        case 'PER_HALF_DAY':
            return `${amount} half day`;
        case 'PER_DAY':
            return `${amount} day`;
        default:
            return amount;
    }
};

export const formatPrices = (prices: OfferingPrice[]): string =>
    prices.map(formatPrice).join(' · ');

/**
 * What a party of `people` would actually pay for this offering, where that is
 * knowable. Returns null for duration-based hire, where "the bill" depends on
 * how long you keep it rather than how many of you there are.
 */
export const partyCost = (
    offering: VendorOffering,
    people: number,
    band: AgeBand = 'ADULT',
): number | null => {
    // Age band first. Prices arrive sorted by amount, so taking the first
    // PER_PERSON row silently charged a party of adults the child rate — the ice
    // rink came out at €3 a head instead of €8.50.
    const perPerson = offering.prices.find((p) => p.basis === 'PER_PERSON' && p.ageBand === band)
        ?? offering.prices.find((p) => p.basis === 'PER_PERSON' && p.ageBand == null)
        ?? offering.prices.find((p) => p.basis === 'PER_PERSON');
    if (perPerson) {
        if (perPerson.minPartySize != null && people < perPerson.minPartySize) return null;
        // A fixed-group price buys a whole sled or a whole lesson slot. Charging
        // it per head is the single easiest way to overstate an activity budget,
        // so round up to whole purchases instead of multiplying.
        if (perPerson.coversPeople != null && perPerson.coversPeople > 0) {
            return perPerson.amount * Math.ceil(people / perPerson.coversPeople);
        }
        return perPerson.amount * people;
    }
    const perItem = offering.prices.find((p) => p.basis === 'PER_ITEM');
    return perItem ? perItem.amount : null;
};

export const activityVendors = (response: ResortOfferingsResponse | null): ResortVendor[] =>
    (response?.vendors ?? []).filter((v) => v.kind === 'ACTIVITY' || v.kind === 'SKI_SCHOOL');

/** True when the party is too small to order this at all. */
export const isUnorderable = (offering: VendorOffering, people: number): boolean =>
    offering.prices.every(
        (p) => p.basis === 'PER_PERSON' && p.minPartySize != null && people < p.minPartySize,
    );

export interface CategoryGroup {
    category: OfferingCategory;
    label: string;
    offerings: VendorOffering[];
}

/** Groups a vendor's offerings into menu sections, in reading order. */
export const groupByCategory = (vendor: ResortVendor): CategoryGroup[] => {
    const buckets = new Map<OfferingCategory, VendorOffering[]>();
    vendor.offerings.forEach((offering) => {
        const list = buckets.get(offering.category) ?? [];
        list.push(offering);
        buckets.set(offering.category, list);
    });
    return CATEGORY_ORDER.filter((category) => buckets.has(category)).map((category) => ({
        category,
        label: categoryLabel(category),
        offerings: buckets.get(category) ?? [],
    }));
};

const EATING_KINDS: VendorKind[] = ['RESTAURANT', 'BAR', 'SNACKING', 'OTHER'];

export const eateries = (response: ResortOfferingsResponse | null): ResortVendor[] =>
    (response?.vendors ?? []).filter((v) => EATING_KINDS.includes(v.kind));

export const hireShops = (response: ResortOfferingsResponse | null): ResortVendor[] =>
    (response?.vendors ?? []).filter((v) => v.kind === 'RENTAL');

export const liftOperators = (response: ResortOfferingsResponse | null): ResortVendor[] =>
    (response?.vendors ?? []).filter((v) => v.kind === 'LIFT_OPERATOR');

/**
 * Cheapest lift pass covering `days` for `people` adults, and what it is called.
 *
 * <p>Picks the cheapest offering whose duration matches exactly rather than
 * scaling a day rate: a 6-day pass is around 15% cheaper than six day passes,
 * and that discount is the entire reason duration is modelled at all. Returns
 * null when the operator publishes nothing at that duration, instead of
 * interpolating a price that does not exist.
 */
export const liftPassCostFor = (
    vendor: ResortVendor,
    people: number,
    days: number,
    band: AgeBand = 'ADULT',
): { total: number; perPerson: number; label: string } | null => {
    let best: { total: number; perPerson: number; label: string } | null = null;
    vendor.offerings
        .filter((o) => o.category === 'LIFT_PASS')
        .forEach((offering) => {
            offering.prices.forEach((price) => {
                if (price.ageBand !== band) return;
                if (price.durationDays == null || Number(price.durationDays) !== days) return;
                if (best == null || price.amount < best.perPerson) {
                    best = { total: price.amount * people, perPerson: price.amount, label: offering.name };
                }
            });
        });
    return best;
};

/** Compulsory extras, which quietly add to any pass purchase. */
export const compulsoryExtras = (vendor: ResortVendor): VendorOffering[] =>
    vendor.offerings.filter((o) => o.category === 'SUPPLEMENT');

/**
 * Cheapest and dearest main-course-ish price at a vendor, for the summary line.
 * Deliberately ignores sides and desserts — "from €4" because of a coleslaw
 * tells you nothing about what dinner costs.
 */
const MAIN_CATEGORIES: OfferingCategory[] = [
    'PLAT_PRINCIPAL', 'SPECIALITES_SAVOYARDES', 'PIZZA', 'BURGER', 'FORMULE',
];

export const mainsRange = (vendor: ResortVendor): { from: number; to: number } | null => {
    const amounts = vendor.offerings
        .filter((o) => MAIN_CATEGORIES.includes(o.category))
        .flatMap((o) => o.prices.map((p) => p.amount));
    if (amounts.length === 0) return null;
    return { from: Math.min(...amounts), to: Math.max(...amounts) };
};

/**
 * Rough cost of one dinner for a party: the cheapest orderable main, one each.
 *
 * <p>Note the deliberate difference from {@link partyCost}. A main course priced
 * PER_ITEM is a plate for one person, so a party of two needs two of them — it is
 * not a sharing platter. Treating a €25 tartiflette as €25 for the table halves
 * the estimate, which is the wrong direction to be wrong in when someone is
 * budgeting a week.
 *
 * <p>An estimate for planning, not a bill. Drinks are absent from this data
 * entirely and are the single biggest reason a real evening costs more.
 */
export const estimatedDinnerFor = (vendor: ResortVendor, people: number): number | null => {
    const unitPrices = vendor.offerings
        .filter((o) => MAIN_CATEGORIES.includes(o.category) && !isUnorderable(o, people))
        .map((o) => {
            const perPerson = o.prices.find((p) => p.basis === 'PER_PERSON');
            if (perPerson) return perPerson.amount;
            const perItem = o.prices.find((p) => p.basis === 'PER_ITEM');
            return perItem ? perItem.amount : null;
        })
        .filter((p): p is number => p != null);
    return unitPrices.length === 0 ? null : Math.min(...unitPrices) * people;
};
