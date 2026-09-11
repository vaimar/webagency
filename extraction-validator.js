/**
 * Deterministic validator for catalogue-truth extraction.
 *
 * The contract (docs/EXTRACTION-CONTRACT.md) is only worth as much as the
 * machine that enforces it. JSON Schema can check that a claim has the right
 * SHAPE; it cannot check that the quote is on the page, that the host is the
 * operator's, or that observedAt is the moment that page was actually fetched.
 * Those are the rules that catch a fabrication, so they live here.
 *
 * Plain ESM at the repo root, like `spot-readiness.js` and for the same reason:
 * the pipeline runs under Node and the tests run under Vitest, and a rule that
 * exists twice will eventually disagree with itself.
 *
 * Nothing here calls the network. A caller fetches pages, hands over their text
 * and hashes, and gets a verdict — which is what makes every rule below
 * reproducible from a stored run without re-fetching anything.
 */

// ─── Reason codes ────────────────────────────────────────────────────────────
// E_* reject the claim. H_* hold it for the operator checklist. Every rejection
// carries one: a claim that vanishes without a code cannot be argued with.

export const REJECT_CODES = [
    'E_NO_SOURCE',
    'E_SOURCE_TIER_DISALLOWED',
    'E_QUOTE_NOT_FOUND',
    'E_OBSERVED_AT_MISMATCH',
    'E_VALUE_NOT_IN_QUOTE',
    'E_ENUM_INVALID',
    'E_MONTH_RANGE',
    'E_AMOUNT_RANGE',
    'E_CURRENCY_UNSUPPORTED',
    'E_DUPLICATE_ROW',
    'E_CONFLICT_UNRESOLVED',
    'E_SCORE_BELOW_THRESHOLD',
    'E_YEAR_ROUND_INFERRED',
];

export const HOLD_CODES = [
    'H_SCORE_IN_REVIEW_BAND',
    'H_CONTRADICTS_STORED_VALUE',
    'H_SEASON_PROVENANCE_UNSTORABLE',
];

/**
 * Transport and system failures — a separate namespace on purpose.
 *
 * The first matrix run coded every one of these `E_NO_SOURCE`, which put "the
 * model was rate limited" in the same bucket as "this fact has no source". 49
 * of 60 spot-runs failed that way and the resulting table looked like a
 * judgement about four models when it was a judgement about my retry policy.
 *
 * A `T_` code means the extractor never got an answer to judge. It is not an
 * extraction-quality failure, never maps to F1 or F2, and must never appear in
 * a rejected-facts count.
 */
export const TRANSPORT_CODES = [
    'T_RATE_LIMITED',
    'T_SERVICE_UNAVAILABLE',
    'T_FETCH_FAILED',
    'T_REPLY_NOT_JSON',
    'T_REPLY_TRUNCATED',
    'T_REQUEST_TIMEOUT',
    'T_PARAM_REJECTED',
    'T_UNAUTHORIZED',
    'T_NO_PAGES',
];

/** True for a code that says nothing about extraction quality. */
export const isTransportCode = (code) => TRANSPORT_CODES.includes(code);

// ─── Catalogue enums ─────────────────────────────────────────────────────────
// Read off the live catalogue, never invented. A model that emits a value
// outside these is describing a different product.

export const PRICE_KINDS = ['HOUR', 'HALF_DAY', 'DAY', 'SESSION', 'PACK', 'COACHING',
    'GROUP_HIRE', 'ACCESS_BAND', 'MEMBERSHIP', 'GEAR_RENTAL'];
export const PRICE_TIERS = ['STANDARD', 'CHILD', 'REDUCED', 'STUDENT', 'MEMBER', 'OFF_PEAK', 'PEAK'];
export const CURRENCIES = ['EUR', 'CHF', 'GBP', 'TRY'];
export const SOURCE_TIERS = ['T1_OPERATOR', 'T2_OPERATOR_CONTROLLED', 'T3_INSTITUTIONAL'];

export const TIER_POINTS = { T1_OPERATOR: 40, T2_OPERATOR_CONTROLLED: 25, T3_INSTITUTIONAL: 10 };
export const TIER_RANK = { T1_OPERATOR: 3, T2_OPERATOR_CONTROLLED: 2, T3_INSTITUTIONAL: 1 };

export const ACCEPT_SCORE = 80;
export const REVIEW_SCORE = 60;
export const MAX_AMOUNT = 5000;

/**
 * Hosts that are never a source, whatever tier a model claims for them.
 *
 * A price a reviewer typed is not an operator tariff. This list is a backstop
 * rather than the mechanism — the mechanism is that a host must positively
 * resolve to T1/T2/T3 — but a model asserting `T1_OPERATOR` for tripadvisor.fr
 * should fail loudly and by name.
 */
