/**
 * The single rule for how ready a spot record is. Shared, not copied.
 *
 * Both `scripts/spot-coverage-audit.mjs` (which ranks the catalogue for
 * enrichment) and `src/services/spotReadiness.ts` (which labels the UI) import
 * this file. Plain ESM JavaScript so a Node script and the Vite bundle can use
 * the same source — the same reason `security-headers.js` is plain JS.
 * Duplicating these conditions in two languages guarantees eventual drift, and
 * a badge that disagrees with the worklist is worse than no badge.
 *
 * `curationLevel` is deliberately never consulted. It is a provenance label
 * from the harvest pipeline and it disagrees with reality in both directions:
 * the audit found three DISCOVERED spots carrying a full sourced tariff.
 * Readiness derives from evidenced fields and their freshness, or it means
 * nothing.
 */

/** A tariff older than this needs re-checking before it can be relied on. */
export const FRESH_DAYS = 180;

/**
 * How long a fare-coverage probe stays meaningful.
 *
 * The Ryanair cache this is probed from holds a short forward window, so a set
 * of "airports DUB can reach" is only true for the dates it was fetched for. A
 * timeless array would let a spot keep its "Verified trip-ready" badge after
 * its only fare path had disappeared, which is precisely the kind of quiet
 * staleness this product exists to call out.
 */
export const COVERAGE_TTL_DAYS = 7;

/**
 * A dated fare-coverage snapshot.
 *
 * @typedef {object} FareCoverage
 * @property {string}   origin        IATA the fares were probed from, e.g. 'DUB'.
 * @property {string[]} airports      Arrival IATAs the feed returned fares for.
 * @property {string}   provider      Which feed answered, e.g. 'ryanair-cache'.
 * @property {string}   fetchedAt     ISO timestamp of the probe.
 * @property {string}   travelWindowStart ISO date the probed fares were valid from.
 * @property {string}   travelWindowEnd   ISO date the probed fares were valid to.
 * @property {number}  [ttlDays]      Overrides COVERAGE_TTL_DAYS.
 */

/**
 * Is this coverage snapshot usable to claim a way in, for this trip date?
 *
 * @param {FareCoverage|null|undefined} coverage
 * @param {string|null} tripDate ISO date of the trip being priced, when there
 *   is one. Pass null to check only that the snapshot itself is sound — the
 *   catalogue audit ranks records rather than pricing a specific trip.
 * @returns {{ usable: boolean, reason: string|null, airports: string[] }}
 */
export const evaluateCoverage = (coverage, tripDate = null) => {
    if (!coverage || !Array.isArray(coverage.airports)) {
        return { usable: false, reason: 'not-tested', airports: [] };
    }
    const airports = coverage.airports;

    const fetchedAt = Date.parse(coverage.fetchedAt ?? '');
    if (!Number.isFinite(fetchedAt)) {
        // An undated snapshot cannot be shown to still be true.
        return { usable: false, reason: 'undated', airports };
    }

    const ageDays = (Date.now() - fetchedAt) / 86_400_000;
    if (ageDays < 0 || ageDays > (coverage.ttlDays ?? COVERAGE_TTL_DAYS)) {
        return { usable: false, reason: 'expired', airports };
    }

    // A fresh probe for the wrong dates is still not usable coverage.
    //
    // Today this is the branch every real probe lands in, and the cause is not
    // a field someone forgot to fill in: /api/flights ignores its `date`
    // parameter, so the provider cannot say which dates its fares apply to.
    // That is a data-source limitation, and it has to stay visible under that
    // name until the provider contract changes — calling it a missing local
    // field would hide the actual blocker behind a bookkeeping error.
    const from = Date.parse(coverage.travelWindowStart ?? '');
    const to = Date.parse(coverage.travelWindowEnd ?? '');
    if (!Number.isFinite(from) || !Number.isFinite(to)) {
        return { usable: false, reason: 'provider-window-unavailable', airports };
    }

    if (tripDate !== null) {
        const trip = Date.parse(tripDate);
        if (!Number.isFinite(trip) || trip < from || trip > to) {
            return { usable: false, reason: 'trip-date-outside-window', airports };
        }
    }

    return { usable: true, reason: null, airports };
};

