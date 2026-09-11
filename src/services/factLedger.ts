// Fact ledger — the only channel through which backend numbers reach prose.
//
// The explain model never receives a TripExplorationResponse. It receives this
// ledger: a flat map of pre-formatted, source-attributed facts, each with an
// id. Its narrative must reference every number as a {{f3}} token, and this
// module substitutes them. A narrative that states a number any other way is
// rejected and a templated sentence is used instead.
//
// See docs/ai-intent-layer.md §4, rules 2, 3 and 6.

import { CostLineStatus } from './api';
import { UnifiedFlightOption } from '../types/tripExploration';
import { formatCurrency, formatKm, formatDateTime, getFlightPricing } from './tripExploreSelectors';

/** Subjects a narrative may discuss only when the ledger actually carries one. */
export type FactTopic = 'price' | 'time' | 'distance' | 'transit' | 'season' | 'availability';

export interface FactSource {
    endpoint: string;
    /** JSON path within that endpoint's payload, for hover-to-source. */
    path: string;
    fetchedAt: string | null;
}

export interface Fact {
    id: string;
    label: string;
    /** Already formatted by the shared selectors — the model never formats. */
    display: string;
    raw: number | string;
    topic: FactTopic;
    status?: CostLineStatus;
    source: FactSource;
}

export type Ledger = Record<string, Fact>;

export interface LedgerBuilder {
    add: (fact: Omit<Fact, 'id'>) => Fact;
    addFlightFacts: (optionLabel: string, flight: UnifiedFlightOption, source: Omit<FactSource, 'path'> & { basePath: string }) => Fact[];
    build: () => Ledger;
}

export const createLedger = (): LedgerBuilder => {
    const facts: Ledger = {};
    let counter = 0;

    const add = (fact: Omit<Fact, 'id'>): Fact => {
        counter += 1;
        const entry: Fact = { ...fact, id: `f${counter}` };
        facts[entry.id] = entry;
        return entry;
    };

    const addFlightFacts: LedgerBuilder['addFlightFacts'] = (optionLabel, flight, source) => {
        const pricing = getFlightPricing(flight);
        const added: Fact[] = [];
        const at = (path: string): FactSource => ({
            endpoint: source.endpoint,
            path: `${source.basePath}.${path}`,
            fetchedAt: source.fetchedAt,
        });

        // The honest total, per the canonical price hierarchy. Never the fare.
        if (typeof pricing.honestTotal === 'number') {
            added.push(add({
                label: `honest total, ${optionLabel}`,
                display: formatCurrency(pricing.honestTotal, pricing.currency),
                raw: pricing.honestTotal,
                topic: 'price',
                status: pricing.manualCheckRequired ? 'MANUAL_CHECK_REQUIRED' : 'ESTIMATED',
                source: at('antiCauchemar.auditedTotalCost'),
            }));
        }

        if (typeof pricing.baseFare === 'number') {
            added.push(add({
                label: `base fare, ${optionLabel}`,
                display: formatCurrency(pricing.baseFare, pricing.currency),
                raw: pricing.baseFare,
                topic: 'price',
                status: 'EXACT',
                source: at('ticketPrice'),
            }));
        }

        // Additive context only — never presented as the headline price.
        if (typeof pricing.doorToTripPrice === 'number') {
            added.push(add({
                label: `door-to-trip, ${optionLabel}`,
                display: formatCurrency(pricing.doorToTripPrice, pricing.currency),
                raw: pricing.doorToTripPrice,
                topic: 'price',
                status: 'ESTIMATED',
                source: at('antiCauchemar.doorToTripPrice'),
            }));
        }

        const arrival = formatDateTime(flight.scheduledArrival);
        if (arrival) {
            added.push(add({
                label: `arrival, ${optionLabel}`,
                display: arrival,
                raw: flight.scheduledArrival ?? '',
                topic: 'time',
                status: 'EXACT',
                source: at('scheduledArrival'),
            }));
        }

        if (typeof flight.stops === 'number') {
            added.push(add({
                label: `stops, ${optionLabel}`,
                display: flight.stops === 0 ? 'direct' : `${flight.stops} stop${flight.stops === 1 ? '' : 's'}`,
                raw: flight.stops,
                topic: 'transit',
                status: 'EXACT',
                source: at('stops'),
            }));
        }

        return added;
    };

    return { add, addFlightFacts, build: () => ({ ...facts }) };
};

/** Adds a distance fact from a resolved activity POI. */
export const addDistanceFact = (
    builder: LedgerBuilder,
    optionLabel: string,
    distanceKm: number,
    source: FactSource,
): Fact => builder.add({
    label: `ride spot distance, ${optionLabel}`,
    display: formatKm(distanceKm) ?? `${distanceKm} km`,
    raw: distanceKm,
    topic: 'distance',
    source,
});

// ─────────────────────────────────────────────────────────────────────────────
// Narrative validation
// ─────────────────────────────────────────────────────────────────────────────

