import {
    BudgetLineInput,
    chooseTransport,
    composeWeekend,
    priceLine,
    subtotalByKind,
    TransportOption,
} from './weekendBudget';

// The worked example the product exists for: someone wants to go to Le Mans
// and wakeboard. Every figure here is a real published price.
const WAKEBOARD_2H: BudgetLineInput = {
    kind: 'activity', label: 'Wakeboard, 2 hours', unitAmount: 36, units: 1,
    perPerson: true, status: 'EXACT', source: 'venue session rate',
};
const FORMULE_GOURMANDE: BudgetLineInput = {
    kind: 'food', label: 'Formule gourmande (entrée + plat + boisson)', unitAmount: 20.90, units: 4,
    perPerson: true, status: 'EXACT', source: 'restaurant menu, midi en semaine',
    note: 'weekday lunch menu — not valid on public holidays',
};
const CAMPANILE: BudgetLineInput = {
    kind: 'stay', label: 'Campanile Le Mans, 2 nights', unitAmount: 91, units: 2,
    perPerson: false, status: 'EXACT', source: 'hotel rate',
};

describe('a Le Mans wakeboard weekend', () => {
    it('adds up one traveller, two nights, to the cent', () => {
        const budget = composeWeekend({
            destination: 'Le Mans', nights: 2, partySize: 1,
            lines: [WAKEBOARD_2H, FORMULE_GOURMANDE, CAMPANILE],
        });

        // 36 + (20.90 x 4) + (91 x 2)
        expect(subtotalByKind(budget, 'activity')).toBe(36);
        expect(subtotalByKind(budget, 'food')).toBe(83.60);
        expect(subtotalByKind(budget, 'stay')).toBe(182);
        expect(budget.totals.party).toBe(301.60);
        expect(budget.totals.perPerson).toBe(301.60);
    });

    it('is EXACT while every line is a published price', () => {
        const budget = composeWeekend({
            destination: 'Le Mans', nights: 2, partySize: 1,
            lines: [WAKEBOARD_2H, FORMULE_GOURMANDE, CAMPANILE],
        });

        expect(budget.totals.status).toBe('EXACT');
        expect(budget.totals.unpricedLabels).toEqual([]);
    });

    it('scales the right lines when four friends go', () => {
        const budget = composeWeekend({
            destination: 'Le Mans', nights: 2, partySize: 4,
            lines: [WAKEBOARD_2H, FORMULE_GOURMANDE, CAMPANILE],
        });

        // Sessions and meals scale per head; one room does not.
        expect(subtotalByKind(budget, 'activity')).toBe(144);
        expect(subtotalByKind(budget, 'food')).toBe(334.40);
        expect(subtotalByKind(budget, 'stay')).toBe(182);
        expect(budget.totals.party).toBe(660.40);
        expect(budget.totals.perPerson).toBe(165.10);
    });

    // The line that matters: a missing fare must not read as free.
    it('drags the whole total to MANUAL_CHECK when the journey is unpriced', () => {
        const budget = composeWeekend({
            destination: 'Le Mans', nights: 2, partySize: 1,
            lines: [
                WAKEBOARD_2H, FORMULE_GOURMANDE, CAMPANILE,
                { kind: 'transport', label: 'Train to Le Mans', unitAmount: null, units: 1,
                  perPerson: true, status: 'MANUAL_CHECK_REQUIRED', source: 'not looked up yet' },
            ],
        });

        expect(budget.totals.status).toBe('MANUAL_CHECK_REQUIRED');
        expect(budget.totals.unpricedLabels).toEqual(['Train to Le Mans']);
        // The priced part still totals correctly — it is just incomplete.
        expect(budget.totals.party).toBe(301.60);
    });

    it('answers a budget question only when the budget is complete', () => {
        const complete = composeWeekend({
            destination: 'Le Mans', nights: 2, partySize: 1, budgetPerPerson: 350,
            lines: [WAKEBOARD_2H, FORMULE_GOURMANDE, CAMPANILE],
        });
        expect(complete.withinBudget).toBe(true);
        expect(complete.budgetGapPerPerson).toBe(48.40);

        const overBudget = composeWeekend({
            destination: 'Le Mans', nights: 2, partySize: 1, budgetPerPerson: 250,
            lines: [WAKEBOARD_2H, FORMULE_GOURMANDE, CAMPANILE],
        });
        expect(overBudget.withinBudget).toBe(false);
        expect(overBudget.budgetGapPerPerson).toBe(-51.60);

        // A budget you cannot finish is not a budget you have blown.
        const incomplete = composeWeekend({
            destination: 'Le Mans', nights: 2, partySize: 1, budgetPerPerson: 250,
            lines: [WAKEBOARD_2H, { ...CAMPANILE, unitAmount: null }],
        });
        expect(incomplete.withinBudget).toBeNull();
    });
});

describe('priceLine', () => {
    it('keeps menu prices exact rather than drifting', () => {
        expect(priceLine(FORMULE_GOURMANDE, 3).amount).toBe(250.80);  // 20.90 x 4 x 3
    });

    it('returns null rather than zero for an unpriced line', () => {
        expect(priceLine({ ...CAMPANILE, unitAmount: null }, 1).amount).toBeNull();
    });
});

describe('chooseTransport', () => {
    const train: TransportOption = {
        kind: 'transport', mode: 'train', label: 'TGV return', unitAmount: 78, units: 1,
        perPerson: true, status: 'EXACT', source: 'rail fare', durationMinutes: 65,
    };
    const car: TransportOption = {
        kind: 'transport', mode: 'car', label: 'Drive + fuel + tolls', unitAmount: 96, units: 1,
        perPerson: false, status: 'ESTIMATED', source: 'distance estimate', durationMinutes: 150,
    };
    const flight: TransportOption = {
        kind: 'transport', mode: 'flight', label: 'Flight', unitAmount: null, units: 1,
        perPerson: true, status: 'MANUAL_CHECK_REQUIRED', source: 'no route found',
    };

    it('picks the cheapest priced option for one traveller', () => {
        const choice = chooseTransport([train, car, flight], 1);
        expect(choice.chosen?.mode).toBe('train');          // 78 < 96
        expect(choice.unpriced.map((o) => o.mode)).toEqual(['flight']);
    });

    it('flips to the car once the group makes it cheaper per head', () => {
        // Four train seats = 312; one car = 96.
        const choice = chooseTransport([train, car, flight], 4);
        expect(choice.chosen?.mode).toBe('car');
        expect(choice.alternatives[0].mode).toBe('train');
    });

    it('never chooses an unpriced option, and never calls it free', () => {
        const choice = chooseTransport([flight], 2);
        expect(choice.chosen).toBeNull();
        expect(choice.unpriced).toHaveLength(1);
    });
});
