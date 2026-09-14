/**
 * The validator's rules, one test per way a fact can be wrong.
 *
 * These are the checks that stand between a model and the catalogue, so each
 * gets a case that would actually happen rather than a synthetic one: the
 * fabricated quote, the review-site price, the "from" price, the 2025 tariff
 * page still up beside the 2026 one.
 */
import {
    validateExtraction, validateSeason, validatePrice, resolveConflict,
    quoteIsOnPage, normalise, resolveTier, monthInQuote, amountInQuote,
} from '../extraction-validator.js';

const OPERATOR = 'https://www.rouffiac-teleski.com/';
const TARIFF_PAGE = 'https://www.rouffiac-teleski.com/tarifs/';
const FETCHED_AT = '2026-09-08T09:04:02Z';
// The page as fetched — must contain the fixture's quote verbatim, or the
// tests below stop testing the rule they name.
const TARIFF_TEXT = 'Tarifs 2026. 1 heure — 25 € (gilet et casque fournis). Journée — 35 €.';

const page = (text: string, url = TARIFF_PAGE, fetchedAt = FETCHED_AT) => ({
    url, fetchedAt, sourceTier: 'T1_OPERATOR', status: 200, text,
});

const ctx = (text: string, overrides: Record<string, unknown> = {}) => ({
    operatorWebsiteUrl: OPERATOR,
    pagesFetched: [page(text)],
    ...overrides,
});

const score = (total = 95, over: Record<string, number> = {}) => ({
    total,
    components: {
        sourceTier: 40, quoteMatch: 25, valueExplicit: 20, fieldProximity: 10,
        corroborated: 0, penaltyAmbiguous: 0, penaltyPromoBlock: 0, penaltyUndatedSeasonal: 0,
        ...over,
    },
});

const priceClaim = (over: Record<string, unknown> = {}) => ({
    kind: 'HOUR', amount: 25, currency: 'EUR', durationMinutes: 60, perPerson: true,
    partySizeMin: null, partySizeMax: null, includesGear: true, tier: 'STANDARD',
    label: '1 heure', notes: null, confidence: 'STATED',
    provenance: {
        sourceUrl: TARIFF_PAGE, sourceTier: 'T1_OPERATOR', observedAt: FETCHED_AT,
        sourceQuote: '1 heure — 25 € (gilet et casque fournis)', quoteLang: 'fr',
    },
    score: score(),
    ...over,
});

const seasonClaim = (over: Record<string, unknown> = {}) => ({
    seasonStartMonth: 4, seasonEndMonth: 10, yearRound: false, wrapsYearEnd: false,
    provenance: {
        sourceUrl: TARIFF_PAGE, sourceTier: 'T1_OPERATOR', observedAt: FETCHED_AT,
        sourceQuote: "Le téléski est ouvert d'avril à octobre.", quoteLang: 'fr',
    },
    score: score(),
    ...over,
});

const codes = (problems: Array<{ code: string }>) => problems.map((p) => p.code);

describe('normalisation', () => {
    it('collapses the non-breaking space French tariff pages put before the euro sign', () => {
        expect(quoteIsOnPage('25 € la séance', 'Tarif :  25 € la séance')).toBe(true);
    });

    it('does not let punctuation differences through, because they change the fact', () => {
        // "à partir de 25 €" is a floor, "25 €" is a tariff. Not the same claim.
        expect(normalise('à partir de 25 €')).not.toBe(normalise('25 €'));
    });

    it('ignores zero-width characters a page carries and a quote cannot show', () => {
        // Real case: deltawaterpark.com has a U+200B between "20h" and
        // "juillet". The model quoted the visible text and was flagged as
        // fabricating it.
        expect(quoteIsOnPage('12h - 20h juillet', '12h - 20h \u200b juillet - aout')).toBe(true);
        expect(quoteIsOnPage('soft hyphen', 'soft hy\u00adphen')).toBe(true);
    });

    it('still rejects a quote stitched from separated fragments', () => {
        // Deleting zero-width characters must not become licence to join text
        // that is genuinely apart on the page.
        expect(quoteIsOnPage('Avril ... Octobre', 'Avril ouvert. Puis fermé. Octobre')).toBe(false);
    });

    it('matches across composed and decomposed accents', () => {
        expect(quoteIsOnPage('séance', 'une séance de 30 minutes')).toBe(true);
    });
});

