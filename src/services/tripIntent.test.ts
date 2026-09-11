import {
    assessMateriality,
    mergeProfileIntoIntent,
    normalizeTripIntent,
    ResolvedIntent,
} from './tripIntent';

const base = (overrides: Partial<ResolvedIntent> = {}): ResolvedIntent => ({
    ...normalizeTripIntent({}).intent,
    ...overrides,
});

describe('normalizeTripIntent — untrusted model output', () => {
    it('drops an unknown enum rather than coercing it', () => {
        const { intent, warnings } = normalizeTripIntent({ activity: 'paragliding' });

        expect(intent.activity).toBeNull();
        expect(warnings.map((w) => w.field)).toContain('activity');
    });

    it('drops a destination outside the catalogue and says so', () => {
        const { intent, warnings } = normalizeTripIntent({
            destinationHints: ['Ibiza', 'Atlantis Cable Park'],
        });

        expect(intent.destinationHints).toEqual(['Ibiza']);
        const unresolved = warnings.find((w) => w.kind === 'HINT_UNRESOLVED');
        expect(unresolved?.message).toContain('Atlantis Cable Park');
    });

    it('never lets the model emit its own IATA code for a place name', () => {
        expect(normalizeTripIntent({ origin: 'Limerick, Ireland' }).intent.origin).toBe('SNN');
        expect(normalizeTripIntent({ origin: 'dub' }).intent.origin).toBe('DUB');
    });

    it('falls back to balanced ranking on an unknown profile', () => {
        const { intent, warnings } = normalizeTripIntent({ weightProfile: 'cheapest_at_all_costs' });

        expect(intent.weightProfile).toBe('balanced');
        expect(intent.sources.weightProfile).toBe('assumed');
        expect(warnings.map((w) => w.field)).toContain('weightProfile');
    });

    it('rejects out-of-range and non-integer counts', () => {
        expect(normalizeTripIntent({ partySize: 0 }).intent.partySize).toBeNull();
        expect(normalizeTripIntent({ partySize: 2.5 }).intent.partySize).toBeNull();
        expect(normalizeTripIntent({ partySize: 999 }).intent.partySize).toBeNull();
        expect(normalizeTripIntent({ partySize: 4 }).intent.partySize).toBe(4);
    });

    it('rejects a backwards date window', () => {
        const { intent, warnings } = normalizeTripIntent({
            dateWindow: { earliest: '2026-09-20', latest: '2026-09-10' },
        });

        expect(intent.dateWindow).toBeNull();
        expect(warnings.map((w) => w.field)).toContain('dateWindow');
    });

    it('survives hostile and malformed payloads without throwing', () => {
        expect(() => normalizeTripIntent(null)).not.toThrow();
        expect(() => normalizeTripIntent('not an object')).not.toThrow();
        expect(() => normalizeTripIntent({ budget: 'lots' })).not.toThrow();
        expect(normalizeTripIntent({ destinationHints: 'Ibiza' }).intent.destinationHints).toEqual([]);
    });

    it('bounds the hint list so a huge payload cannot fan out', () => {
        const many = Array.from({ length: 50 }, () => 'Ibiza');
        expect(normalizeTripIntent({ destinationHints: many }).intent.destinationHints).toEqual(['Ibiza']);
    });

    it('marks user-supplied fields as user-sourced', () => {
        const { intent } = normalizeTripIntent({ partySize: 4, activity: 'wakeboard' });

        expect(intent.sources.partySize).toBe('user');
        expect(intent.sources.activity).toBe('user');
        expect(intent.sources.origin).toBeUndefined();
    });
});

describe('mergeProfileIntoIntent — the user always beats the profile', () => {
    it('fills a missing origin from the saved home address', () => {
        const { intent, warnings } = mergeProfileIntoIntent(base(), { homeAddress: 'Cork' });

        expect(intent.origin).toBe('ORK');
        expect(intent.sources.origin).toBe('profile');
        expect(warnings[0].kind).toBe('PROFILE_APPLIED');
    });

    it('does not override an origin the user gave', () => {
        const stated = base({ origin: 'DUB', sources: { origin: 'user' } });
        const { intent } = mergeProfileIntoIntent(stated, { homeAddress: 'Cork' });

        expect(intent.origin).toBe('DUB');
        expect(intent.sources.origin).toBe('user');
    });

    it('derives a budget from the daily allowance only when nights are known', () => {
        const withNights = mergeProfileIntoIntent(base({ nights: 3 }), { profile: { dailyBudget: 120 } });
        expect(withNights.intent.budget.totalEur).toBe(360);

        const withoutNights = mergeProfileIntoIntent(base(), { profile: { dailyBudget: 120 } });
        expect(withoutNights.intent.budget.totalEur).toBeNull();
    });
});

describe('assessMateriality — three blocking questions, nothing else', () => {
    it('blocks when there is no origin', () => {
        expect(assessMateriality(base())?.field).toBe('origin');
    });

    it('blocks a seasonal ask with no dates', () => {
        const intent = base({ origin: 'DUB', climate: 'warm' });
        expect(assessMateriality(intent)?.field).toBe('dateWindow');
    });

    it('does not block a non-seasonal ask with no dates', () => {
        const intent = base({ origin: 'DUB' });
        expect(assessMateriality(intent)).toBeNull();
    });

    it('blocks a vague budget only when the spread is wide', () => {
        const intent = base({ origin: 'DUB', budget: { totalEur: null, band: 'tight', perPerson: true } });

        expect(assessMateriality(intent, { candidateSpread: 3 })?.field).toBe('budget');
        expect(assessMateriality(intent, { candidateSpread: 1.3 })).toBeNull();
        expect(assessMateriality(intent, {})).toBeNull();
    });

    it('does not block when the budget is an actual number', () => {
        const intent = base({ origin: 'DUB', budget: { totalEur: 400, band: 'tight', perPerson: true } });
        expect(assessMateriality(intent, { candidateSpread: 5 })).toBeNull();
    });
});
