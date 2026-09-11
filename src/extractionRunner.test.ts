/**
 * The runner's pure logic — page discovery, prompt construction, model-output
 * parsing, and the gate arithmetic.
 *
 * The prompt test is the important one here. "The model never sees the stored
 * value" is an architectural claim, and this is where it stops being a claim.
 */
import {
    htmlToText, sameSiteLinks, rankCandidatePages, buildPrompt, parseModelJson,
    compareToStored, computeGate, failureClassOf, scoreClaim, applyPipelineScores,
    SYSTEM_PROMPT, SEASON_GUIDANCE, repairMojibake,
} from '../extraction-runner.js';
import { TRANSPORT_CODES, isTransportCode } from '../extraction-validator.js';

const HOME = 'https://www.rouffiac-teleski.com/';
const html = `
  <html><body>
    <a href="/tarifs/">Nos tarifs</a>
    <a href="/infos-pratiques/">Horaires et ouverture</a>
    <a href="/galerie/photos/2024/">Galerie</a>
    <a href="https://facebook.com/rouffiac">Facebook</a>
    <p>Ouvert d&#39;avril &agrave; octobre.</p>
  </body></html>`;

describe('htmlToText', () => {
    it('drops scripts and decodes the entities French pages actually use', () => {
        const text = htmlToText('<script>var a=1</script><p>Ouvert d&#39;avril &agrave; octobre &euro;</p>');
        expect(text).toContain("Ouvert d'avril à octobre €");
        expect(text).not.toContain('var a');
    });
});

describe('mojibake repair', () => {
    it('restores a euro sign that arrived as a C1 control character', () => {
        // etoilepark26.fr serves cp1252 undeclared: byte 0x80 decodes to U+0080,
        // so "€ 15" becomes "\u0080 15" and every quote citing it looks fabricated.
        expect(repairMojibake('1H AQUAPARK \u0080 15')).toBe('1H AQUAPARK € 15');
    });

    it('restores the other cp1252 punctuation that lands in the same range', () => {
        expect(repairMojibake('d\u0092avril')).toBe('d\u2019avril');
        expect(repairMojibake('\u0093ouvert\u0094')).toBe('\u201Couvert\u201D');
    });

    it('drops an unassigned C1 char rather than leaving an unmatchable one', () => {
        expect(repairMojibake('a\u0081b')).toBe('ab');
    });

    it('leaves ordinary text alone', () => {
        expect(repairMojibake("Ouvert d'avril à octobre — 25 €")).toBe("Ouvert d'avril à octobre — 25 €");
    });
});

describe('link discovery', () => {
    it('keeps same-site links and drops off-site ones', () => {
        const urls = sameSiteLinks(html, HOME).map((l) => l.url);
        expect(urls).toContain('https://www.rouffiac-teleski.com/tarifs/');
        expect(urls.some((u) => u.includes('facebook'))).toBe(false);
    });

    it('ranks tariff and opening pages above a photo gallery, homepage always kept', () => {
        const ranked = rankCandidatePages(html, HOME, ['season', 'prices'], 6).map((c) => c.url);
        expect(ranked[0]).toBe(HOME);
        expect(ranked).toContain('https://www.rouffiac-teleski.com/tarifs/');
        expect(ranked).toContain('https://www.rouffiac-teleski.com/infos-pratiques/');
        expect(ranked).not.toContain('https://www.rouffiac-teleski.com/galerie/photos/2024/');
    });

    it('scores French keywords, not just English ones — 92 of 122 spots are French', () => {
        const frOnly = '<a href="/tarifs/">x</a><a href="/horaires/">y</a>';
        const ranked = rankCandidatePages(frOnly, HOME, ['season', 'prices'], 6).map((c) => c.url);
        expect(ranked).toContain('https://www.rouffiac-teleski.com/tarifs/');
        expect(ranked).toContain('https://www.rouffiac-teleski.com/horaires/');
    });
});