/**
 * Newest usable tariff observation, as a timestamp.
 *
 * Parsed rather than string-sorted: `observedAt` values are not guaranteed to
 * share an offset, so "2026-08-20T00:00:00Z" sorts after
 * "2026-08-19T23:00:00-02:00" as text while being the earlier instant.
 * Unparseable values and future timestamps are discarded — a future observation
 * date is bad data, not fresh data, and treating it as fresh is exactly how a
 * wrong price survives a re-check.
 */
export const newestObservedAt = (record) => {
    const now = Date.now();
    const times = (record.prices ?? [])
        .map((price) => Date.parse(price?.observedAt ?? ''))
        .filter((time) => Number.isFinite(time) && time <= now);
    return times.length ? Math.max(...times) : null;
};

/**
 * Facts a traveller needs before this record can support a decision.
 * `required: false` entries are reported as gaps but never block trip-ready.
 */
export const DECISION_CHECKS = [
    {
        key: 'tariff',
        label: 'operator tariff',
        required: true,
        weight: 3,
        test: (r) => Array.isArray(r.prices) && r.prices.length > 0,
        why: 'Without a price the spot cannot enter any trip total.',
    },
    {
        key: 'tariff-sourced',
        label: 'tariff source and date',
        required: true,
        weight: 3,
        test: (r) => (r.prices ?? []).some((p) => p?.sourceUrl && p?.observedAt),
        why: 'A price with no source or observation date cannot be defended or re-checked.',
    },
    {
        key: 'tariff-fresh',
        label: 'recently checked tariff',
        required: true,
        weight: 2,
        test: (r, ctx) => {
            const observed = newestObservedAt(r);
            return observed !== null && (Date.now() - observed) / 86_400_000 <= ctx.freshDays;
        },
        why: 'A stale price is a wrong price. Seasonal tariffs may need re-checking before a new season even inside the window.',
    },
    {
        key: 'season',
        label: 'opening season',
        required: true,
        weight: 3,
        test: (r) => r.seasonStartMonth != null && r.seasonEndMonth != null,
        why: 'Sending someone to a closed park is the worst failure this product can have.',
    },
    {
        key: 'access',
        // Copy varies by *why* it failed: an empty access response means no
        // known way in, a failed lookup means unknown, and untested coverage
        // means nobody has checked. An enrichment queue that conflates those
        // sends someone to re-derive access that is already known absent.
        label: 'fare-covered way in',
        labelFor: (r, ctx) => {
            if (ctx.accessLookupFailed) return 'way in (access lookup failed)';
            if ((r.access?.airports ?? []).length === 0) return 'way in (no arrival airport found)';
            if (ctx.coverage.reason === 'not-tested') return 'way in (fare coverage not tested)';
            if (ctx.coverage.reason === 'undated') return 'way in (fare coverage snapshot is undated)';
            if (ctx.coverage.reason === 'expired') return 'way in (fare coverage snapshot expired)';
            // Named for the provider limitation, not for a local omission: the
            // fare endpoint ignores `date`, so no window can be recorded.
            if (ctx.coverage.reason === 'provider-window-unavailable') return 'way in (fare schedule window unavailable from provider)';
            if (ctx.coverage.reason === 'trip-date-outside-window') return 'way in (trip date outside the probed fare window)';
            return 'fare-covered way in';
        },
        required: true,
        weight: 2,
        test: (r, ctx) => {
            if (ctx.accessLookupFailed) return false;
            const airports = (r.access?.airports ?? []).map((a) => a?.iata).filter(Boolean);
            if (airports.length === 0) return false;
            // Never degrade to "a candidate exists", and never trust an undated
            // or expired snapshot. Untested, stale and unknown all mean the same
            // thing here: nobody has shown there is a way in today.
            if (!ctx.coverage.usable) return false;
            return airports.some((iata) => ctx.coverage.airports.includes(iata));
        },
        why: 'A trip cannot be priced door to door without an arrival airport the fare feed actually covers.',
    },
    {
        key: 'operator-url',
        label: 'booking handoff',
        required: true,
        weight: 2,
        test: (r) => Boolean(r.websiteUrl) || (r.prices ?? []).some((p) => p?.sourceUrl),
        why: 'No booking handoff is possible without it.',
    },
    {
        key: 'setup',
        label: 'setup type',
        required: false,
        weight: 2,
        test: (r) => Boolean(r.tractionType)
            && (r.cableTowers != null || r.fullCableCount != null || r.systemTwoCount != null),
        why: 'A two-tower system is a different product from a full cable. This is the core differentiator.',
    },
    {
        key: 'gear',
        label: 'whether gear is included',
        required: false,
        weight: 1,
        test: (r) => (r.prices ?? []).some((p) => p?.includesGear != null) || r.gearRental != null,
        why: 'Changes the real cost by the price of a board and wetsuit.',
    },
    {
        key: 'ground',
        label: 'ground transfer',
        required: false,
        weight: 1,
        test: (r) => Boolean(r.access?.station) || Boolean(r.access?.drivingDirectionsUrl),
        why: 'The airport-to-park leg is where cheap fares stop being cheap.',
    },
];

