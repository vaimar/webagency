/**
 * The parts of the extraction runner that do not touch the network.
 *
 * Page discovery, prompt construction, model-output parsing and the evaluation
 * arithmetic all live here so they can be tested against fixtures. The CLI in
 * `scripts/extract-catalogue-facts.mjs` does the IO — fetching pages, calling
 * the model, writing files — and nothing else.
 *
 * The split matters for one rule in particular: the prompt must never contain
 * the stored season or tariff. That is an architectural guarantee rather than a
 * habit, and it is only checkable if prompt construction is a pure function
 * that a test can read the output of.
 */

import { normalise, resolveTier, TIER_POINTS, amountInQuote, monthInQuote } from './extraction-validator.js';

// ─── Page discovery ──────────────────────────────────────────────────────────

/**
 * Words that mark a page as worth reading, in the catalogue's languages.
 *
 * The catalogue is 92 French spots plus CH/DE/BE/GB/TR/IT/LU/IE, so a
 * English-only keyword list would miss most of it — `tarifs` and `horaires`
 * carry more of this catalogue than `prices` does.
 */
export const PAGE_KEYWORDS = {
    prices: ['tarif', 'tarifs', 'prix', 'price', 'pricing', 'rates', 'preise', 'prezzi', 'precios', 'ucret'],
    season: ['horaire', 'horaires', 'ouverture', 'saison', 'infos-pratiques', 'informations',
        'opening', 'season', 'hours', 'oeffnungszeiten', 'offnungszeiten', 'orari', 'visit'],
};

/** Strip a page to comparable text. Not a parser — enough for a substring check. */
/**
 * Repair Windows-1252 bytes that were decoded as Latin-1.
 *
 * A French operator serving cp1252 without declaring it turns its euro sign
 * (byte 0x80) into U+0080, an unprintable control character. The page still
 * renders "€ 15" in a browser, so a model reading it quotes "€ 15" — and the
 * validator then cannot find that quote in text holding U+0080, and reports a
 * fabrication. That happened on exactly 8 tariff lines of one spot and produced
 * exactly 8 false F1s.
 *
 * The C1 block has no legitimate use in page text, so mapping it back to its
 * cp1252 meaning is safe: any character in this range is mojibake by
 * definition.
 */
const CP1252_C1 = {
    0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…', 0x86: '†', 0x87: '‡',
    0x88: 'ˆ', 0x89: '‰', 0x8A: 'Š', 0x8B: '‹', 0x8C: 'Œ', 0x8E: 'Ž',
    0x91: '\u2018', 0x92: '\u2019', 0x93: '\u201C', 0x94: '\u201D', 0x95: '•',
    0x96: '–', 0x97: '—', 0x98: '˜', 0x99: '™', 0x9A: 'š', 0x9B: '›', 0x9C: 'œ',
    0x9E: 'ž', 0x9F: 'Ÿ',
};

export const repairMojibake = (text) => (text ?? '').replace(
    /[\u0080-\u009F]/g,
    (ch) => CP1252_C1[ch.charCodeAt(0)] ?? '',
);

export const htmlToText = (html) => repairMojibake(html ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&([a-z]+);/gi, (whole, name) => ({
        eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç', ocirc: 'ô', ucirc: 'û',
        euro: '€', quot: '"', apos: "'", lt: '<', gt: '>',
    }[name.toLowerCase()] ?? whole))
    .replace(/[ \t\u00A0\u202F\u2009\u2007]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/** Absolute, same-site links found in a page, deduped and without fragments. */
export const sameSiteLinks = (html, baseUrl) => {
    let base;
    try { base = new URL(baseUrl); } catch { return []; }
    const found = new Map();
    for (const match of (html ?? '').matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
        let url;
        try { url = new URL(match[1], base); } catch { continue; }
        if (!/^https?:$/.test(url.protocol)) continue;
        if (url.hostname.replace(/^www\./, '') !== base.hostname.replace(/^www\./, '')) continue;
        url.hash = '';
        const key = url.toString();
        if (!found.has(key)) found.set(key, htmlToText(match[2]).slice(0, 120));
    }
    return [...found.entries()].map(([url, text]) => ({ url, text }));
};

/**
 * Rank candidate pages for the fields being extracted.
 *
 * Scores the URL path and the link text separately, because a French site as
 * often labels the link `Tarifs` over a path of `/page-2` as the other way
 * round. The homepage is always kept as a fallback: on a small operator site it
 * frequently IS the tariff page.
 */
export const rankCandidatePages = (html, baseUrl, targets = ['season', 'prices'], limit = 6) => {
    const keywords = targets.flatMap((t) => PAGE_KEYWORDS[t] ?? []);
    const scored = sameSiteLinks(html, baseUrl).map(({ url, text }) => {
        const path = normalise(decodeURIComponent(new URL(url).pathname));
        const label = normalise(text);
        let score = 0;
        for (const word of keywords) {
            if (path.includes(word)) score += 3;
            if (label.includes(word)) score += 2;
        }
        // Deep pages are usually a specific offer rather than the tariff table.
        score -= Math.max(0, new URL(url).pathname.split('/').filter(Boolean).length - 2);
        return { url, text, score };
    });
    const ranked = scored.filter((c) => c.score > 0).sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));
    const home = { url: baseUrl, text: 'homepage', score: 0 };
    return [home, ...ranked].slice(0, limit);
};