export const NEVER_A_SOURCE = [
    'tripadvisor.', 'yelp.', 'google.com', 'facebook.com/groups', 'reddit.',
    'forum', 'blogspot.', 'wordpress.com', 'medium.com', 'wikipedia.',
];

// ─── Text normalisation ──────────────────────────────────────────────────────

/**
 * How a quote is compared to a page.
 *
 * Collapses every run of whitespace — including the non-breaking spaces French
 * tariff pages put before a currency symbol — folds case, and normalises
 * Unicode so a composed é matches a decomposed one. Deliberately does NOT strip
 * punctuation or accents: "25 €" must not match "25" and `à partir de` must not
 * match `de`, because both of those differences change the fact.
 */
export const normalise = (text) => (text ?? '')
    .normalize('NFC')
    /**
     * Zero-width and soft-hyphen characters are deleted, not spaced.
     *
     * A page carrying a U+200B between two words renders identically to one
     * without it, so a model quoting that page will not reproduce it — and
     * should not have to. Keeping it made one correct, verbatim quote read as a
     * fabrication, which is the most expensive kind of false positive this
     * validator can produce.
     */
    // Alternation, not a character class: a class containing ZWJ can silently
    // split emoji sequences, which eslint's no-misleading-character-class flags.
    .replace(/\u200B|\u200C|\u200D|\u2060|\uFEFF|\u00AD/g, '')
    // Written as escapes, not literals: NBSP, narrow NBSP, thin and figure
    // space. French tariff pages put one before the euro sign, and a literal
    // here is invisible in a diff and indistinguishable from a plain space.
    .replace(/[\u00A0\u202F\u2009\u2007]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

/** Is `quote` present in `pageText`, under the normalisation above? */
export const quoteIsOnPage = (quote, pageText) => {
    const needle = normalise(quote);
    return needle.length > 0 && normalise(pageText).includes(needle);
};

// ─── Host to tier ────────────────────────────────────────────────────────────

const hostOf = (url) => {
    try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return null; }
};

/** Same registrable-ish domain: exact host, or a subdomain of it. */
const sameSite = (a, b) => a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);

/**
 * What tier a URL actually earns — never what the model says it is.
 *
 * T1 is decided by the catalogue's own `websiteUrl`, so it cannot be claimed
 * into existence. T2 requires a T1 page fetched in the same run to link to it:
 * without that link it is a stranger's page that mentions the operator, which
 * is the thing a review site also is. T3 must be declared by the caller's
 * institutional allow-list, because "a municipal page" is not something a
 * hostname reveals.
 */
/**
 * @param {string} url
 * @param {{ operatorWebsiteUrl?: string | null,
 *           linkedFromT1?: string[],
 *           institutionalHosts?: string[] }} [options]
 * @returns {'T1_OPERATOR'|'T2_OPERATOR_CONTROLLED'|'T3_INSTITUTIONAL'|null}
 */
export const resolveTier = (url, { operatorWebsiteUrl, linkedFromT1 = [], institutionalHosts = [] } = {}) => {
    const host = hostOf(url);
    if (!host) return null;
    if (NEVER_A_SOURCE.some((bad) => host.includes(bad) || (url ?? '').toLowerCase().includes(bad))) return null;

    const operatorHost = hostOf(operatorWebsiteUrl ?? '');
    if (operatorHost && sameSite(host, operatorHost)) return 'T1_OPERATOR';
    if (linkedFromT1.some((linked) => hostOf(linked) === host)) return 'T2_OPERATOR_CONTROLLED';
    if (institutionalHosts.some((inst) => sameSite(host, inst.toLowerCase().replace(/^www\./, '')))) return 'T3_INSTITUTIONAL';
    return null;
};

// ─── Scoring ─────────────────────────────────────────────────────────────────

/** Recompute a score from its parts. The stored total is never trusted. */
export const scoreTotal = (components) => Object.values(components ?? {})
    .reduce((sum, value) => sum + (Number(value) || 0), 0);

const scoreProblems = (score, path) => {
    const problems = [];
    if (!score || typeof score.total !== 'number' || !score.components) {
        problems.push({ code: 'E_SCORE_BELOW_THRESHOLD', field: path, detail: 'No score supplied.' });
        return problems;
    }
    const recomputed = scoreTotal(score.components);
    if (recomputed !== score.total) {
        problems.push({
            code: 'E_SCORE_BELOW_THRESHOLD',
            field: `${path}.score`,
            detail: `total ${score.total} does not equal the sum of its components (${recomputed}). A score that cannot be recomputed is not auditable.`,
        });
    }
    return problems;
};

