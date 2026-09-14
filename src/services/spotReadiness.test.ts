import { describe, expect, it } from 'vitest';
import { assessReadiness, COVERAGE_TTL_DAYS, FRESH_DAYS, type ReadinessRecord } from './spotReadiness';

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

const isoDay = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000)
    .toISOString()
    .slice(0, 10);

/**
 * A fresh, dated, windowed coverage probe — the only form that can yield
 * trip-ready. Note that no probe against the current fare provider can look
 * like this, because /api/flights ignores `date`; see the provider tests below.
 */
const coverage = (airports: string[], overrides: Record<string, unknown> = {}) => ({
    origin: 'DUB',
    airports,
    provider: 'ryanair-cache',
    fetchedAt: new Date().toISOString(),
    travelWindowStart: isoDay(0),
    travelWindowEnd: isoDay(14),
    ...overrides,
});

const complete = (): ReadinessRecord => ({
    prices: [{ sourceUrl: 'https://operator.example/tarifs', observedAt: daysAgo(10), includesGear: true }],
    seasonStartMonth: 4,
    seasonEndMonth: 10,
    tractionType: 'FULL_CABLE',
    cableTowers: 5,
    websiteUrl: 'https://operator.example',
    access: { airports: [{ iata: 'NTE' }] },
});