// ─── Prompt ──────────────────────────────────────────────────────────────────

export const SYSTEM_PROMPT = [
    'You extract facts from web pages for a travel catalogue. You are an extractor, not a source.',
    '',
    'Absolute rules:',
    '1. Report ONLY what the supplied page text literally says. You have no other knowledge of these places.',
    '2. Every fact must carry sourceQuote: a span copied VERBATIM from the page text, never paraphrased,',
    '   never translated, and long enough to contain the value itself.',
    '3. THE QUOTE IS ONE UNBROKEN RUN OF TEXT. Copy a single continuous passage exactly as it appears.',
    '   Never join two separated passages. Never bridge a gap with "..." or any other ellipsis.',
    '   If a value would need two passages that are apart on the page, do not emit that fact.',
    '4. EVERY VALUE YOU CLAIM MUST APPEAR INSIDE THE QUOTE YOU CITE FOR IT.',
    '   For a season this means the quote must name BOTH the first and the last operating month.',
    '   A quote naming only one of them supports only one of them, and is not enough for a season.',
    '5. Prefer emitting nothing to emitting a guess. An absent fact is a correct answer.',
    '6. Never infer a season from an events calendar, a photo caption, a single upcoming date,',
    '   or the absence of a stated closure.',
    '7. A "from"/"à partir de" figure is a floor, not a tariff. Do not emit it as one.',
    '8. Reply with a single JSON object and nothing else. No prose, no code fences.',
].join('\n');

/**
 * What a season actually looks like on these pages.
 *
 * Measured on the fixture set: of nine spots where the extractor returned no
 * season, most pages name four to eight months and NOT ONE contains an
 * "ouvert de X à Y" sentence. The season is published as an opening-hours table
 * with month headings — "AVRIL … MAI-JUIN … JUILLET-AOUT … SEPTEMBRE".
 *
 * The extractor was declining those because the instructions implied a
 * sentence. Naming the table as acceptable evidence raises recall without
 * touching provenance: the quote must still be one verbatim contiguous run, and
 * rule 4 still requires both month names inside it. What changes is only that
 * the extractor stops discarding evidence it was already reading.
 */
export const SEASON_GUIDANCE = [
    'FINDING THE OPENING SEASON. It is stated in one of two shapes, and both are acceptable:',
    '  (a) a sentence naming the range — "ouvert d\'avril à octobre";',
    '  (b) an opening-hours or schedule block whose headings are months —',
    '      "AVRIL / MAI - JUIN / JUILLET - AOUT / SEPTEMBRE" with times beside them.',
    'For shape (b), quote the block as one continuous run and set seasonStartMonth to the',
    'earliest operating month named inside your quote and seasonEndMonth to the latest.',
    'Only months shown as OPERATING periods count. A month appearing as a closure notice,',
    'a news item, or an event date is not an operating month.',
    'If neither shape is present, return no season. Do not assemble one from scattered mentions.',
].join('\n');

/**
 * Build the user prompt.
 *
 * Takes the spot's IDENTITY only — name, country, website. It is given no
 * stored season and no stored prices, deliberately and structurally: an
 * extractor told the answer will find it, and the eval would then measure the
 * prompt rather than the model. `buildPrompt` receiving no such argument is
 * what makes that guarantee inspectable.
 */