describe('F1 — fabrication detection', () => {
    it('rejects a quote that is not on the cited page', () => {
        const problems = validateSeason(seasonClaim(), ctx('Tarifs 2026. 1 heure 25 €.'));
        expect(codes(problems)).toContain('E_QUOTE_NOT_FOUND');
    });

    it('accepts the same claim once the page really carries the quote', () => {
        const problems = validateSeason(seasonClaim(), ctx("Le téléski est ouvert d'avril à octobre."));
        expect(problems).toEqual([]);
    });

    it('rejects a plausible price the page never states', () => {
        // The dangerous case: 30 is a believable number for this park.
        const problems = validatePrice(
            priceClaim({ amount: 30, provenance: { ...priceClaim().provenance, sourceQuote: '1 heure — 30 €' } }),
            0,
            ctx('1 heure — 25 € (gilet et casque fournis)'),
        );
        expect(codes(problems)).toContain('E_QUOTE_NOT_FOUND');
    });
});

describe('F2 — misattribution detection', () => {
    it('refuses a review site even when the model claims it is the operator', () => {
        const problems = validatePrice(
            priceClaim({ provenance: { ...priceClaim().provenance, sourceUrl: 'https://www.tripadvisor.fr/Attraction_Review-koba', sourceTier: 'T1_OPERATOR' } }),
            0,
            { operatorWebsiteUrl: OPERATOR, pagesFetched: [page('1 heure — 25 €', 'https://www.tripadvisor.fr/Attraction_Review-koba')] },
        );
        expect(codes(problems)).toContain('E_SOURCE_TIER_DISALLOWED');
    });

    it('refuses another operator\'s domain', () => {
        const other = 'https://www.wakeparkdulac.fr/tarifs/';
        const problems = validatePrice(
            priceClaim({ provenance: { ...priceClaim().provenance, sourceUrl: other } }),
            0,
            { operatorWebsiteUrl: OPERATOR, pagesFetched: [page('1 heure — 25 €', other)] },
        );
        expect(codes(problems)).toContain('E_SOURCE_TIER_DISALLOWED');
    });

    it('will not let a fact come from a page the run never fetched', () => {
        const problems = validatePrice(
            priceClaim({ provenance: { ...priceClaim().provenance, sourceUrl: 'https://www.rouffiac-teleski.com/autre/' } }),
            0,
            ctx(TARIFF_TEXT),
        );
        expect(codes(problems)).toContain('E_OBSERVED_AT_MISMATCH');
    });
});

describe('tier resolution', () => {
    it('earns T1 from the catalogue website, not from the claim', () => {
        expect(resolveTier(TARIFF_PAGE, { operatorWebsiteUrl: OPERATOR })).toBe('T1_OPERATOR');
    });

    it('gives T2 only to a host a T1 page actually linked to', () => {
        const booking = 'https://bookings.example.com/rouffiac';
        expect(resolveTier(booking, { operatorWebsiteUrl: OPERATOR })).toBeNull();
        expect(resolveTier(booking, { operatorWebsiteUrl: OPERATOR, linkedFromT1: [booking] }))
            .toBe('T2_OPERATOR_CONTROLLED');
    });

    it('gives T3 only to a declared institutional host', () => {
        const mairie = 'https://www.rouffiac.fr/loisirs';
        expect(resolveTier(mairie, { operatorWebsiteUrl: OPERATOR })).toBeNull();
        expect(resolveTier(mairie, { operatorWebsiteUrl: OPERATOR, institutionalHosts: ['rouffiac.fr'] }))
            .toBe('T3_INSTITUTIONAL');
    });
});

describe('observedAt linkage', () => {
    it('rejects an observedAt that is not when that page was fetched', () => {
        const problems = validatePrice(
            priceClaim({ provenance: { ...priceClaim().provenance, observedAt: '2026-09-08T11:00:00Z' } }),
            0,
            ctx(TARIFF_TEXT),
        );
        expect(codes(problems)).toContain('E_OBSERVED_AT_MISMATCH');
    });
});