export type NarrativeViolationKind =
    | 'UNKNOWN_TOKEN'
    | 'BARE_NUMBER'
    | 'BANNED_PHRASE'
    | 'UNBACKED_TOPIC';

export interface NarrativeViolation {
    kind: NarrativeViolationKind;
    detail: string;
}

export interface NarrativeCheck {
    ok: boolean;
    /** Substituted text. Only trust it when `ok` is true. */
    text: string;
    violations: NarrativeViolation[];
}

const TOKEN_RE = /\{\{(f\d+)\}\}/g;

/**
 * Phrases that promise something no endpoint returned. The backend reports
 * prices and schedules; it never confirms a seat, a room, or a booking.
 */
const BANNED_PHRASES = [
    'book now', 'guaranteed', 'sold out', 'refundable', 'free cancellation',
    'all inclusive', 'all-inclusive', 'availability', 'available now',
    'open year-round', 'open year round', 'instant confirmation',
];

/**
 * Written-out magnitudes. Kept deliberately narrow: "one" and "two" appear in
 * ordinary prose ("the one you want"), so only unambiguous quantifiers are
 * banned. The parse prompt also instructs the model never to spell numbers.
 */
const NUMBER_WORDS = ['hundred', 'thousand', 'dozen'];

/** Topic words a narrative may use only when the ledger carries that topic. */
const TOPIC_WORDS: Record<FactTopic, string[]> = {
    price: ['costs', 'cheaper', 'dearer', 'price', 'total'],
    time: ['lands', 'arrives', 'departs'],
    distance: ['away from', 'from the stay', 'minutes from'],
    transit: ['direct', 'layover', 'connection', 'stopover'],
    season: ['season', 'open', 'closed', 'year-round', 'closes', 'opens'],
    availability: ['available', 'sold', 'vacancy', 'spaces left'],
};

/** Topics that must never be discussed unless a fact explicitly backs them. */
const GUARDED_TOPICS: FactTopic[] = ['season', 'availability'];

export interface NarrativeOptions {
    /** Extra phrases to reject, e.g. product-specific promises. */
    bannedPhrases?: string[];
}

/**
 * Validates then substitutes. Order matters and is easy to get wrong: the
 * bare-number scan runs on the template with tokens REMOVED, before
 * substitution — checking afterwards would see the substituted values' own
 * digits and reject every valid narrative.
 */
export const validateNarrative = (
    template: string,
    ledger: Ledger,
    options: NarrativeOptions = {},
): NarrativeCheck => {
    const violations: NarrativeViolation[] = [];

    // 1. Every token must name a real fact.
    const referenced: string[] = [];
    let match = TOKEN_RE.exec(template);
    while (match !== null) {
        referenced.push(match[1]);
        match = TOKEN_RE.exec(template);
    }
    TOKEN_RE.lastIndex = 0;

    for (const id of referenced) {
        if (!ledger[id]) {
            violations.push({ kind: 'UNKNOWN_TOKEN', detail: `{{${id}}} is not in the ledger` });
        }
    }

    // 2. Strip tokens, then look for numbers the model wrote itself.
    const withoutTokens = template.replace(TOKEN_RE, ' ');
    const digit = withoutTokens.match(/\d+/);
    if (digit) {
        violations.push({ kind: 'BARE_NUMBER', detail: `unbacked number "${digit[0]}"` });
    }

    const lowered = withoutTokens.toLowerCase();
    for (const word of NUMBER_WORDS) {
        if (lowered.includes(word)) {
            violations.push({ kind: 'BARE_NUMBER', detail: `unbacked quantity "${word}"` });
        }
    }

    // 3. Promises the backend never made.
    for (const phrase of [...BANNED_PHRASES, ...(options.bannedPhrases ?? [])]) {
        if (lowered.includes(phrase.toLowerCase())) {
            violations.push({ kind: 'BANNED_PHRASE', detail: `"${phrase}"` });
        }
    }

    // 4. Guarded topics need a fact in the ledger to license them.
    const topicsPresent = new Set(Object.values(ledger).map((fact) => fact.topic));
    for (const topic of GUARDED_TOPICS) {
        if (topicsPresent.has(topic)) {
            continue;
        }
        for (const word of TOPIC_WORDS[topic]) {
            if (lowered.includes(word)) {
                violations.push({
                    kind: 'UNBACKED_TOPIC',
                    detail: `"${word}" discusses ${topic}, which no fact backs`,
                });
                break;
            }
        }
    }

    const text = violations.length === 0
        ? template.replace(TOKEN_RE, (_full, id: string) => ledger[id]?.display ?? '')
        : template;

    return { ok: violations.length === 0, text, violations };
};

/**
 * The prompt-side view of the ledger. This is the ONLY representation of
 * backend data the explain model ever sees.
 */
export const renderLedgerForPrompt = (ledger: Ledger): string => (
    Object.values(ledger)
        .map((fact) => {
            const status = fact.status ? ` [${fact.status}]` : '';
            return `${fact.id} = "${fact.display}" — ${fact.label}${status}`;
        })
        .join('\n')
);