// ─── Value-in-quote ──────────────────────────────────────────────────────────

const MONTHS = {
    1: ['january', 'janvier', 'januar', 'gennaio', 'enero'],
    2: ['february', 'février', 'fevrier', 'februar', 'febbraio', 'febrero'],
    3: ['march', 'mars', 'märz', 'marzo'],
    4: ['april', 'avril', 'aprile', 'abril'],
    5: ['may', 'mai', 'maggio', 'mayo'],
    6: ['june', 'juin', 'juni', 'giugno', 'junio'],
    7: ['july', 'juillet', 'juli', 'luglio', 'julio'],
    8: ['august', 'août', 'aout', 'agosto'],
    9: ['september', 'septembre', 'settembre', 'septiembre'],
    10: ['october', 'octobre', 'oktober', 'ottobre', 'octubre'],
    11: ['november', 'novembre', 'noviembre'],
    12: ['december', 'décembre', 'decembre', 'dezember', 'dicembre', 'diciembre'],
};

/** Is this month named — in words or as a number — inside the quote? */
export const monthInQuote = (month, quote) => {
    const q = normalise(quote);
    if ((MONTHS[month] ?? []).some((name) => q.includes(name))) return true;
    // Numeric forms: 04/2026, 1/4, "du 4 au 10". Bare digits are accepted only
    // as a whole token, so month 1 does not match the 1 in "10h".
    return new RegExp(`(^|[^0-9])0?${month}([^0-9]|$)`).test(q);
};

/** Is this amount written in the quote? Tolerates 25, 25.00 and the French 25,00. */
export const amountInQuote = (amount, quote) => {
    const q = normalise(quote);
    const whole = Number.isInteger(amount) ? String(amount) : null;
    const forms = new Set([String(amount), amount.toFixed(2), amount.toFixed(2).replace('.', ',')]);
    if (whole) { forms.add(whole); forms.add(`${whole},00`); forms.add(`${whole}.00`); }
    return [...forms].some((form) => new RegExp(`(^|[^0-9.,])${form.replace('.', '\\.')}([^0-9]|$)`).test(q));
};

// ─── Claim validation ────────────────────────────────────────────────────────

/**
 * What only the caller can know. `pagesFetched[].text` is what the quote is
 * checked against; `storedSeason` raises a HOLD and is never shown to the model.
 *
 * @typedef {object} ValidationContext
 * @property {string|null} [operatorWebsiteUrl]
 * @property {string[]} [linkedFromT1]
 * @property {string[]} [institutionalHosts]
 * @property {Array<{url: string, fetchedAt: string, text?: string, sourceTier?: string, status?: number}>} [pagesFetched]
 * @property {{seasonStartMonth: number, seasonEndMonth: number}|null} [storedSeason]
 * @property {boolean} [seasonProvenanceStorable]
 */

/** @param {any} provenance @param {string} path @param {ValidationContext} ctx */
const validateProvenance = (provenance, path, ctx) => {
    const problems = [];
    if (!provenance || !provenance.sourceUrl || !provenance.observedAt || !provenance.sourceQuote) {
        problems.push({ code: 'E_NO_SOURCE', field: path, detail: 'sourceUrl, observedAt and sourceQuote are all required. An unsourced fact is never written.' });
        return problems;
    }

    const earned = resolveTier(provenance.sourceUrl, ctx);
    if (earned === null) {
        problems.push({
            code: 'E_SOURCE_TIER_DISALLOWED',
            field: `${path}.sourceUrl`,
            detail: `${provenance.sourceUrl} resolves to no allowed tier. A claimed tier is not a tier.`,
        });
        return problems;
    }
    if (provenance.sourceTier !== earned) {
        problems.push({
            code: 'E_SOURCE_TIER_DISALLOWED',
            field: `${path}.sourceTier`,
            detail: `Claimed ${provenance.sourceTier}, earned ${earned}.`,
        });
    }

    const page = (ctx.pagesFetched ?? []).find((p) => p.url === provenance.sourceUrl);
    if (!page) {
        problems.push({
            code: 'E_OBSERVED_AT_MISMATCH',
            field: `${path}.sourceUrl`,
            detail: 'Cited page is not in pagesFetched. A fact can only come from a page this run actually fetched.',
        });
        return problems;
    }
    if (page.fetchedAt !== provenance.observedAt) {
        problems.push({
            code: 'E_OBSERVED_AT_MISMATCH',
            field: `${path}.observedAt`,
            detail: `observedAt ${provenance.observedAt} is not the fetchedAt of that page (${page.fetchedAt}).`,
        });
    }

    // The fabrication check. Last, because it is the most expensive and the
    // checks above already tell you the claim is unusable.
    if (!quoteIsOnPage(provenance.sourceQuote, page.text ?? '')) {
        problems.push({
            code: 'E_QUOTE_NOT_FOUND',
            field: `${path}.sourceQuote`,
            detail: 'Quote does not appear on the cited page after whitespace normalisation. Treated as fabricated.',
        });
    }
    return problems;
};