describe('value must be in the quote', () => {
    it('rejects a "from" price presented as a tariff', () => {
        const problems = validatePrice(
            priceClaim({ amount: 30, provenance: { ...priceClaim().provenance, sourceQuote: 'formule à partir de 25 €' } }),
            0,
            ctx('formule à partir de 25 €'),
        );
        expect(codes(problems)).toContain('E_VALUE_NOT_IN_QUOTE');
    });

    it('accepts the French decimal comma', () => {
        expect(amountInQuote(25, 'Tarif 25,00 € la séance')).toBe(true);
    });

    it('does not match a number that is part of a bigger one', () => {
        expect(amountInQuote(2, 'ouvert de 10h à 20h, tarif 25 €')).toBe(false);
    });

    it('will not read a month off an opening hour', () => {
        expect(monthInQuote(1, 'ouvert de 10h à 19h')).toBe(false);
        expect(monthInQuote(4, "ouvert d'avril à octobre")).toBe(true);
    });

    it('rejects a season month the quote never names', () => {
        const problems = validateSeason(
            seasonClaim({ seasonStartMonth: 5 }),
            ctx("Le téléski est ouvert d'avril à octobre."),
        );
        expect(codes(problems)).toContain('E_VALUE_NOT_IN_QUOTE');
    });
});

describe('season-specific rules', () => {
    it('rejects year-round inferred from the absence of a stated closure', () => {
        const problems = validateSeason(
            seasonClaim({ seasonStartMonth: 1, seasonEndMonth: 12, yearRound: true,
                provenance: { ...seasonClaim().provenance, sourceQuote: 'Bienvenue au téléski nautique de Rouffiac.' } }),
            ctx('Bienvenue au téléski nautique de Rouffiac.'),
        );
        expect(codes(problems)).toContain('E_YEAR_ROUND_INFERRED');
    });

    it('catches a transposed season rather than storing it backwards', () => {
        const problems = validateSeason(
            seasonClaim({ seasonStartMonth: 10, seasonEndMonth: 4, wrapsYearEnd: false }),
            ctx("Le téléski est ouvert d'avril à octobre."),
        );
        expect(codes(problems)).toContain('E_MONTH_RANGE');
    });

    it('allows a genuine winter season that wraps the year end', () => {
        const problems = validateSeason(
            seasonClaim({ seasonStartMonth: 11, seasonEndMonth: 3, wrapsYearEnd: true,
                provenance: { ...seasonClaim().provenance, sourceQuote: 'Ouvert de novembre à mars.' } }),
            ctx('Ouvert de novembre à mars.'),
        );
        expect(problems).toEqual([]);
    });
});

describe('enum and range rules', () => {
    it('rejects a kind the catalogue does not have', () => {
        const problems = validatePrice(priceClaim({ kind: 'WEEKEND' }), 0, ctx(TARIFF_TEXT));
        expect(codes(problems)).toContain('E_ENUM_INVALID');
    });

    it('rejects any confidence other than STATED', () => {
        const problems = validatePrice(priceClaim({ confidence: 'LIKELY' }), 0, ctx(TARIFF_TEXT));
        expect(codes(problems)).toContain('E_ENUM_INVALID');
    });

    it('rejects a currency outside the catalogue countries', () => {
        const problems = validatePrice(priceClaim({ currency: 'USD' }), 0, ctx(TARIFF_TEXT));
        expect(codes(problems)).toContain('E_CURRENCY_UNSUPPORTED');
    });

    it('rejects a duplicate row rather than double-counting a tariff', () => {
        const seen = new Set<string>();
        const text = TARIFF_TEXT;
        expect(validatePrice(priceClaim(), 0, ctx(text), seen)).toEqual([]);
        expect(codes(validatePrice(priceClaim(), 1, ctx(text), seen))).toContain('E_DUPLICATE_ROW');
    });

    it('rejects a score that does not equal the sum of its parts', () => {
        const problems = validatePrice(priceClaim({ score: { total: 95, components: { sourceTier: 40 } } }), 0, ctx(TARIFF_TEXT));
        expect(codes(problems)).toContain('E_SCORE_BELOW_THRESHOLD');
    });
});