export const buildPrompt = (identity, pages, targets = ['season', 'prices'], charsPerPage = 6000) => {
    const wanted = [];
    if (targets.includes('season')) {
        wanted.push('- season: {seasonStartMonth, seasonEndMonth, yearRound, wrapsYearEnd, provenance:{sourceUrl,sourceTier,observedAt,sourceQuote,quoteLang}}');
    }
    if (targets.includes('prices')) {
        wanted.push('- prices: array of {kind,amount,currency,durationMinutes,perPerson,partySizeMin,partySizeMax,includesGear,tier,label,notes,confidence,provenance:{...}}');
        wanted.push(`  kind ∈ HOUR|HALF_DAY|DAY|SESSION|PACK|COACHING|GROUP_HIRE|ACCESS_BAND|MEMBERSHIP|GEAR_RENTAL`);
        wanted.push(`  tier ∈ STANDARD|CHILD|REDUCED|STUDENT|MEMBER|OFF_PEAK|PEAK ; confidence is always "STATED"`);
    }
    return [
        `Venue: ${identity.name} (${identity.country}). Official site: ${identity.websiteUrl ?? 'unknown'}.`,
        '',
        'Extract, if and only if the pages below state them:',
        ...wanted,
        '',
        'sourceUrl must be one of the page URLs below, and observedAt must be that page\'s fetchedAt, copied exactly.',
        'Months are numbers 1-12. Set wrapsYearEnd true only when the start month is later than the end month.',
        ...(targets.includes('season') ? ['', SEASON_GUIDANCE] : []),
        '',
        '--- PAGES ---',
        ...pages.map((page) => [
            `URL: ${page.url}`,
            `fetchedAt: ${page.fetchedAt}`,
            'TEXT:',
            (page.text ?? '').slice(0, charsPerPage),
            '---',
        ].join('\n')),
    ].join('\n');
};