/** One season claim. */
/** @param {any} season @param {ValidationContext} [ctx] */
export const validateSeason = (season, ctx = {}) => {
    const problems = [];
    if (!season) return problems;
    const { seasonStartMonth: start, seasonEndMonth: end } = season;

    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || start > 12 || end < 1 || end > 12) {
        problems.push({ code: 'E_MONTH_RANGE', field: 'season', detail: `Months must be integers 1-12; got ${start}, ${end}.` });
    } else if ((start > end) !== Boolean(season.wrapsYearEnd)) {
        problems.push({
            code: 'E_MONTH_RANGE',
            field: 'season.wrapsYearEnd',
            detail: `start ${start} / end ${end} implies wrapsYearEnd ${start > end}, claim says ${Boolean(season.wrapsYearEnd)}. A transposition must not pass silently.`,
        });
    }

    problems.push(...validateProvenance(season.provenance, 'season.provenance', ctx));
    problems.push(...scoreProblems(season.score, 'season'));

    // Only worth asking once the quote is known to be real.
    if (!problems.some((p) => p.code === 'E_QUOTE_NOT_FOUND' || p.code === 'E_NO_SOURCE')) {
        const quote = season.provenance.sourceQuote;
        for (const [label, month] of [['seasonStartMonth', start], ['seasonEndMonth', end]]) {
            if (Number.isInteger(month) && !monthInQuote(month, quote)) {
                problems.push({
                    code: 'E_VALUE_NOT_IN_QUOTE',
                    field: `season.${label}`,
                    detail: `Month ${month} is not named in the quote. Reading it off a calendar or inferring it from a photo caption is not a statement of opening.`,
                });
            }
        }
        if (season.yearRound === true && !/year.?round|toute l.année|ganzjährig|all year/i.test(normalise(quote))) {
            problems.push({
                code: 'E_YEAR_ROUND_INFERRED',
                field: 'season.yearRound',
                detail: 'yearRound must be stated on the page in words. Absence of a stated closure is not a statement of opening.',
            });
        }
    }
    return problems;
};

/** One price claim, at index `i`. */
/** @param {any} price @param {number} i @param {ValidationContext} [ctx] @param {Set<string>} [seenKeys] */
export const validatePrice = (price, i, ctx = {}, seenKeys = new Set()) => {
    const path = `prices[${i}]`;
    const problems = [];

    if (!PRICE_KINDS.includes(price.kind)) problems.push({ code: 'E_ENUM_INVALID', field: `${path}.kind`, detail: `${price.kind} is not a catalogue kind.` });
    if (!PRICE_TIERS.includes(price.tier)) problems.push({ code: 'E_ENUM_INVALID', field: `${path}.tier`, detail: `${price.tier} is not a catalogue tier.` });
    if (price.confidence !== 'STATED') problems.push({ code: 'E_ENUM_INVALID', field: `${path}.confidence`, detail: 'Only STATED may be written. A fact that is not stated is not written at all.' });
    if (!CURRENCIES.includes(price.currency)) problems.push({ code: 'E_CURRENCY_UNSUPPORTED', field: `${path}.currency`, detail: `${price.currency} is outside the catalogue's countries — likely the wrong page.` });
    if (!(typeof price.amount === 'number') || price.amount <= 0 || price.amount > MAX_AMOUNT) {
        problems.push({ code: 'E_AMOUNT_RANGE', field: `${path}.amount`, detail: `amount must be >0 and <=${MAX_AMOUNT}; got ${price.amount}.` });
    }

    const key = `${price.kind}|${price.tier}|${price.amount}|${price.durationMinutes ?? ''}`;
    if (seenKeys.has(key)) {
        problems.push({ code: 'E_DUPLICATE_ROW', field: path, detail: `Duplicate of an earlier row this run (${key}).` });
    }
    seenKeys.add(key);

    problems.push(...validateProvenance(price.provenance, `${path}.provenance`, ctx));
    problems.push(...scoreProblems(price.score, path));

    if (!problems.some((p) => p.code === 'E_QUOTE_NOT_FOUND' || p.code === 'E_NO_SOURCE')
        && typeof price.amount === 'number'
        && !amountInQuote(price.amount, price.provenance.sourceQuote)) {
        problems.push({
            code: 'E_VALUE_NOT_IN_QUOTE',
            field: `${path}.amount`,
            detail: `${price.amount} does not appear in the quote. A "from" price or a nearby figure is not this tariff.`,
        });
    }
    return problems;
};