describe('prompt', () => {
    const pages = [{ url: `${HOME}tarifs/`, fetchedAt: '2026-09-08T09:00:00Z', text: '1 heure — 25 €' }];

    it('carries the pages and their fetchedAt, so observedAt can be copied not invented', () => {
        const prompt = buildPrompt({ name: 'Rouffiac', country: 'FR', websiteUrl: HOME }, pages);
        expect(prompt).toContain('1 heure — 25 €');
        expect(prompt).toContain('fetchedAt: 2026-09-08T09:00:00Z');
    });

    it('forbids the ellipsis-stitched quote that produced a fabrication', () => {
        // lakecity-fr cited "Avril (à partir du 12/04) ... Octobre" — a span
        // that exists nowhere on the page because the model built it.
        expect(SYSTEM_PROMPT).toMatch(/ONE UNBROKEN RUN/);
        expect(SYSTEM_PROMPT).toMatch(/ellipsis/i);
    });

    it('requires both months inside the cited quote', () => {
        // etoile-park-26-fr claimed 5-9 while quoting only "Ouverture … le 7 mai".
        expect(SYSTEM_PROMPT).toMatch(/BOTH the first and the last operating month/);
    });

    it('names the schedule-table shape, and only for season targets', () => {
        const pages = [{ url: `${HOME}tarifs/`, fetchedAt: '2026-09-08T09:00:00Z', text: '1 heure — 25 €' }];
        const withSeason = buildPrompt({ name: 'x', country: 'FR', websiteUrl: HOME }, pages, ['season']);
        const pricesOnly = buildPrompt({ name: 'x', country: 'FR', websiteUrl: HOME }, pages, ['prices']);
        expect(withSeason).toContain(SEASON_GUIDANCE);
        expect(pricesOnly).not.toContain(SEASON_GUIDANCE);
    });

    it('still refuses to assemble a season from scattered mentions', () => {
        // Raising recall must not become licence to infer.
        expect(SEASON_GUIDANCE).toMatch(/Do not assemble one from scattered mentions/);
        expect(SEASON_GUIDANCE).toMatch(/not an operating month/);
    });

    it('cannot leak a stored value, because it is never given one', () => {
        // buildPrompt takes identity + pages. There is no parameter through
        // which a season or a tariff could arrive, and this test fails the
        // moment someone adds one and passes the record straight in.
        const prompt = buildPrompt({ name: 'Rouffiac', country: 'FR', websiteUrl: HOME }, pages);
        expect(prompt).not.toMatch(/seasonStartMonth"?\s*[:=]\s*\d/);
        expect(buildPrompt.length).toBeLessThanOrEqual(4);
    });

    it('truncates a long page rather than sending an unbounded prompt', () => {
        const long = [{ url: HOME, fetchedAt: '2026-09-08T09:00:00Z', text: 'x'.repeat(20000) }];
        expect(buildPrompt({ name: 'a', country: 'FR', websiteUrl: HOME }, long, ['season'], 500).length).toBeLessThan(3000);
    });
});

describe('parseModelJson', () => {
    it('survives a fenced reply', () => {
        expect(parseModelJson('```json\n{"a":1}\n```')).toEqual({ ok: true, value: { a: 1 } });
    });

    it('survives prose either side of the object', () => {
        expect(parseModelJson('Here you go: {"a":1} hope that helps')).toEqual({ ok: true, value: { a: 1 } });
    });

    it('reports a reply with no object rather than throwing', () => {
        expect(parseModelJson('I could not find any prices.').ok).toBe(false);
    });
});

describe('failure classes', () => {
    it('maps the mechanical rejections to F1 and F2', () => {
        expect(failureClassOf('E_QUOTE_NOT_FOUND')).toBe('F1');
        expect(failureClassOf('E_SOURCE_TIER_DISALLOWED')).toBe('F2');
        // F3-F5 need a person with the page open and are never inferred.
        expect(failureClassOf('E_ENUM_INVALID')).toBeNull();
    });
});

describe('scoreClaim — measured, never self-reported', () => {
    const page = { text: 'Tarifs 2026. 1 heure — 25 € (gilet fourni). Ouvert d\'avril à octobre.' };
    const ctx = { operatorWebsiteUrl: HOME };

    it('gives a T1 exact-quote explicit price the top band', () => {
        const score = scoreClaim({ value: 25, quote: '1 heure — 25 €', sourceUrl: `${HOME}tarifs/` }, page, ctx);
        expect(score.components.sourceTier).toBe(40);
        expect(score.components.quoteMatch).toBe(25);
        expect(score.components.valueExplicit).toBe(20);
        expect(score.total).toBeGreaterThanOrEqual(80);
    });

    it('penalises a "from" price so it cannot auto-accept', () => {
        const score = scoreClaim({ value: 25, quote: 'à partir de 25 €', sourceUrl: `${HOME}tarifs/` },
            { text: 'à partir de 25 €' }, ctx);
        expect(score.components.penaltyPromoBlock).toBe(-10);
    });

    it('scores an off-tier source low enough that it can never auto-accept', () => {
        const score = scoreClaim({ value: 25, quote: '1 heure — 25 €', sourceUrl: 'https://elsewhere.example/x' }, page, ctx);
        expect(score.components.sourceTier).toBe(0);
        expect(score.total).toBeLessThan(80);
    });

    it('totals equal the sum of components, which is what makes it auditable', () => {
        const score = scoreClaim({ month: 4, quote: "Ouvert d'avril à octobre.", sourceUrl: `${HOME}` }, page, ctx);
        expect(Object.values(score.components).reduce((a, b) => a + b, 0)).toBe(score.total);
    });
});

describe('applyPipelineScores', () => {
    const pages = [{ url: `${HOME}tarifs/`, text: 'Tarifs. 1 heure — 25 €' }];

    it('replaces whatever the model sent with a measured score', () => {
        // The model's self-reported 100 must not survive: `components: {}` here
        // is the shape a model actually sent in the first eval run.
        const output = { prices: [{ amount: 25, currency: 'EUR', score: { total: 100, components: {} },
            provenance: { sourceUrl: `${HOME}tarifs/`, sourceQuote: '1 heure — 25 €' } }] };
        applyPipelineScores(output, pages, { operatorWebsiteUrl: HOME });
        const score = output.prices[0].score as { total: number; components: Record<string, number> };
        expect(score.total).not.toBe(100);
        expect(score.components.sourceTier).toBe(40);
    });

    it('resolves the source tier instead of trusting the model\'s word for it', () => {
        // Models write "official", "primary", "OFFICIAL". Rejecting those as
        // misattribution produced 91 false F2s against correct operator URLs.
        const output = { prices: [{ amount: 25, currency: 'EUR',
            provenance: { sourceUrl: `${HOME}tarifs/`, sourceTier: 'official', sourceQuote: '1 heure — 25 €' } }] };
        applyPipelineScores(output, pages, { operatorWebsiteUrl: HOME });
        expect(output.prices[0].provenance.sourceTier).toBe('T1_OPERATOR');
    });

    it('still leaves a genuinely unresolvable source unresolved', () => {
        // A review site resolves to no tier, so the validator rejects it —
        // real misattribution survives the fix.
        const output = { prices: [{ amount: 25, currency: 'EUR',
            provenance: { sourceUrl: 'https://www.tripadvisor.fr/x', sourceTier: 'official', sourceQuote: 'x' } }] };
        applyPipelineScores(output, [{ url: 'https://www.tripadvisor.fr/x', text: 'x' }], { operatorWebsiteUrl: HOME });
        expect(output.prices[0].provenance.sourceTier).toBe('official');
    });

    it('maps a currency symbol, which models emit constantly', () => {
        const output = { prices: [{ amount: 25, currency: '€',
            provenance: { sourceUrl: `${HOME}tarifs/`, sourceQuote: '1 heure — 25 €' } }] };
        applyPipelineScores(output, pages, { operatorWebsiteUrl: HOME });
        expect(output.prices[0].currency).toBe('EUR');
    });

    it('leaves an unrecognised value alone so the validator names it', () => {
        // Quietly repairing "ADULTE" into STANDARD would invent a fact.
        const output = { prices: [{ amount: 25, currency: 'XYZ', tier: 'ADULTE',
            provenance: { sourceUrl: `${HOME}tarifs/`, sourceQuote: '1 heure — 25 €' } }] };
        applyPipelineScores(output, pages, { operatorWebsiteUrl: HOME });
        expect(output.prices[0].currency).toBe('XYZ');
        expect(output.prices[0].tier).toBe('ADULTE');
    });
});

describe('comparison against stored values', () => {
    const stored = {
        seasonStartMonth: 4, seasonEndMonth: 10,
        prices: [{ kind: 'HOUR', tier: 'STANDARD', amount: 25, currency: 'EUR' }],
    };
    const result = (over: Record<string, unknown> = {}) => ({
        slug: 'x', verdict: 'accepted', rejected: [], output: {
            season: { seasonStartMonth: 4, seasonEndMonth: 10, provenance: { sourceUrl: HOME, sourceQuote: 'q' } },
            prices: [{ kind: 'HOUR', tier: 'STANDARD', amount: 25, currency: 'EUR', provenance: { sourceUrl: HOME, sourceQuote: 'q' } }],
        }, ...over,
    });

    it('counts an exact agreement as matched, with nothing to triage', () => {
        const out = compareToStored(result(), stored);
        expect(out.matched).toEqual({ season: true, prices: 1 });
        expect(out.pendingTriage).toEqual([]);
    });

    it('does NOT score a disagreement — it queues it for triage against the page', () => {
        const out = compareToStored(result({
            output: { season: { seasonStartMonth: 5, seasonEndMonth: 9, provenance: { sourceUrl: HOME, sourceQuote: 'mai à septembre' } }, prices: [] },
        }), stored);
        expect(out.failures).toEqual([]);
        expect(out.pendingTriage).toHaveLength(1);
        expect(out.pendingTriage[0].sourceQuote).toBe('mai à septembre');
    });

    it('gives every triage item a unique key, so none is silently merged', () => {
        // Ten gear-rental rows on one park collapsed into a single
        // `price GEAR_RENTAL/STANDARD` key: 29 of 54 items vanished from the
        // worklist and one decision would have covered all of them unseen.
        const out = compareToStored({
            slug: 'x', verdict: 'accepted', rejected: [],
            output: { prices: [
                { kind: 'GEAR_RENTAL', tier: 'STANDARD', amount: 5, currency: 'EUR', provenance: {} },
                { kind: 'GEAR_RENTAL', tier: 'STANDARD', amount: 9, currency: 'EUR', provenance: {} },
                { kind: 'GEAR_RENTAL', tier: 'STANDARD', amount: 12, currency: 'EUR', provenance: {} },
            ] },
        }, { seasonStartMonth: 4, seasonEndMonth: 10, prices: [] });

        expect(out.pendingTriage).toHaveLength(3);
        expect(new Set(out.pendingTriage.map((t) => t.key)).size).toBe(3);
        // The human-facing label may repeat; the key may not.
        expect(new Set(out.pendingTriage.map((t) => t.label)).size).toBe(1);
    });

    it('applies a triage decision to exactly one item', () => {
        const comparison = {
            slug: 'x', verdict: 'accepted', failures: [],
            matched: { season: true, prices: 0 }, storedPriceCount: 0,
            pendingTriage: [
                { key: 'x:prices[0]', field: 'prices[0]', label: 'price GEAR_RENTAL/STANDARD', stored: 'none', extracted: '5 EUR', question: 'q' },
                { key: 'x:prices[1]', field: 'prices[1]', label: 'price GEAR_RENTAL/STANDARD', stored: 'none', extracted: '9 EUR', question: 'q' },
            ],
        };
        const gate = computeGate([comparison], { 'x:prices[0]': 'F8' });
        expect(gate.f8).toBe(1);
        expect(gate.untriaged).toEqual(['x:prices[1]']);
    });

    it('does not put an already-rejected claim on the operator worklist', () => {
        const out = compareToStored({
            slug: 'x', verdict: 'rejected',
            rejected: [{ code: 'E_ENUM_INVALID', field: 'prices[0].tier', detail: 'ADULTE' }],
            output: { prices: [{ kind: 'SESSION', tier: 'ADULTE', amount: 650, currency: 'EUR', provenance: {} }] },
        }, stored);
        expect(out.pendingTriage).toEqual([]);
    });

    it('treats a season with null months as a miss, not a disagreement', () => {
        const out = compareToStored({
            slug: 'x', verdict: 'rejected',
            rejected: [{ code: 'E_MONTH_RANGE', field: 'season', detail: 'null' }],
            output: { season: { seasonStartMonth: null, seasonEndMonth: null, provenance: {} }, prices: [] },
        }, stored);
        expect(out.pendingTriage).toEqual([]);
        expect(out.matched.season).toBeNull();
    });

    it('records a fabrication as F1 without needing a human', () => {
        const out = compareToStored(result({
            verdict: 'rejected',
            rejected: [{ code: 'E_QUOTE_NOT_FOUND', field: 'season', detail: 'not on page' }],
        }), stored);
        expect(out.failures.map((f) => f.class)).toEqual(['F1']);
    });
});

describe('transport is not extraction quality', () => {
    it('registers the request-timeout code and keeps it out of quality scoring', () => {
        expect(TRANSPORT_CODES).toContain('T_REQUEST_TIMEOUT');
        expect(failureClassOf('T_REQUEST_TIMEOUT')).toBeNull();
        expect(isTransportCode('T_REQUEST_TIMEOUT')).toBe(true);
    });

    it('a timed-out run is excluded from the quality denominators', () => {
        // `clean` lives in the gate suite; this one is local so the transport
        // rules can be read without cross-referencing another describe block.
        const judged = {
            slug: 's', verdict: 'accepted', failures: [], pendingTriage: [],
            matched: { season: true, prices: 2 }, storedPriceCount: 2,
        };
        const gate = computeGate([
            judged,
            { slug: 'hung', verdict: 'transport-failed', failures: [], pendingTriage: [],
                matched: { season: null, prices: 0 }, storedPriceCount: 0,
                transport: { code: 'T_REQUEST_TIMEOUT', attempts: 1 } },
        ]);
        // One judged spot, one never answered: recall is 1/1, not 1/2.
        expect(gate.gates.find((g) => g.name === 'season recall')?.value).toBe(1);
        expect(gate.transport.byCode).toEqual({ T_REQUEST_TIMEOUT: 1 });
    });

    it('no transport code maps to an F-class failure', () => {
        // F1/F2 are zero-tolerance gates. A rate limit must never trip one.
        for (const code of TRANSPORT_CODES) expect(failureClassOf(code)).toBeNull();
    });

    it('recognises transport codes and nothing else', () => {
        expect(isTransportCode('T_RATE_LIMITED')).toBe(true);
        expect(isTransportCode('E_QUOTE_NOT_FOUND')).toBe(false);
    });

    it('excludes a transport failure from the comparison denominators', () => {
        const out = compareToStored(
            { slug: 'x', verdict: 'transport-failed', transport: { code: 'T_RATE_LIMITED', attempts: 4 }, rejected: [], output: null },
            { seasonStartMonth: 4, seasonEndMonth: 10, prices: [] },
        );
        expect(out.transport?.code).toBe('T_RATE_LIMITED');
        expect(out.failures).toEqual([]);
        expect(out.pendingTriage).toEqual([]);
    });
});

describe('the gate', () => {
    const clean = (over: Record<string, unknown> = {}) => ({
        slug: 's', verdict: 'accepted', failures: [], pendingTriage: [],
        matched: { season: true, prices: 2 }, storedPriceCount: 2, ...over,
    });

    it('passes when everything agrees', () => {
        expect(computeGate([clean(), clean({ slug: 't' })]).verdict).toBe('GO');
    });

    it('is INCONCLUSIVE, never GO, while a disagreement is untriaged', () => {
        const gate = computeGate([clean({ pendingTriage: [{ field: 'season' }], matched: { season: false, prices: 2 } })]);
        expect(gate.verdict).toBe('INCONCLUSIVE');
        expect(gate.untriaged).toEqual(['s:season']);
    });

    it('a triaged F8 clears the gate — the catalogue was stale, not the extractor wrong', () => {
        const comparisons = [clean({ pendingTriage: [{ field: 'season' }], matched: { season: false, prices: 2 } })];
        const gate = computeGate(comparisons, { 's:season': 'F8' });
        expect(gate.f8).toBe(1);
        expect(gate.verdict).toBe('GO');
    });

    it('a triaged F4 counts against precision and fails the gate', () => {
        const comparisons = [clean({ pendingTriage: [{ field: 'price HOUR/STANDARD' }], matched: { season: true, prices: 0 } })];
        const gate = computeGate(comparisons, { 's:price HOUR/STANDARD': 'F4' });
        expect(gate.verdict).toBe('NO-GO');
        expect(gate.gates.find((g) => g.name === 'price precision')?.pass).toBe(false);
    });

    it('reports a gate with nothing to judge as n/a, never as a pass', () => {
        // The first live run extracted nothing and four of six gates printed
        // PASS. Zero fabrications out of zero extractions is not a pass.
        const gate = computeGate([clean({ verdict: 'rejected', matched: { season: null, prices: 0 }, storedPriceCount: 2 })]);
        const named = (n: string) => gate.gates.find((g) => g.name === n);
        expect(named('F1 fabrications')?.pass).toBeNull();
        expect(named('price precision')?.pass).toBeNull();
        expect(named('season month errors')?.pass).toBeNull();
        // Recall is always judged — it is what catches a pipeline producing nothing.
        expect(named('season recall')?.pass).toBe(false);
        expect(gate.verdict).toBe('NO-GO');
    });

    it('cannot reach GO on untested gates alone', () => {
        const gate = computeGate([clean({ matched: { season: true, prices: 0 }, storedPriceCount: 0 })]);
        expect(gate.gates.find((g) => g.name === 'price precision')?.pass).toBeNull();
        expect(gate.verdict).toBe('INCONCLUSIVE');
    });

    it('does not let a rate limit depress recall', () => {
        // Two spots judged, both with a season; one rate-limited. Recall is
        // 2/2, not 2/3 — the third was never asked.
        const gate = computeGate([
            clean(), clean({ slug: 't' }),
            { slug: 'u', verdict: 'transport-failed', failures: [], pendingTriage: [],
                matched: { season: null, prices: 0 }, storedPriceCount: 0,
                transport: { code: 'T_RATE_LIMITED', attempts: 4 } },
        ]);
        expect(gate.gates.find((g) => g.name === 'season recall')?.value).toBe(1);
        expect(gate.transport.failures).toBe(1);
        expect(gate.transport.reachedValidator).toBe(2);
        expect(gate.transport.byCode).toEqual({ T_RATE_LIMITED: 1 });
    });

    it('refuses to conclude anything when transport dominated the run', () => {
        // The first matrix: 49 of 60 runs never reached the validator, and the
        // table read as a verdict on four models. It was a verdict on my retries.
        const transportFailed = (slug: string) => ({
            slug, verdict: 'transport-failed', failures: [], pendingTriage: [],
            matched: { season: null, prices: 0 }, storedPriceCount: 0,
            transport: { code: 'T_SERVICE_UNAVAILABLE', attempts: 4 },
        });
        const gate = computeGate([clean(), transportFailed('a'), transportFailed('b')]);
        expect(gate.verdict).toBe('INCONCLUSIVE-TRANSPORT');
    });

    it('still reports transport rate when transport was fine', () => {
        const gate = computeGate([clean(), clean({ slug: 't' })]);
        expect(gate.transport.rate).toBe(0);
        expect(gate.verdict).toBe('GO');
    });

    it('one fabrication is a no-go whatever else passes', () => {
        const gate = computeGate([clean({ failures: [{ class: 'F1', code: 'E_QUOTE_NOT_FOUND' }] })]);
        expect(gate.verdict).toBe('NO-GO');
    });

    it('fails when more than 30% of spots land in hold', () => {
        const gate = computeGate([clean(), clean({ slug: 't', verdict: 'hold' })]);
        expect(gate.gates.find((g) => g.name === 'hold rate')?.pass).toBe(false);
    });

    it('fails when the extractor found a season for fewer than 60% of spots', () => {
        const gate = computeGate([clean(), clean({ slug: 't', matched: { season: null, prices: 2 } }),
            clean({ slug: 'u', matched: { season: null, prices: 2 } })]);
        expect(gate.gates.find((g) => g.name === 'season recall')?.pass).toBe(false);
    });
});