/** Pull the JSON object out of a model reply that may still be wrapped. */
export const parseModelJson = (raw) => {
    const text = (raw ?? '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end <= start) return { ok: false, error: 'No JSON object in reply.' };
    try {
        return { ok: true, value: JSON.parse(text.slice(start, end + 1)) };
    } catch (error) {
        return { ok: false, error: `Reply was not valid JSON: ${String(error).slice(0, 160)}` };
    }
};


// ─── Scoring ─────────────────────────────────────────────────────────────────

/**
 * Compute a claim's confidence score from the rubric's own signals.
 *
 * The model does not supply this and never should. The rubric in §6 of the
 * contract is deterministic — source tier, whether the quote matched exactly,
 * whether the value is written out, how near the quote sits to its field label
 * — so a model asked to self-score would be guessing at inputs the pipeline can
 * simply measure. The first eval run failed on exactly this: 50 of the
 * rejections were `E_SCORE_BELOW_THRESHOLD`, because the schema demanded a
 * score the prompt never requested. Computing it here is the fix, and it also
 * makes the score trustworthy, which a self-reported one could never be.
 *
 * @param {{value?: number|null, month?: number|null, quote: string, sourceUrl: string}} claim
 * @param {{text?: string}} page
 * @param {{operatorWebsiteUrl?: string|null, linkedFromT1?: string[], institutionalHosts?: string[],
 *          corroborated?: boolean, fieldLabels?: string[]}} ctx
 */
export const scoreClaim = (claim, page, ctx = {}) => {
    const tier = resolveTier(claim.sourceUrl, ctx);
    const pageText = page?.text ?? '';
    const quote = claim.quote ?? '';

    const exact = pageText.includes(quote);
    const components = {
        sourceTier: TIER_POINTS[tier] ?? 0,
        quoteMatch: exact ? 25 : 20,
        valueExplicit: 0,
        fieldProximity: 0,
        corroborated: ctx.corroborated ? 5 : 0,
        penaltyAmbiguous: 0,
        penaltyPromoBlock: 0,
        penaltyUndatedSeasonal: 0,
    };

    // Explicit: the figure and its unit are written out. Half credit when the
    // value is there in words but the unit has to be inferred.
    if (typeof claim.value === 'number') {
        const hasNumeral = amountInQuote(claim.value, quote);
        const hasUnit = /[€$£₺]|eur|chf|gbp|try/i.test(quote);
        components.valueExplicit = hasNumeral && hasUnit ? 20 : hasNumeral ? 10 : 0;
    } else if (Number.isInteger(claim.month)) {
        const named = /[a-zà-ÿ]{3,}/i.test(quote) && monthInQuote(claim.month, quote);
        components.valueExplicit = named ? 20 : monthInQuote(claim.month, quote) ? 10 : 0;
    }

    // Proximity: the quote sits near a heading that names the field.
    const labels = ctx.fieldLabels ?? ['tarif', 'prix', 'price', 'horaire', 'ouverture', 'saison', 'season', 'opening'];
    const at = normalise(pageText).indexOf(normalise(quote));
    if (at >= 0) {
        const around = normalise(pageText).slice(Math.max(0, at - 200), at + quote.length + 200);
        if (labels.some((label) => around.includes(label))) components.fieldProximity = 10;
    }

    // Penalties.
    if (/à partir de|from |ab |a partire da|desde /i.test(quote)) components.penaltyPromoBlock = -10;
    if (/promo|offre|réduction|special offer/i.test(quote)) components.penaltyPromoBlock = -10;
    if (Number.isInteger(claim.month) && !/20\d\d/.test(pageText)) components.penaltyUndatedSeasonal = -10;

    const total = Object.values(components).reduce((sum, v) => sum + v, 0);
    return { total: Math.max(0, Math.min(100, total)), components };
};

/**
 * Attach computed scores to a model's output, in place of whatever it sent.
 *
 * Also normalises the two fields models most often get wrong in this catalogue:
 * a currency written as its symbol, and a tier written in the operator's own
 * language. Both are mapped only where the mapping is unambiguous — an
 * unrecognised value is left alone so the validator rejects it by name rather
 * than being quietly repaired into something plausible.
 */
export const applyPipelineScores = (output, pages, ctx = {}) => {
    const pageFor = (url) => pages.find((p) => p.url === url) ?? { text: '' };
    const CURRENCY_SYMBOLS = { '€': 'EUR', '£': 'GBP', '₺': 'TRY', 'CHF': 'CHF', 'chf': 'CHF' };

    /**
     * The tier is resolved, never accepted from the model.
     *
     * The contract already says "a claimed tier is not a tier", and the
     * validator enforced that by REJECTING a mismatch — which turned every
     * model that wrote "official" instead of "T1_OPERATOR" into 91 apparent
     * misattributions while citing entirely correct operator URLs. The claim
     * was never evidence; asking for it and then failing on its wording
     * measured vocabulary, not honesty.
     *
     * Resolution is by URL against the catalogue's own websiteUrl, so a genuine
     * misattribution — a review site, another operator's domain — still resolves
     * to null and is still rejected. What is gone is the false positive.
     */
    const setTier = (provenance) => {
        if (!provenance?.sourceUrl) return;
        provenance.sourceTier = resolveTier(provenance.sourceUrl, ctx) ?? provenance.sourceTier;
    };

    if (output?.season?.provenance) {
        setTier(output.season.provenance);
        output.season.score = scoreClaim({
            month: output.season.seasonStartMonth,
            quote: output.season.provenance.sourceQuote ?? '',
            sourceUrl: output.season.provenance.sourceUrl ?? '',
        }, pageFor(output.season.provenance.sourceUrl), ctx);
    }

    for (const price of output?.prices ?? []) {
        if (CURRENCY_SYMBOLS[price.currency]) price.currency = CURRENCY_SYMBOLS[price.currency];
        if (price.provenance) {
            setTier(price.provenance);
            price.score = scoreClaim({
                value: price.amount,
                quote: price.provenance.sourceQuote ?? '',
                sourceUrl: price.provenance.sourceUrl ?? '',
            }, pageFor(price.provenance.sourceUrl), ctx);
        }
    }
    return output;
};

// ─── Evaluation ──────────────────────────────────────────────────────────────

/**
 * Map a validator rejection to the contract's failure taxonomy.
 *
 * F1 and F2 are the zero-tolerance classes and both are detected mechanically,
 * which is the point of writing them as validator rules rather than as review
 * guidance. F3–F5 cannot be — they need a person with the page open — so they
 * are never inferred here.
 */
export const failureClassOf = (code) => ({
    E_QUOTE_NOT_FOUND: 'F1',
    E_VALUE_NOT_IN_QUOTE: 'F1',
    E_YEAR_ROUND_INFERRED: 'F1',
    E_SOURCE_TIER_DISALLOWED: 'F2',
    E_OBSERVED_AT_MISMATCH: 'F2',
}[code] ?? null);

/**
 * @typedef {{class: string, code: string, field?: string, detail?: string}} EvalFailure
 * @typedef {{key: string, field: string, label: string, stored: string, extracted: string,
 *            sourceUrl?: string, sourceQuote?: string, question: string}} TriageItem
 * @typedef {{code: string, detail?: string, attempts?: number}} TransportFailure
 * @typedef {{slug: string, verdict: string, failures: EvalFailure[],
 *            pendingTriage: TriageItem[],
 *            matched: {season: boolean|null, prices: number},
 *            storedPriceCount: number,
 *            transport?: TransportFailure|null}} Comparison
 */

/**
 * Score one eval spot against what the catalogue already holds.
 *
 * Returns `pendingTriage` for every disagreement rather than an error count.
 * The stored values were entered by hand on a date now months old, so a
 * disagreement is as likely to be F8 — the catalogue stale, the extractor right
 * — as it is to be a mistake. Scoring it before someone opens the cited page
 * would reject a working pipeline.
 */
/** @returns {Comparison} */
export const compareToStored = (result, stored) => {
    /** @type {Comparison} */
    const out = { slug: result.slug, verdict: result.verdict, failures: [], pendingTriage: [],
        matched: { season: null, prices: 0 }, storedPriceCount: (stored?.prices ?? []).length,
        // A run that never reached the validator is excluded from every quality
        // denominator below. Counting it as a recall miss would blame the model
        // for a rate limit.
        transport: result.transport ?? null };

    for (const reason of result.rejected ?? []) {
        const cls = failureClassOf(reason.code);
        if (cls) out.failures.push({ class: cls, code: reason.code, field: reason.field, detail: reason.detail });
    }

    // A claim the validator already threw out is not a disagreement to triage.
    // The first eval run put 23 items on the operator's worklist, most of them
    // already mechanically rejected for a null month or an invented tier —
    // asking a person to open a page for those wastes the scarcest resource in
    // this pipeline.
    const rejectedField = (prefix) => (result.rejected ?? []).some((r) => (r.field ?? '').startsWith(prefix));

    if (result.output?.season && stored?.seasonStartMonth != null
        && Number.isInteger(result.output.season.seasonStartMonth)
        && !rejectedField('season')) {
        const same = result.output.season.seasonStartMonth === stored.seasonStartMonth
            && result.output.season.seasonEndMonth === stored.seasonEndMonth;
        out.matched.season = same;
        if (!same) {
            out.pendingTriage.push({
                /**
                 * Addressed by field PATH, not by a human label.
                 *
                 * The label was the key until a park with ten gear-rental rows
                 * collapsed all ten into one `price GEAR_RENTAL/STANDARD`
                 * entry: 29 of 54 items vanished from the worklist, and the one
                 * decision an operator did make would have been applied to
                 * every collided row without them ever seeing it.
                 */
                key: `${result.slug}:season`,
                field: 'season',
                label: 'season',
                stored: `${stored.seasonStartMonth}-${stored.seasonEndMonth}`,
                extracted: `${result.output.season.seasonStartMonth}-${result.output.season.seasonEndMonth}`,
                sourceUrl: result.output.season.provenance?.sourceUrl,
                sourceQuote: result.output.season.provenance?.sourceQuote,
                question: 'Open the cited page. Does it state the extracted months? If yes this is F8 (catalogue stale). If no, classify F3/F4/F5.',
            });
        }
    }

    for (const [index, price] of (result.output?.prices ?? []).entries()) {
        if (rejectedField(`prices[${index}]`)) continue;
        const hit = (stored?.prices ?? []).find((p) => p.kind === price.kind && p.tier === price.tier
            && Math.abs((p.amount ?? 0) - price.amount) < 0.005 && p.currency === price.currency);
        if (hit) { out.matched.prices += 1; continue; }
        out.pendingTriage.push({
            key: `${result.slug}:prices[${index}]`,
            field: `prices[${index}]`,
            label: `price ${price.kind}/${price.tier}`,
            stored: (stored?.prices ?? []).filter((p) => p.kind === price.kind && p.tier === price.tier)
                .map((p) => `${p.amount} ${p.currency}`).join(', ') || 'none of this kind/tier',
            extracted: `${price.amount} ${price.currency}`,
            sourceUrl: price.provenance?.sourceUrl,
            sourceQuote: price.provenance?.sourceQuote,
            question: 'Open the cited page. Is the extracted figure the ordinary rate for this kind and tier today?',
        });
    }
    return out;
};

/**
 * The go/no-go gate, computed from per-spot comparisons plus triage decisions.
 *
 * `triage` maps a pendingTriage key to 'F8' (catalogue stale, not an error) or
 * an F3/F4/F5 code (an error). Anything left untriaged makes the gate
 * INCONCLUSIVE — never a pass. A gate that passes because nobody looked is
 * worse than no gate.
 */
/** @param {Comparison[]} comparisons @param {Record<string,string>} [triage] */
export const computeGate = (comparisons, triage = {}) => {
    const f = (cls) => comparisons.reduce((n, c) => n + c.failures.filter((x) => x.class === cls).length, 0);
    // Quality is measured over the runs that produced something to judge.
    // Recall over a denominator padded with rate-limited runs is a statement
    // about the API, and the first matrix made exactly that mistake.
    const judged = comparisons.filter((c) => !c.transport);

    const untriaged = [];
    let triagedErrors = 0;
    let f8 = 0;

    for (const comparison of comparisons) {
        for (const item of comparison.pendingTriage) {
            const key = item.key ?? `${comparison.slug}:${item.field}`;
            const decision = triage[key];
            if (!decision) { untriaged.push(key); continue; }
            if (decision === 'F8') f8 += 1; else triagedErrors += 1;
        }
    }

    const acceptedPrices = comparisons.reduce((n, c) => n + c.matched.prices, 0);
    const pricesJudged = acceptedPrices + triagedErrors;
    const pricePrecision = pricesJudged > 0 ? acceptedPrices / pricesJudged : null;

    const seasonsChecked = comparisons.filter((c) => c.matched.season !== null);
    const seasonErrors = seasonsChecked.filter((c) => c.matched.season === false
        && triage[`${c.slug}:season`] && triage[`${c.slug}:season`] !== 'F8').length;
    // `${slug}:season` is already unique, so the key form above matches what
    // compareToStored emits for a season item.
    const seasonRecall = judged.length > 0 ? seasonsChecked.length / judged.length : 0;
    const holdRate = judged.length > 0
        ? judged.filter((c) => c.verdict === 'hold').length / judged.length : 0;

    /**
     * A gate with nothing to judge reports `n/a`, never `pass`.
     *
     * The first real run extracted nothing at all — every spot rejected — and
     * four of six gates printed PASS, because zero fabrications out of zero
     * extractions is technically zero. That reads as "mostly working" for a
     * pipeline that produced no facts. A criterion with an empty sample has not
     * been met; it has not been tested, and the two must not look alike.
     */
    const gate = (name, value, ok, target, judged) => ({
        name, value, target, judged,
        pass: judged ? ok : null,
    });

    const anyExtraction = comparisons.some((c) => c.matched.season !== null || c.matched.prices > 0)
        || pricesJudged > 0;


    const gates = [
        gate('F1 fabrications', f('F1'), f('F1') === 0, '0', anyExtraction || f('F1') > 0),
        gate('F2 misattributions', f('F2'), f('F2') === 0, '0', anyExtraction || f('F2') > 0),
        gate('price precision', pricePrecision, (pricePrecision ?? 0) >= 0.95, '>= 0.95', pricesJudged > 0),
        gate('season month errors', seasonErrors, seasonErrors === 0, '0', seasonsChecked.length > 0),
        gate('hold rate', holdRate, holdRate <= 0.30, '<= 0.30', judged.length > 0),
        // Always judged: recall over zero extractions is a real zero, and it is
        // the gate that catches a pipeline that produced nothing.
        gate('season recall', seasonRecall, seasonRecall >= 0.60, '>= 0.60', judged.length > 0),
    ];

    const untested = gates.filter((g) => g.pass === null).map((g) => g.name);
    const failed = gates.some((g) => g.pass === false);

    const transportFailures = comparisons.filter((c) => c.transport);
    return {
        gates,
        f8,
        untriaged,
        untested,
        // Reported alongside the gates, never inside them.
        transport: {
            failures: transportFailures.length,
            rate: comparisons.length > 0 ? transportFailures.length / comparisons.length : 0,
            reachedValidator: judged.length,
            byCode: transportFailures.reduce((tally, c) => {
                tally[c.transport.code] = (tally[c.transport.code] ?? 0) + 1;
                return tally;
            }, {}),
        },
        // Order matters: a real failure is a NO-GO even if other gates were
        // untested, but untested gates can never add up to a GO.
        // Transport first: if most runs never reached the validator, the
        // result is a statement about the API and must not read as a verdict
        // on the model, in either direction.
        verdict: judged.length < comparisons.length / 2 ? 'INCONCLUSIVE-TRANSPORT'
            : failed ? 'NO-GO'
                : untriaged.length > 0 ? 'INCONCLUSIVE'
                    : untested.length > 0 ? 'INCONCLUSIVE'
                        : 'GO',
    };
};