/**
 * Presentation quality. Scored separately and never gating: a complete,
 * source-dated, bookable park with no photo is still worth showing, and a good
 * photo cannot compensate for an unknown tariff or an unknown season.
 */
export const PRESENTATION_CHECKS = [
    { key: 'photo', label: 'photo', weight: 2, test: (r) => Boolean(r.imageUrl), why: 'A venue with no photo reads as unverified, whatever the data says.' },
    { key: 'description', label: 'setup description', weight: 1, test: (r) => Boolean((r.setupNotes ?? '').trim()), why: 'The prose explains a session to someone who has never ridden.' },
    { key: 'geo', label: 'mappable coordinates', weight: 1, test: (r) => Number.isFinite(r.latitude) && Number.isFinite(r.longitude), why: 'Without coordinates there is no map pin and no access derivation.' },
];

export const MAX_DECISION = DECISION_CHECKS.reduce((t, c) => t + c.weight, 0);
export const MAX_PRESENTATION = PRESENTATION_CHECKS.reduce((t, c) => t + c.weight, 0);

/**
 * Three states, and the third is not a worse version of the second.
 *
 * - `trip-ready`        every required fact evidenced, including a fare-covered way in
 * - `needs-verification` a required fact is absent, stale, or its lookup failed
 * - `not-auditable`     no detail record to inspect — infers nothing either way
 *
 * `not-auditable` exists because the ten best-curated venues in this catalogue
 * (Ibiza, Mallorca, Benidorm, Madrid, Antalya) have no slug and therefore no
 * detail endpoint. They may well be the strongest Dublin cohort — the cached
 * fares cover exactly those Spanish and Balearic airports. Ranking them below a
 * thin French record because nothing could be read would be an artefact of the
 * tooling, not a fact about the venues.
 */
export const assessReadiness = (record, options = {}) => {
    const ctx = {
        freshDays: options.freshDays ?? FRESH_DAYS,
        coverage: evaluateCoverage(options.fareCoverage, options.tripDate ?? null),
        accessLookupFailed: options.accessLookupFailed === true,
    };

    if (options.auditable === false) {
        return {
            tier: 'not-auditable',
            missing: [],
            gaps: [],
            lastVerified: null,
            stale: false,
            decisionScore: null,
            presentationScore: null,
        };
    }

    const failed = DECISION_CHECKS.filter((check) => {
        try { return !check.test(record, ctx); } catch { return true; }
    });
    const observed = newestObservedAt(record);
    const hasTariff = (record.prices ?? []).length > 0;

    const labelOf = (check) => (check.labelFor ? check.labelFor(record, ctx) : check.label);

    return {
        tier: failed.some((c) => c.required) ? 'needs-verification' : 'trip-ready',
        missing: failed.filter((c) => c.required).map(labelOf),
        gaps: failed.map(labelOf),
        lastVerified: observed === null ? null : new Date(observed),
        stale: hasTariff && (observed === null || (Date.now() - observed) / 86_400_000 > ctx.freshDays),
        decisionScore: DECISION_CHECKS.filter((c) => !failed.includes(c)).reduce((t, c) => t + c.weight, 0),
        presentationScore: PRESENTATION_CHECKS.filter((c) => {
            try { return c.test(record); } catch { return false; }
        }).reduce((t, c) => t + c.weight, 0),
    };
};

export const READINESS_COPY = {
    'trip-ready': {
        label: 'Verified trip-ready',
        meaning: 'Operator tariff with a source and a recent date, a known season, and a way in the fare feed actually covers. Enough to decide on and book.',
    },
    'needs-verification': {
        label: 'Needs verification',
        meaning: 'Something a decision needs is missing, out of date, or could not be checked. Treat the details as unconfirmed.',
    },
    'not-auditable': {
        label: 'Not audited yet',
        meaning: 'This venue has no detail record to check yet. That is a gap in our data, not a judgement about the venue — nothing here is claimed either way.',
    },
};