describe('spot readiness', () => {
    it('calls a fully evidenced record trip-ready when its way in is fare-covered', () => {
        const readiness = assessReadiness(complete(), { fareCoverage: coverage(['NTE']) });
        expect(readiness.tier).toBe('trip-ready');
        expect(readiness.missing).toEqual([]);
        expect(readiness.stale).toBe(false);
    });

    it('calls a record with only a location needs-verification, not trip-ready', () => {
        expect(assessReadiness({ access: { airports: [{ iata: 'NTE' }] } }, { fareCoverage: coverage(['NTE']) }).tier)
            .toBe('needs-verification');
    });

    // The ten best-curated venues in the catalogue have no slug and therefore
    // no detail record. Scoring them as incomplete would be an artefact of the
    // tooling, not a fact about the venues — especially as they sit on exactly
    // the Spanish and Balearic airports the Dublin fare feed does cover.
    it('reports an uninspectable record as not-auditable, inferring nothing', () => {
        const readiness = assessReadiness({}, { auditable: false });
        expect(readiness.tier).toBe('not-auditable');
        expect(readiness.missing).toEqual([]);
        expect(readiness.decisionScore).toBeNull();
    });

    // A coverage probe is only true for the window it was fetched for, so an
    // expired or undated snapshot must read as unknown, never as covered.
    it('refuses trip-ready on an expired coverage snapshot', () => {
        const readiness = assessReadiness(complete(), {
            fareCoverage: coverage(['NTE'], { fetchedAt: daysAgo(COVERAGE_TTL_DAYS + 1) }),
        });
        expect(readiness.tier).toBe('needs-verification');
        expect(readiness.missing).toContain('way in (fare coverage snapshot expired)');
    });

    // The failure the real DUB probe hits. It is named for the provider,
    // because that is where the fix has to happen: /api/flights ignores its
    // `date` parameter, so no probe against it can state a window. Calling it a
    // missing local field would hide the actual blocker.
    it('blames the provider when the fare snapshot has no travel window', () => {
        const readiness = assessReadiness(complete(), {
            fareCoverage: coverage(['NTE'], { travelWindowStart: null, travelWindowEnd: null }),
        });
        expect(readiness.tier).toBe('needs-verification');
        expect(readiness.missing).toContain('way in (fare schedule window unavailable from provider)');
    });

    it('refuses trip-ready when the trip falls outside the probed window', () => {
        const readiness = assessReadiness(complete(), {
            fareCoverage: coverage(['NTE'], { travelWindowStart: isoDay(0), travelWindowEnd: isoDay(7) }),
            tripDate: isoDay(30),
        });
        expect(readiness.tier).toBe('needs-verification');
        expect(readiness.missing).toContain('way in (trip date outside the probed fare window)');
    });

    it('accepts a trip date inside the probed window', () => {
        const readiness = assessReadiness(complete(), {
            fareCoverage: coverage(['NTE']),
            tripDate: isoDay(3),
        });
        expect(readiness.tier).toBe('trip-ready');
    });

    it('refuses trip-ready on an undated coverage snapshot', () => {
        const readiness = assessReadiness(complete(), {
            fareCoverage: coverage(['NTE'], { fetchedAt: null }),
        });
        expect(readiness.missing).toContain('way in (fare coverage snapshot is undated)');
    });

    it('requires a fare-covered way in when a coverage set is supplied', () => {
        const viaUncovered = assessReadiness(complete(), { fareCoverage: coverage(['AGP', 'IBZ']) });
        expect(viaUncovered.tier).toBe('needs-verification');
        expect(viaUncovered.missing).toContain('fare-covered way in');

        const viaCovered = assessReadiness(complete(), { fareCoverage: coverage(['NTE']) });
        expect(viaCovered.tier).toBe('trip-ready');
    });

    it('qualifies on ANY arrival candidate being covered, not just the first', () => {
        const record = { ...complete(), access: { airports: [{ iata: 'GNB' }, { iata: 'LYS' }, { iata: 'NTE' }] } };
        expect(assessReadiness(record, { fareCoverage: coverage(['NTE']) }).tier).toBe('trip-ready');
    });

    // The product must never say "trip-ready" about a route nobody priced.
    it('refuses trip-ready when fare coverage was never tested', () => {
        const readiness = assessReadiness(complete());
        expect(readiness.tier).toBe('needs-verification');
        expect(readiness.missing).toContain('way in (fare coverage not tested)');
    });

    // An empty access response and a failed lookup both block, but an
    // enrichment queue that conflates them re-derives access already known absent.
    it('distinguishes no-access-found from access-lookup-failed', () => {
        const none = assessReadiness({ ...complete(), access: { airports: [] } }, { fareCoverage: coverage(['NTE']) });
        expect(none.missing).toContain('way in (no arrival airport found)');

        const failed = assessReadiness(complete(), { fareCoverage: coverage(['NTE']), accessLookupFailed: true });
        expect(failed.missing).toContain('way in (access lookup failed)');
    });

    // The single worst failure the product can have is sending someone to a
    // closed park, so an unknown season can never be trip-ready.
    it('refuses trip-ready without an opening season', () => {
        const readiness = assessReadiness({ ...complete(), seasonStartMonth: null, seasonEndMonth: null }, { fareCoverage: coverage(['NTE']) });
        expect(readiness.tier).toBe('needs-verification');
        expect(readiness.missing).toContain('opening season');
    });

    it('refuses trip-ready when the tariff has no source or date', () => {
        const readiness = assessReadiness({ ...complete(), prices: [{ sourceUrl: null, observedAt: null }] }, { fareCoverage: coverage(['NTE']) });
        expect(readiness.tier).toBe('needs-verification');
        expect(readiness.missing).toContain('tariff source and date');
    });

    it('demotes a stale tariff rather than trusting it', () => {
        const readiness = assessReadiness({
            ...complete(),
            prices: [{ sourceUrl: 'https://operator.example', observedAt: daysAgo(FRESH_DAYS + 1) }],
        }, { fareCoverage: coverage(['NTE']) });
        expect(readiness.tier).toBe('needs-verification');
        expect(readiness.stale).toBe(true);
    });

    // A future observation date is bad data, not fresh data. Treating it as
    // fresh is exactly how a wrong price survives a re-check.
    it('treats a future observedAt as unusable, not as freshest', () => {
        const readiness = assessReadiness({
            ...complete(),
            prices: [{ sourceUrl: 'https://operator.example', observedAt: new Date(Date.now() + 86_400_000).toISOString() }],
        }, { fareCoverage: coverage(['NTE']) });
        expect(readiness.lastVerified).toBeNull();
        expect(readiness.tier).toBe('needs-verification');
    });

    it('ignores an unparseable observedAt instead of throwing', () => {
        const readiness = assessReadiness({
            ...complete(),
            prices: [{ sourceUrl: 'https://operator.example', observedAt: 'not a date' }],
        }, { fareCoverage: coverage(['NTE']) });
        expect(readiness.lastVerified).toBeNull();
        expect(readiness.tier).toBe('needs-verification');
    });

    it('picks the newest observation by timestamp, not by string order', () => {
        const readiness = assessReadiness({
            ...complete(),
            prices: [
                { sourceUrl: 'https://a.example', observedAt: '2026-08-19T23:00:00-02:00' },
                { sourceUrl: 'https://b.example', observedAt: '2026-08-20T00:00:00Z' },
            ],
        }, { fareCoverage: coverage(['NTE']) });
        // The offset form is the later instant despite sorting earlier as text.
        expect(readiness.lastVerified?.toISOString()).toBe('2026-08-20T01:00:00.000Z');
    });

    it('refuses trip-ready with no access path', () => {
        expect(assessReadiness({ ...complete(), access: { airports: [] } }, { fareCoverage: coverage(['NTE']) }).tier)
            .toBe('needs-verification');
    });

    // Provenance must not substitute for evidence: a DISCOVERED record with a
    // full sourced tariff is trip-ready, and the audit found three of them.
    it('does not consult any curation label', () => {
        const asDiscovered = { ...complete(), curationLevel: 'DISCOVERED' } as ReadinessRecord;
        expect(assessReadiness(asDiscovered, { fareCoverage: coverage(['NTE']) }).tier).toBe('trip-ready');
    });

    // `missing` is the blocking set; `gaps` is everything. Keeping them apart is
    // what lets the UI say "trip-ready, but we don't know the setup" instead of
    // demoting a bookable record over a nice-to-have.
    it('reports a non-blocking gap in gaps, not in missing', () => {
        const readiness = assessReadiness({ ...complete(), tractionType: null, cableTowers: null }, { fareCoverage: coverage(['NTE']) });
        expect(readiness.tier).toBe('trip-ready');
        expect(readiness.gaps).toContain('setup type');
        expect(readiness.missing).not.toContain('setup type');
    });
});