describe('conflict ladder', () => {
    const claim = (tier: string, observedAt: string, valueExplicit = 20) => ({
        provenance: { sourceTier: tier, observedAt },
        score: { total: 80, components: { valueExplicit } },
    });

    it('prefers the higher tier', () => {
        const t1 = claim('T1_OPERATOR', '2026-01-01T00:00:00Z');
        const t3 = claim('T3_INSTITUTIONAL', '2026-09-01T00:00:00Z');
        expect(resolveConflict(t3, t1)).toBe(t1);
    });

    it('prefers the newer observation at equal tier — the 2025 page beside the 2026 one', () => {
        const older = claim('T1_OPERATOR', '2025-06-01T00:00:00Z');
        const newer = claim('T1_OPERATOR', '2026-06-01T00:00:00Z');
        expect(resolveConflict(older, newer)).toBe(newer);
    });

    it('prefers the explicit value when tier and date tie', () => {
        const derived = claim('T1_OPERATOR', '2026-06-01T00:00:00Z', 10);
        const explicit = claim('T1_OPERATOR', '2026-06-01T00:00:00Z', 20);
        expect(resolveConflict(derived, explicit)).toBe(explicit);
    });

    it('returns no winner when the ladder runs out, rather than guessing', () => {
        const a = claim('T1_OPERATOR', '2026-06-01T00:00:00Z');
        const b = claim('T1_OPERATOR', '2026-06-01T00:00:00Z');
        expect(resolveConflict(a, b)).toBeNull();
    });
});

describe('verdicts', () => {
    it('accepts a sound claim', () => {
        const result = validateExtraction(
            { slug: 'rouffiac-teleski-fr', season: seasonClaim() },
            ctx("Le téléski est ouvert d'avril à octobre."),
        );
        expect(result.verdict).toBe('accepted');
        expect(result.reasons).toEqual([]);
    });

    it('holds a claim in the 60-79 review band instead of writing it', () => {
        const result = validateExtraction(
            { slug: 'x', season: seasonClaim({ score: score(65, { sourceTier: 10, valueExplicit: 20, fieldProximity: 10, quoteMatch: 25 }) }) },
            ctx("Le téléski est ouvert d'avril à octobre."),
        );
        expect(result.verdict).toBe('hold');
        expect(codes(result.reasons)).toContain('H_SCORE_IN_REVIEW_BAND');
    });

    it('a T3-only fact can never reach the accept band', () => {
        // 10 + 25 + 20 + 10 = 65, below 80 by construction.
        const result = validateExtraction(
            { slug: 'x', season: seasonClaim({
                provenance: { ...seasonClaim().provenance, sourceUrl: 'https://www.rouffiac.fr/loisirs', sourceTier: 'T3_INSTITUTIONAL' },
                score: score(65, { sourceTier: 10 }),
            }) },
            {
                operatorWebsiteUrl: OPERATOR,
                institutionalHosts: ['rouffiac.fr'],
                pagesFetched: [page("Le téléski est ouvert d'avril à octobre.", 'https://www.rouffiac.fr/loisirs')],
            },
        );
        expect(result.verdict).toBe('hold');
    });

    it('F8 — holds a contradiction of a stored value for triage rather than overwriting it', () => {
        const result = validateExtraction(
            { slug: 'x', season: seasonClaim({ seasonStartMonth: 4, seasonEndMonth: 10 }) },
            ctx("Le téléski est ouvert d'avril à octobre.", { storedSeason: { seasonStartMonth: 5, seasonEndMonth: 9 } }),
        );
        expect(result.verdict).toBe('hold');
        expect(codes(result.reasons)).toContain('H_CONTRADICTS_STORED_VALUE');
        // The extracted value is kept for the operator to compare — never discarded,
        // because the stored value may be the stale one.
        expect(result.rejected).toEqual([]);
    });

    it('holds a season while the provenance columns are not migrated yet', () => {
        const result = validateExtraction(
            { slug: 'x', season: seasonClaim() },
            ctx("Le téléski est ouvert d'avril à octobre.", { seasonProvenanceStorable: false }),
        );
        expect(result.verdict).toBe('hold');
        expect(codes(result.reasons)).toContain('H_SEASON_PROVENANCE_UNSTORABLE');
    });

    it('rejects, and says why in codes, when the quote is fabricated', () => {
        const result = validateExtraction(
            { slug: 'x', season: seasonClaim() },
            ctx('Tarifs 2026.'),
        );
        expect(result.verdict).toBe('rejected');
        expect(codes(result.rejected)).toContain('E_QUOTE_NOT_FOUND');
    });
});