// ─── Conflict ladder ─────────────────────────────────────────────────────────

/**
 * Which of two contradictory claims wins, per §5 of the contract.
 *
 * Returns the winner, or null meaning genuinely unresolved — which is a real
 * answer, not a failure to decide. A tie between two equally-sourced,
 * equally-dated, equally-explicit contradictory claims is ambiguity on the
 * operator's own site, and picking one is guessing with extra steps.
 */
export const resolveConflict = (a, b) => {
    const rank = (c) => TIER_RANK[c?.provenance?.sourceTier] ?? 0;
    if (rank(a) !== rank(b)) return rank(a) > rank(b) ? a : b;

    const at = Date.parse(a?.provenance?.observedAt ?? '');
    const bt = Date.parse(b?.provenance?.observedAt ?? '');
    if (Number.isFinite(at) && Number.isFinite(bt) && at !== bt) return at > bt ? a : b;

    const explicit = (c) => c?.score?.components?.valueExplicit ?? 0;
    if (explicit(a) !== explicit(b)) return explicit(a) > explicit(b) ? a : b;

    return null;
};

// ─── Verdict ─────────────────────────────────────────────────────────────────

/**
 * Validate one extraction emission and return what to do with it.
 *
 * `ctx` carries what only the caller can know: the pages it fetched (with their
 * text), the operator's website, the institutional allow-list, and the stored
 * values — which are used to raise a HOLD, never shown to the extractor.
 */
/** @param {any} output @param {ValidationContext} [ctx] */
export const validateExtraction = (output, ctx = {}) => {
    const problems = [];
    const holds = [];

    if (!output?.slug) problems.push({ code: 'E_NO_SOURCE', field: 'slug', detail: 'No slug; nothing to attach a fact to.' });

    if (output?.season) problems.push(...validateSeason(output.season, ctx));

    const seen = new Set();
    (output?.prices ?? []).forEach((price, i) => problems.push(...validatePrice(price, i, ctx, seen)));

    // Score bands, once the claim is otherwise sound.
    const band = (claim, path) => {
        const total = claim?.score?.total ?? 0;
        if (total < REVIEW_SCORE) {
            problems.push({ code: 'E_SCORE_BELOW_THRESHOLD', field: path, detail: `Score ${total} is below ${REVIEW_SCORE}.` });
        } else if (total < ACCEPT_SCORE) {
            holds.push({ code: 'H_SCORE_IN_REVIEW_BAND', field: path, detail: `Score ${total} is in the ${REVIEW_SCORE}-${ACCEPT_SCORE - 1} review band.` });
        }
    };
    if (output?.season) band(output.season, 'season');
    (output?.prices ?? []).forEach((price, i) => band(price, `prices[${i}]`));

    // A contradiction of a stored value that is still fresh is a HOLD, never an
    // overwrite: the stored value may be right, or it may be stale and the
    // extractor right (F8). Only a person with both pages open can say.
    if (output?.season && ctx.storedSeason
        && (ctx.storedSeason.seasonStartMonth !== output.season.seasonStartMonth
            || ctx.storedSeason.seasonEndMonth !== output.season.seasonEndMonth)) {
        holds.push({
            code: 'H_CONTRADICTS_STORED_VALUE',
            field: 'season',
            detail: `Stored ${ctx.storedSeason.seasonStartMonth}-${ctx.storedSeason.seasonEndMonth}, extracted ${output.season.seasonStartMonth}-${output.season.seasonEndMonth}. Triage against the cited page before scoring as an error.`,
        });
    }

    // The rollout guard: accepting a season while the columns do not exist yet
    // would drop the provenance on the floor and store a bare season, which is
    // the state this whole contract exists to end.
    if (output?.season && ctx.seasonProvenanceStorable === false) {
        holds.push({
            code: 'H_SEASON_PROVENANCE_UNSTORABLE',
            field: 'season',
            detail: 'Season provenance columns are not migrated yet (V21). Holding rather than storing a season whose source cannot be recorded.',
        });
    }

    const verdict = problems.length > 0 ? 'rejected' : holds.length > 0 ? 'hold' : 'accepted';
    return { verdict, reasons: [...problems, ...holds], rejected: problems, holds };
};
