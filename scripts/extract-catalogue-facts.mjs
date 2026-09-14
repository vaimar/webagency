#!/usr/bin/env node
/**
 * The extractor: pages in, validated facts out.
 *
 * Fetches an operator's own pages, asks a model what they say, and puts every
 * answer through `extraction-validator.js` before it counts as anything. The
 * model is the least trusted component in the chain — nothing it returns is
 * written anywhere on its own say-so.
 *
 *   node scripts/extract-catalogue-facts.mjs --slug=rouffiac-teleski-fr
 *   node scripts/extract-catalogue-facts.mjs --worklist=batch1 --out=out/
 *   node scripts/extract-catalogue-facts.mjs --eval [--triage=triage.json]
 *   node scripts/extract-catalogue-facts.mjs --slug=… --offline=fixtures/
 *
 * NOTHING IS WRITTEN TO THE CATALOGUE. This emits JSON files; applying them is
 * a separate, reviewed step. There is no code path here that updates a spot.
 *
 * Needs NVIDIA_API_KEY. NVIDIA's NIM endpoints are OpenAI-compatible, so
 * --api-base and --model are the only things that change to point it elsewhere.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { validateExtraction, isTransportCode } from '../extraction-validator.js';
import {
    htmlToText, rankCandidatePages, buildPrompt, parseModelJson,
    compareToStored, computeGate, applyPipelineScores, SYSTEM_PROMPT,
} from '../extraction-runner.js';

const arg = (name, fallback = undefined) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : fallback;
};

const API = arg('api', process.env.REACT_APP_API_BASE || 'http://localhost:9090');
const ACTIVITY = arg('activity', 'wakeboarding');
const API_BASE = arg('api-base', 'https://integrate.api.nvidia.com/v1');
// Verified present on this account's /v1/models (81 models; the 3.3-nemotron-super
// id is not among them). Override with --model=.
const MODEL = arg('model', 'nvidia/llama-3.1-nemotron-70b-instruct');
/**
 * The key, from the environment or from a Spring config file.
 *
 * `--key-file` exists because this project's key already lives at
 * `nvidia.api.key` in slumber's application-local.yml, and copying a secret
 * into a second place to satisfy a script is how secrets end up in shells,
 * history files and screenshots. Read where it already is; never log it.
 */
const readKeyFile = (path) => {
    try {
        const yaml = readFileSync(path, 'utf8');
        // Deliberately narrow: the `nvidia:` block's `api.key`, nothing else.
        // `(?![\s\S])` is end-of-input in JS. `\Z` is not — it is a literal Z,
        // so the block would have run past the file's end had `nvidia:` been
        // the last key rather than the middle one.
        const block = yaml.match(/^nvidia:\s*$[\s\S]*?(?=^\S|(?![\s\S]))/m)?.[0] ?? '';
        return block.match(/^\s+key:\s*(?:"([^"]+)"|'([^']+)'|(\S+))\s*$/m)?.slice(1).find(Boolean) ?? null;
    } catch {
        return null;
    }
};

const KEY_FILE = arg('key-file');
const KEY = process.env.NVIDIA_API_KEY ?? (KEY_FILE ? readKeyFile(KEY_FILE) : null);
const OUT = arg('out');
const OFFLINE = arg('offline');
/**
 * Where to write the fetched pages.
 *
 * A model matrix that re-fetches per model is not a controlled comparison: the
 * operator's site can change between runs, a fetch can fail differently, and
 * the difference then sits in the dataset rather than in the model. Fetch once,
 * replay for every model.
 */
const SAVE_PAGES = arg('save-pages');
const JSON_SUMMARY = arg('json-summary');
const MAX_PAGES = Number.parseInt(arg('max-pages', '4'), 10);
const IS_EVAL = process.argv.includes('--eval');
const FETCH_ONLY = process.argv.includes('--fetch-only');
const TRIAGE = arg('triage');
/**
 * Score an existing run again, with triage decisions applied.
 *
 * Reads the per-spot result files a previous --out wrote and recomputes the
 * gate. No pages are fetched, no model is called, nothing is re-extracted — so
 * a triage pass cannot accidentally become a new experiment with a different
 * result underneath it.
 */
const RESCORE = arg('rescore');

const EVAL_SLUGS = [
    'base-nautique-atlantic-wake-park-fr', 'cascade-waterpark-fr', 'etoile-park-26-fr',
    'les-o-kiri-baudreix-fr', 'my-little-wake-park-fr', 'park-nautic-de-verberie-fr',
    'planet-ski-fr', 'rille-wake-park-fr', 'lakecity-fr', 'amiens-cable-park-fr',
    'bzh-wake-park-fr', 'champagne-wake-park-teleski-nautique-fr',
    'crans-montana-wakepark-fr', 'aloha-wakepark-fr', 'delta-wakepark-fr',
];

const getJson = async (path) => {
    const response = await fetch(`${API}${path}`);
    return response.ok ? response.json() : null;
};

const sha256 = (text) => `sha256:${createHash('sha256').update(text).digest('hex')}`;

/**
 * Offline mode reads pages from disk instead of the network.
 *
 * Not a convenience: it is what makes a disputed extraction reproducible. A
 * fixture directory holds the exact bytes a run saw, so a fabrication finding
 * can be re-checked next month when the operator's site has changed.
 */
const loadOffline = (dir, slug) => {
    const path = join(dir, `${slug}.json`);
    try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
};

const fetchPage = async (url) => {
    const fetchedAt = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    try {
        const response = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'SlumberCatalogueBot/1.0 (+catalogue truth extraction)' } });
        const html = response.ok ? await response.text() : '';
        const text = htmlToText(html);
        return { url, fetchedAt, status: response.status, html, text, contentHash: sha256(text) };
    } catch (error) {
        return { url, fetchedAt, status: 0, html: '', text: '', contentHash: sha256(''), error: String(error).slice(0, 160) };
    }
};

/**
 * Retry policy, stated once so the summary can report it.
 *
 * Bounded: four attempts, exponential from 1s, capped at 15s, with jitter so a
 * matrix of models does not synchronise its retries into a second rate-limit
 * wall. `Retry-After` wins over the computed delay when the server sends one —
 * it knows its own window and we do not.
 *
 * RETRYABLE is deliberately short. A 400 (bad parameter), 401/403 (auth) or
 * 404/410 (model gone) will fail identically forever, and retrying them burns
 * the budget that a genuine 429 needs.
 */
const RETRY = {
    attempts: 4,
    baseDelayMs: 1000,
    factor: 2,
    maxDelayMs: 15000,
    jitter: 0.25,
    retryableStatuses: [429, 500, 502, 503, 504],
    retryableNetworkErrors: true,
    // A hang is not retried. See REQUEST_TIMEOUT_MS.
    retryTimeouts: false,
};

/**
 * How long to wait for a model before giving up on it.
 *
 * Measured, not guessed. Real extraction calls against a responsive model on
 * this fixture set took 2.2s, 5.1s and 17.6s — the last being the largest page
 * set producing the largest output (4,788 characters, finish_reason "stop").
 * 90s is roughly five times that worst case, which leaves room for a slower
 * model or a longer page without leaving room for a stall.
 *
 * Some NVIDIA model routes accept the connection, complete TLS in ~28ms, and
 * then never send a byte — confirmed identically with curl, so it is upstream
 * rather than anything in this client. Without a deadline those calls waited on
 * the OS TCP timeout: one matrix ran 12h56m and produced only transport
 * failures. The deadline is what converts that into a 90-second answer.
 *
 * NOT retried, deliberately. A route that hangs hangs again; retrying it three
 * more times costs four and a half minutes to learn the same thing.
 */
let REQUEST_TIMEOUT_MS = Number.parseInt(arg('request-timeout-ms', '90000'), 10);

/**
 * Calibration bounds.
 *
 * A fixed deadline is a filter in disguise. 90s was five times the worst real
 * call when it was set; hours later the same call took 71s and the deadline was
 * rejecting healthy-but-slow responses at up to 100% on one model. The floor
 * keeps a fast endpoint from making the deadline hair-trigger; the ceiling
 * keeps a degraded one from resurrecting the multi-hour runs.
 */
const CALIBRATION = {
    warmupCalls: 3,
    multiplier: 3,
    minMs: 90000,
    maxMs: 240000,
};

/** Nearest-rank p95. With three samples this is the maximum, and says so. */
const p95Of = (values) => {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1)];
};

/**
 * Measure this model before trusting a deadline for it.
 *
 * Warms up with REAL extraction-shaped payloads — the same page text and token
 * budget a spot uses. A tiny "say ok" call measures routing, not generation,
 * and generation is where the variance lives: the same model answered a real
 * prompt in 5.1s and, hours later, 71.3s.
 */
const calibrate = async (samplePages) => {
    const latencies = [];
    const attempts = [];
    for (const pages of samplePages.slice(0, CALIBRATION.warmupCalls)) {
        const started = Date.now();
        // Deliberately generous while calibrating: a warm-up that timed out at
        // the very deadline it is meant to compute would be circular.
        const previous = REQUEST_TIMEOUT_MS;
        REQUEST_TIMEOUT_MS = CALIBRATION.maxMs;
        const reply = await askModel(SYSTEM_PROMPT, buildPrompt(
            { name: 'calibration', country: 'FR', websiteUrl: pages[0]?.url ?? '' }, pages, ['season', 'prices'],
        ));
        REQUEST_TIMEOUT_MS = previous;
        const ms = Date.now() - started;
        attempts.push({ ms, ok: reply.ok, code: reply.ok ? null : reply.code });
        if (reply.ok) latencies.push(ms);
    }
    const p95 = p95Of(latencies);
    const timeoutMs = p95 === null
        // Nothing to calibrate against: give the model the whole budget rather
        // than a deadline derived from failures.
        ? CALIBRATION.maxMs
        : Math.min(CALIBRATION.maxMs, Math.max(CALIBRATION.minMs, Math.round(CALIBRATION.multiplier * p95)));
    return { latencies, attempts, p95, timeoutMs, successfulWarmups: latencies.length };
};

/**
 * Per-model parameter overrides.
 *
 * `top_p: 1` was hardcoded and kimi-k3 rejects it outright — "top_p is
 * immutable for this model and must be 0.95". A shared default that one model
 * refuses is not a default; it is a silent exclusion of that model from every
 * comparison it appears in.
 */
const MODEL_PARAMS = {
    'moonshotai/kimi-k3': { top_p: 0.95 },
};

/**
 * Token budget.
 *
 * 2048 truncated replies mid-array — the parse errors landed around position
 * 6100 of the JSON, well past where a tariff list gets cut off. A spot with a
 * dozen price rows needs room; 8192 covers the largest in this catalogue
 * (bzh-wake-park at 17 rows) with margin.
 */
const MAX_TOKENS = Number.parseInt(arg('max-tokens', '8192'), 10);

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

const delayFor = (attempt, retryAfterHeader) => {
    const header = Number.parseInt(retryAfterHeader ?? '', 10);
    if (Number.isFinite(header) && header > 0) return Math.min(header * 1000, RETRY.maxDelayMs);
    const base = Math.min(RETRY.baseDelayMs * RETRY.factor ** (attempt - 1), RETRY.maxDelayMs);
    return Math.round(base * (1 + (Math.random() * 2 - 1) * RETRY.jitter));
};

/**
 * Ask the model, retrying only what is worth retrying.
 *
 * Returns a `T_` code on failure rather than a message, so the caller can keep
 * transport out of the extraction-quality counts without string matching.
 */
const askModel = async (system, user) => {
    if (!KEY) return { ok: false, code: 'T_UNAUTHORIZED', error: 'No NVIDIA key (set NVIDIA_API_KEY or pass --key-file).', attempts: 0 };

    let lastError = { code: 'T_FETCH_FAILED', error: 'no attempt made' };
    for (let attempt = 1; attempt <= RETRY.attempts; attempt += 1) {
        let response;
        try {
            response = await fetch(`${API_BASE}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
                body: JSON.stringify({
                    model: MODEL,
                    temperature: 0,
                    max_tokens: MAX_TOKENS,
                    ...(MODEL_PARAMS[MODEL] ?? {}),
                    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
                }),
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            });
        } catch (error) {
            // A deadline is a verdict, not a hiccup: the route did not answer,
            // and asking again is how hours get spent learning that twice.
            const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
            if (timedOut) {
                return {
                    ok: false,
                    code: 'T_REQUEST_TIMEOUT',
                    error: `No response within ${REQUEST_TIMEOUT_MS}ms.`,
                    attempts: attempt,
                };
            }
            lastError = { code: 'T_FETCH_FAILED', error: String(error).slice(0, 200) };
            if (RETRY.retryableNetworkErrors && attempt < RETRY.attempts) { await sleep(delayFor(attempt)); continue; }
            return { ok: false, ...lastError, attempts: attempt };
        }

        if (!response.ok) {
            const body = (await response.text()).slice(0, 200);
            const code = response.status === 429 ? 'T_RATE_LIMITED'
                : [500, 502, 503, 504].includes(response.status) ? 'T_SERVICE_UNAVAILABLE'
                    : response.status === 400 ? 'T_PARAM_REJECTED'
                        : [401, 403].includes(response.status) ? 'T_UNAUTHORIZED'
                            : 'T_FETCH_FAILED';
            lastError = { code, error: `HTTP ${response.status}: ${body}` };
            if (RETRY.retryableStatuses.includes(response.status) && attempt < RETRY.attempts) {
                await sleep(delayFor(attempt, response.headers.get('retry-after')));
                continue;
            }
            return { ok: false, ...lastError, attempts: attempt };
        }

        const body = await response.json();
        const choice = body?.choices?.[0];
        // A reply cut off at the token ceiling is not a bad answer, it is half
        // an answer, and parsing it would yield a plausible-looking fragment.
        if (choice?.finish_reason === 'length') {
            return { ok: false, code: 'T_REPLY_TRUNCATED', error: `Reply hit the ${MAX_TOKENS}-token ceiling.`, attempts: attempt };
        }
        return { ok: true, content: choice?.message?.content ?? '', attempts: attempt };
    }
    return { ok: false, ...lastError, attempts: RETRY.attempts };
};

const rejection = (slug, code, field, detail, extra = {}) => {
    const reason = { code, field, detail };
    return { slug, verdict: 'rejected', reasons: [reason], rejected: [reason], holds: [], ...extra };
};

/**
 * The extractor never got an answer to judge.
 *
 * Kept out of `rejected` entirely: a transport failure with an empty rejected
 * list is what stops it being counted as an extraction-quality failure by any
 * downstream consumer that was not written with this distinction in mind.
 */
const transportFailure = (slug, code, detail, attempts, stored = null) => ({
    slug,
    verdict: 'transport-failed',
    transport: { code, detail, attempts },
    reasons: [], rejected: [], holds: [], output: null, stored,
});

const extractOne = async (slug, targets) => {
    const spot = await getJson(`/api/spots/${encodeURIComponent(slug)}`);
    if (!spot) return rejection(slug, 'E_NO_SOURCE', 'slug', 'No such spot.');
    if (!spot.websiteUrl) {
        return rejection(slug, 'E_NO_SOURCE', 'websiteUrl', 'No operator website, so no T1 domain exists. This spot needs a website before it can be extracted.');
    }

    // Identity only. The stored season and prices are deliberately NOT passed
    // to buildPrompt — they go to the validator, which is a different object.
    const identity = { name: spot.name, country: spot.country, websiteUrl: spot.websiteUrl };

    let pages;
    if (OFFLINE) {
        const fixture = loadOffline(OFFLINE, slug);
        if (!fixture) return rejection(slug, 'E_NO_SOURCE', 'offline', `No fixture for ${slug} in ${OFFLINE}.`);
        pages = fixture.pages;
    } else {
        const home = await fetchPage(spot.websiteUrl);
        const candidates = rankCandidatePages(home.html, spot.websiteUrl, targets, MAX_PAGES);
        pages = [home];
        for (const candidate of candidates.slice(1)) pages.push(await fetchPage(candidate.url));
    }

    if (SAVE_PAGES) {
        mkdirSync(SAVE_PAGES, { recursive: true });
        // `html` is dropped: the quote check runs against `text`, and keeping
        // the raw markup would make a fixture set ten times larger for nothing.
        writeFileSync(join(SAVE_PAGES, `${slug}.json`), JSON.stringify({
            slug,
            savedAt: new Date().toISOString(),
            pages: pages.map(({ url, fetchedAt, status, text, contentHash }) => ({ url, fetchedAt, status, text, contentHash })),
        }, null, 2));
    }

    const usable = pages.filter((p) => p.status === 200 && p.text.length > 40);
    if (usable.length === 0) {
        return transportFailure(slug, 'T_NO_PAGES', 'No operator page could be read.', 0, spot);
    }

    if (FETCH_ONLY) {
        return { slug, verdict: 'hold', reasons: [], rejected: [], holds: [],
            fetched: usable.length, output: null, stored: spot };
    }

    const reply = await askModel(SYSTEM_PROMPT, buildPrompt(identity, usable, targets));
    if (!reply.ok) return transportFailure(slug, reply.code, reply.error, reply.attempts, spot);

    const parsed = parseModelJson(reply.content);
    // A reply that is not JSON is a transport-layer outcome too: the model was
    // reachable, but nothing arrived that could be judged for truthfulness.
    if (!parsed.ok) return transportFailure(slug, 'T_REPLY_NOT_JSON', parsed.error, reply.attempts, spot);

    const output = {
        slug,
        runId: RUN_ID,
        extractedAt: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
        modelId: MODEL,
        ...parsed.value,
        pagesFetched: usable.map(({ url, fetchedAt, status, contentHash }) => ({ url, fetchedAt, status, contentHash, sourceTier: 'T1_OPERATOR' })),
    };

    // The score is measured, not asked for. See `scoreClaim`.
    applyPipelineScores(output, usable, { operatorWebsiteUrl: spot.websiteUrl });

    // Fail closed. A reply with no season and no prices used to validate
    // cleanly — nothing to reject — and land as `accepted`, which is how three
    // spots per model showed as accepted with zero facts. Nothing extracted is
    // not success; it is no yield.
    const claimCount = (output.season ? 1 : 0) + (output.prices?.length ?? 0);
    if (claimCount === 0) {
        return { slug, verdict: 'no-yield', reasons: [], rejected: [], holds: [], output, stored: spot };
    }

    const verdicts = validateExtraction(output, {
        operatorWebsiteUrl: spot.websiteUrl,
        pagesFetched: usable,
        storedSeason: spot.seasonStartMonth == null ? null
            : { seasonStartMonth: spot.seasonStartMonth, seasonEndMonth: spot.seasonEndMonth },
        seasonProvenanceStorable: 'seasonSourceUrl' in spot,
    });

    // Belt and braces: a transport code reaching the rejected list would put it
    // back into the extraction-quality counts this whole split exists to keep
    // it out of.
    const leaked = (verdicts.rejected ?? []).filter((r) => isTransportCode(r.code));
    if (leaked.length > 0) {
        throw new Error(`Transport code in extraction rejections for ${slug}: ${leaked.map((r) => r.code).join(', ')}`);
    }

    return { slug, ...verdicts, output, stored: spot };
};

const RUN_ID = `extract-${new Date().toISOString().replace(/[:.]/g, '-')}`;

/**
 * Write the operator's worklist.
 *
 * Ordered for the fastest possible review rather than for the machine: grouped
 * by spot so one page is opened once, and the exemplars first so the reviewer
 * calibrates on the clearest cases before meeting the long tail.
 */
const writeTriagePack = (comparisons, dir, exemplars = []) => {
    const items = comparisons.flatMap((c) => c.pendingTriage.map((t) => ({ ...t, slug: c.slug })));
    const rank = (item) => {
        const i = exemplars.indexOf(item.key);
        return i === -1 ? exemplars.length + 1 : i;
    };
    items.sort((a, b) => rank(a) - rank(b)
        || a.slug.localeCompare(b.slug)
        || a.field.localeCompare(b.field));

    const bySpot = new Map();
    for (const item of items) {
        if (!bySpot.has(item.slug)) bySpot.set(item.slug, []);
        bySpot.get(item.slug).push(item);
    }

    const pack = {
        generatedAt: new Date().toISOString(),
        totalItems: items.length,
        labels: {
            F8: 'catalogue stale — the page states the extracted value; update the catalogue',
            'extractor-wrong': 'the page does not support the extracted value',
            'stored-wrong': 'neither value is right; the stored one is also wrong',
            ambiguous: 'the page genuinely supports both, or is unreadable on this point',
        },
        instructions: [
            'Open sourceUrl. Find sourceQuote on the page (Ctrl-F).',
            'If the quote is absent, label extractor-wrong and say so — that is a fabrication.',
            'If present, decide whether it supports the extracted value or the stored one.',
            'Fill "decision" on every item. An unfilled item keeps the whole gate INCONCLUSIVE.',
        ],
        spots: [...bySpot.entries()].map(([slug, rows]) => ({
            slug,
            sourceDomain: (() => { try { return new URL(rows[0].sourceUrl ?? '').hostname; } catch { return null; } })(),
            items: rows.map((r) => ({
                key: r.key,
                field: r.label ?? r.field,
                stored: r.stored,
                extracted: r.extracted,
                sourceUrl: r.sourceUrl,
                sourceQuote: r.sourceQuote,
                decision: '',
            })),
        })),
    };
    writeFileSync(join(dir, 'triage.pack.json'), JSON.stringify(pack, null, 2));
    // Flat decision file: the thing --triage actually consumes.
    writeFileSync(join(dir, 'triage.decisions.json'),
        JSON.stringify(Object.fromEntries(items.map((i) => [i.key, ''])), null, 2));
    return pack;
};

/**
 * A local review page for the triage pack.
 *
 * Written next to the pack as a single self-contained file: no server, no
 * fetch, no dependencies, opened straight off disk. The pack is inlined
 * because a file:// page cannot fetch its siblings, and the whole point is that
 * an operator can open it without running anything.
 *
 * It never writes anywhere the pipeline reads. Progress lives in localStorage
 * and leaves by an explicit Export, so the decisions file only changes when
 * somebody says so.
 */
const writeTriageHtml = (pack, dir) => {
    // `</script>` inside a JSON string would end the block early.
    const inlined = JSON.stringify(pack).replace(/</g, '\\u003c');
    const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Triage — ${pack.totalItems} items</title>
<style>
:root{--bg:#f7f7f5;--card:#fff;--ink:#1a1a18;--muted:#6b6b66;--line:#e3e3df;--accent:#2f5fd0;
--f8:#0a7d55;--wrong:#c0392b;--stored:#b8860b;--amb:#6b6b66}
*{box-sizing:border-box}
body{margin:0;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:var(--bg);color:var(--ink)}
header{position:sticky;top:0;z-index:10;background:var(--card);border-bottom:1px solid var(--line);padding:12px 20px}
h1{margin:0 0 8px;font-size:16px}
.bar{display:flex;gap:16px;flex-wrap:wrap;align-items:center}
.counts{display:flex;gap:14px;flex-wrap:wrap;font-variant-numeric:tabular-nums}
.counts b{font-weight:700}
.progress{height:6px;background:var(--line);border-radius:3px;overflow:hidden;flex:1;min-width:160px}
.progress i{display:block;height:100%;background:var(--accent);width:0}
select,button{font:inherit;padding:5px 9px;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--ink)}
button{cursor:pointer}
button.primary{background:var(--accent);color:#fff;border-color:var(--accent)}
main{padding:16px 20px;max-width:1100px;margin:0 auto}
.spot{margin-bottom:22px}
.spot h2{font-size:14px;margin:0 0 8px;display:flex;gap:10px;align-items:baseline}
.spot h2 span{font-weight:400;color:var(--muted)}
.item{background:var(--card);border:1px solid var(--line);border-left:4px solid var(--line);border-radius:8px;padding:12px 14px;margin-bottom:8px}
.item.done{border-left-color:var(--accent)}
.item[data-d="F8"]{border-left-color:var(--f8)}
.item[data-d="extractor-wrong"]{border-left-color:var(--wrong)}
.item[data-d="stored-wrong"]{border-left-color:var(--stored)}
.item[data-d="ambiguous"]{border-left-color:var(--amb)}
.key{font:12px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--muted)}
.vals{display:flex;gap:22px;flex-wrap:wrap;margin:6px 0}
.vals div{font-size:13px}
.vals label{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
.quote{background:#faf9f6;border:1px solid var(--line);border-radius:6px;padding:8px 10px;margin:8px 0;
white-space:pre-wrap;font-size:13px}
a{color:var(--accent);word-break:break-all}
.choices{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.choices button{font-size:12px}
.choices button[aria-pressed="true"]{background:var(--ink);color:#fff;border-color:var(--ink)}
.hidden{display:none}
footer{padding:20px;text-align:center;color:var(--muted);font-size:12px}
</style></head><body>
<header>
  <h1>Catalogue triage <span class="key">— decisions stay in this browser until you Export</span></h1>
  <div class="bar">
    <div class="counts">
      <span>total <b id="c-total">0</b></span>
      <span>decided <b id="c-done">0</b></span>
      <span>remaining <b id="c-left">0</b></span>
      <span style="color:var(--f8)">F8 <b id="c-F8">0</b></span>
      <span style="color:var(--wrong)">extractor-wrong <b id="c-extractor-wrong">0</b></span>
      <span style="color:var(--stored)">stored-wrong <b id="c-stored-wrong">0</b></span>
      <span style="color:var(--amb)">ambiguous <b id="c-ambiguous">0</b></span>
    </div>
    <div class="progress"><i id="bar"></i></div>
  </div>
  <div class="bar" style="margin-top:8px">
    <label>spot <select id="f-spot"><option value="">all</option></select></label>
    <label>label <select id="f-label">
      <option value="">all</option><option value="__undecided">undecided only</option>
      <option>F8</option><option>extractor-wrong</option><option>stored-wrong</option><option>ambiguous</option>
    </select></label>
    <button id="import">Import decisions…</button>
    <button id="export" class="primary">Export triage.decisions.json</button>
    <button id="reset">Clear</button>
    <input id="file" type="file" accept="application/json" class="hidden">
  </div>
</header>
<main id="list"></main>
<footer>Keys are the exact <code>--rescore</code> identifiers. Export writes every key, blank where undecided.</footer>
<script>
const PACK = ${inlined};
const LABELS = ['F8','extractor-wrong','stored-wrong','ambiguous'];
const STORE = 'triage.' + (PACK.generatedAt || 'pack');
let decisions = {};
try { decisions = JSON.parse(localStorage.getItem(STORE) || '{}'); } catch (e) { decisions = {}; }

const allItems = PACK.spots.flatMap(s => s.items.map(i => ({...i, slug: s.slug, domain: s.sourceDomain})));
const save = () => { try { localStorage.setItem(STORE, JSON.stringify(decisions)); } catch (e) {} };

function counts(){
  const done = allItems.filter(i => decisions[i.key]).length;
  document.getElementById('c-total').textContent = allItems.length;
  document.getElementById('c-done').textContent = done;
  document.getElementById('c-left').textContent = allItems.length - done;
  for (const l of LABELS) document.getElementById('c-'+l).textContent = allItems.filter(i => decisions[i.key]===l).length;
  document.getElementById('bar').style.width = (allItems.length ? done/allItems.length*100 : 0) + '%';
}

function render(){
  const fs = document.getElementById('f-spot').value, fl = document.getElementById('f-label').value;
  const list = document.getElementById('list');
  list.textContent = '';
  for (const spot of PACK.spots){
    if (fs && spot.slug !== fs) continue;
    const rows = spot.items.filter(i => {
      if (fl === '__undecided') return !decisions[i.key];
      if (fl) return decisions[i.key] === fl;
      return true;
    });
    if (!rows.length) continue;
    const sec = document.createElement('section'); sec.className = 'spot';
    const h = document.createElement('h2');
    h.append(spot.slug);
    const sp = document.createElement('span'); sp.textContent = (spot.sourceDomain||'') + ' · ' + rows.length + ' item(s)';
    h.append(sp); sec.append(h);
    for (const it of rows){
      const d = decisions[it.key] || '';
      const card = document.createElement('article');
      card.className = 'item' + (d ? ' done' : ''); card.dataset.d = d;
      const k = document.createElement('div'); k.className='key'; k.textContent = it.key + '  ·  ' + it.field;
      const vals = document.createElement('div'); vals.className='vals';
      for (const [lab,val] of [['stored',it.stored],['extracted',it.extracted]]){
        const box=document.createElement('div'); const l=document.createElement('label'); l.textContent=lab;
        box.append(l, document.createTextNode(val==null?'—':String(val))); vals.append(box);
      }
      const src=document.createElement('div');
      const a=document.createElement('a'); a.href=it.sourceUrl||'#'; a.target='_blank'; a.rel='noreferrer noopener';
      a.textContent=it.sourceUrl||'(no source)'; src.append(a);
      const q=document.createElement('div'); q.className='quote'; q.textContent=it.sourceQuote||'(no quote)';
      const ch=document.createElement('div'); ch.className='choices';
      for (const l of LABELS){
        const b=document.createElement('button'); b.textContent=l;
        b.setAttribute('aria-pressed', String(d===l));
        b.onclick=()=>{ decisions[it.key] = (decisions[it.key]===l ? '' : l); if(!decisions[it.key]) delete decisions[it.key]; save(); counts(); render(); };
        ch.append(b);
      }
      card.append(k, vals, src, q, ch); sec.append(card);
    }
    list.append(sec);
  }
  counts();
}

const spotSel=document.getElementById('f-spot');
for (const s of PACK.spots){ const o=document.createElement('option'); o.value=s.slug; o.textContent=s.slug+' ('+s.items.length+')'; spotSel.append(o); }
spotSel.onchange=render; document.getElementById('f-label').onchange=render;

document.getElementById('export').onclick=()=>{
  // Every key, blank where undecided — the shape --rescore expects.
  const out={}; for (const i of allItems) out[i.key]=decisions[i.key]||'';
  const blob=new Blob([JSON.stringify(out,null,1)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='triage.decisions.json'; a.click();
  URL.revokeObjectURL(a.href);
};
document.getElementById('import').onclick=()=>document.getElementById('file').click();
document.getElementById('file').onchange=async e=>{
  const f=e.target.files[0]; if(!f) return;
  try{ const j=JSON.parse(await f.text());
    for (const [k,v] of Object.entries(j)) if (v) decisions[k]=v;
    save(); render();
  }catch(err){ alert('Could not read that file: '+err); }
};
document.getElementById('reset').onclick=()=>{ if(confirm('Clear all decisions in this browser?')){ decisions={}; save(); render(); } };
render();
</script></body></html>`;
    writeFileSync(join(dir, 'triage.html'), html);
};

const rescore = async () => {
    const files = readdirSync(RESCORE).filter((f) => f.endsWith('.json') && !f.startsWith('triage.'));
    const results = files.map((f) => JSON.parse(readFileSync(join(RESCORE, f), 'utf8')));
    const triage = TRIAGE ? JSON.parse(readFileSync(TRIAGE, 'utf8')) : {};
    const decided = Object.fromEntries(Object.entries(triage).filter(([, v]) => v && String(v).trim() !== ''));

    const comparisons = results.map((r) => compareToStored(r, r.stored));
    const gate = computeGate(comparisons, decided);

    console.log(`Rescore — ${results.length} spot results from ${RESCORE}`);
    console.log(`  triage decisions supplied: ${Object.keys(decided).length}\n`);
    for (const g of gate.gates) {
        const v = typeof g.value === 'number' && g.value % 1 !== 0 ? g.value.toFixed(3) : g.value;
        const mark = g.pass === null ? 'n/a ' : g.pass ? 'PASS' : 'FAIL';
        console.log(`  ${mark}  ${g.name.padEnd(22)} ${String(v ?? '—').padStart(6)}  (target ${g.target})`);
    }
    console.log(`\n  F8 (catalogue stale): ${gate.f8}`);
    console.log(`  untriaged           : ${gate.untriaged.length}`);
    if (gate.untriaged.length > 0) {
        for (const key of gate.untriaged.slice(0, 10)) console.log(`      ${key}`);
        if (gate.untriaged.length > 10) console.log(`      … and ${gate.untriaged.length - 10} more`);
    }
    console.log(`\n  VERDICT: ${gate.verdict}`);

    const pack = writeTriagePack(comparisons, RESCORE, ['cascade-waterpark-fr:season', 'rille-wake-park-fr:season']);
    writeTriageHtml(pack, RESCORE);
    console.log(`\n  triage.pack.json      : ${pack.totalItems} item(s) across ${pack.spots.length} spot(s)`);
    console.log(`  triage.html           : open in a browser to review and export`);
    console.log('  triage.decisions.json : fill each value, then re-run with --triage=<that file>');
    if (gate.verdict !== 'GO') process.exitCode = 1;
};

const run = async () => {
    if (RESCORE) return rescore();

    let slugs;
    const worklist = arg('worklist');
    if (IS_EVAL) slugs = EVAL_SLUGS;
    else if (arg('slug')) slugs = [arg('slug')];
    else if (worklist === 'batch1') {
        const rows = await getJson(`/api/destinations/spots?activity=${encodeURIComponent(ACTIVITY)}`);
        slugs = (rows ?? []).filter((s) => s.slug).map((s) => s.slug);
    } else if (worklist) slugs = JSON.parse(readFileSync(worklist, 'utf8'));
    else { console.error('Give --slug=, --worklist= or --eval.'); process.exit(2); }

    const targets = IS_EVAL ? ['season', 'prices'] : (arg('targets', 'season,prices').split(','));

    if (!KEY && !FETCH_ONLY && !process.argv.includes('--allow-no-key')) {
        console.error('No NVIDIA key.\n\n'
            + '  export NVIDIA_API_KEY=nvapi-…                       # from build.nvidia.com\n'
            + '  …or --key-file=../slumber/src/main/resources/application-local.yml   # reads nvidia.api.key\n\n'
            + `Endpoint ${API_BASE}, model ${MODEL} (both overridable with --api-base= and --model=).\n`
            + 'Re-run with --allow-no-key to exercise fetching and validation without the model.');
        process.exit(2);
    }

    if (OUT) mkdirSync(OUT, { recursive: true });

    // Calibrate before measuring. The deadline has to describe this model on
    // this endpoint right now, not the endpoint as it was when a constant was
    // chosen. Uses three of the fixtures the run is about to score, so the
    // warm-up payloads are the same shape and size as the real work.
    let calibration = null;
    if (!FETCH_ONLY && KEY && !process.argv.includes('--no-calibrate')) {
        const samples = [];
        for (const slug of slugs.slice(0, CALIBRATION.warmupCalls)) {
            const fixture = OFFLINE ? loadOffline(OFFLINE, slug) : null;
            const pages = (fixture?.pages ?? []).filter((p) => p.status === 200 && p.text.length > 40);
            if (pages.length > 0) samples.push(pages);
        }
        if (samples.length > 0) {
            process.stderr.write(`  calibrating ${MODEL} on ${samples.length} real payload(s) … `);
            calibration = await calibrate(samples);
            REQUEST_TIMEOUT_MS = calibration.timeoutMs;
            process.stderr.write(`p95=${calibration.p95 ?? 'n/a'}ms timeout=${REQUEST_TIMEOUT_MS}ms\n`);
        }
    }

    const results = [];
    for (const slug of slugs) {
        process.stderr.write(`  ${slug} … `);
        const result = await extractOne(slug, targets);
        process.stderr.write(`${result.verdict}\n`);
        results.push(result);
        if (OUT) writeFileSync(join(OUT, `${slug}.json`), JSON.stringify(result, null, 2));
    }

    if (!IS_EVAL) {
        const by = (v) => results.filter((r) => r.verdict === v).length;
        console.log(`\nrun ${RUN_ID} · model ${MODEL}`);
        console.log(`  accepted ${by('accepted')} · hold ${by('hold')} · rejected ${by('rejected')}`
            + ` · no-yield ${by('no-yield')} · transport-failed ${by('transport-failed')}`);
        for (const result of results.filter((r) => r.verdict !== 'accepted')) {
            console.log(`\n  ${result.slug} — ${result.verdict}`);
            if (result.transport) console.log(`    ${result.transport.code} (${result.transport.attempts} attempt(s)) — ${result.transport.detail}`);
            for (const reason of (result.reasons?.length ? result.reasons : result.rejected) ?? []) console.log(`    ${reason.code} ${reason.field} — ${reason.detail}`);
        }
        if (OUT) console.log(`\nWrote ${results.length} file(s) to ${OUT}. Nothing was written to the catalogue.`);
        return;
    }

    // ─── Eval ────────────────────────────────────────────────────────────────
    const triage = TRIAGE ? JSON.parse(readFileSync(TRIAGE, 'utf8')) : {};
    const comparisons = results.map((r) => compareToStored(r, r.stored));
    const gate = computeGate(comparisons, triage);

    console.log(`\nEvaluation — ${results.length} verified spots · model ${MODEL}\n`);
    for (const gateRow of gate.gates) {
        const value = typeof gateRow.value === 'number' && gateRow.value % 1 !== 0 ? gateRow.value.toFixed(3) : gateRow.value;
        const mark = gateRow.pass === null ? 'n/a ' : gateRow.pass ? 'PASS' : 'FAIL';
        console.log(`  ${mark}  ${gateRow.name.padEnd(22)} ${String(value ?? '—').padStart(6)}  (target ${gateRow.target})`);
    }
    if (gate.untested?.length) {
        console.log(`\n  ${gate.untested.length} gate(s) had nothing to judge: ${gate.untested.join(', ')}.`);
        console.log('  Not met — untested. A criterion with an empty sample is not a pass.');
    }
    console.log(`\n  transport failures : ${gate.transport.failures}/${results.length}`
        + ` (${(gate.transport.rate * 100).toFixed(0)}%) · reached validator: ${gate.transport.reachedValidator}`);
    if (gate.transport.failures > 0) console.log(`  transport by code  : ${JSON.stringify(gate.transport.byCode)}`);
    console.log(`  request timeouts   : ${results.filter((r) => r.transport?.code === 'T_REQUEST_TIMEOUT').length}`
        + ` (deadline ${REQUEST_TIMEOUT_MS}ms, not retried)`);
    console.log(`  no-yield           : ${results.filter((r) => r.verdict === 'no-yield').length}`);
    console.log(`  F8 (catalogue stale, extractor right): ${gate.f8}`);

    if (gate.untriaged.length > 0) {
        console.log(`\n  ${gate.untriaged.length} disagreement(s) await triage. The gate cannot pass until each is`);
        console.log('  checked against its cited page — a disagreement is as likely to be a stale');
        console.log('  catalogue value (F8) as an extraction error.\n');
        const items = comparisons.flatMap((c) => c.pendingTriage.map((t) => ({ ...t, slug: c.slug })));
        if (OUT) {
            const path = join(OUT, 'triage.todo.json');
            writeFileSync(path, JSON.stringify(Object.fromEntries(items.map((i) => [`${i.slug}:${i.field}`, {
                ...i, decision: 'F8 | F3 | F4 | F5',
            }])), null, 2));
            console.log(`  Worklist written to ${path}. Fill each "decision", then re-run with --triage=<file>.`);
        }
        for (const item of items.slice(0, 8)) console.log(`    ${item.slug}:${item.field} — stored ${item.stored}, extracted ${item.extracted}`);
    }

    if (JSON_SUMMARY) {
        const codes = {};
        for (const result of results) {
            for (const reason of result.rejected ?? []) codes[reason.code] = (codes[reason.code] ?? 0) + 1;
        }
        const acceptedFacts = results.reduce((n, r) => n
            + ((r.output?.season && !(r.rejected ?? []).some((x) => (x.field ?? '').startsWith('season'))) ? 1 : 0)
            + (r.output?.prices ?? []).filter((_, i) => !(r.rejected ?? []).some((x) => (x.field ?? '').startsWith(`prices[${i}]`))).length, 0);
        writeFileSync(JSON_SUMMARY, JSON.stringify({
            model: MODEL,
            spots: results.length,
            // Stated in the artifact so a matrix row can be read years later
            // without guessing what the harness did on a 429.
            retryPolicy: { ...RETRY, requestTimeoutMs: REQUEST_TIMEOUT_MS, maxTokens: MAX_TOKENS, modelParams: MODEL_PARAMS[MODEL] ?? {} },
            calibration: calibration ? {
                bounds: CALIBRATION,
                warmupLatenciesMs: calibration.latencies,
                warmupAttempts: calibration.attempts,
                p95Ms: calibration.p95,
                successfulWarmups: calibration.successfulWarmups,
                timeoutMs: calibration.timeoutMs,
            } : null,
            reliability: {
                transportFailureRate: gate.transport.rate,
                reachedValidator: gate.transport.reachedValidator,
                parseFailures: results.filter((r) => ['T_REPLY_NOT_JSON', 'T_REPLY_TRUNCATED'].includes(r.transport?.code)).length,
                // The thresholds are recorded beside the values so a row can be
                // re-judged without re-deriving what it was judged against.
                thresholds: { maxTransportRate: 0.20, minReached: 12, maxParseFailures: 1 },
            },
            verdicts: {
                accepted: results.filter((r) => r.verdict === 'accepted').length,
                hold: results.filter((r) => r.verdict === 'hold').length,
                rejected: results.filter((r) => r.verdict === 'rejected').length,
                noYield: results.filter((r) => r.verdict === 'no-yield').length,
                transportFailed: results.filter((r) => r.verdict === 'transport-failed').length,
            },
            transport: gate.transport,
            parseFailures: results.filter((r) => ['T_REPLY_NOT_JSON', 'T_REPLY_TRUNCATED'].includes(r.transport?.code)).length,
            requestTimeouts: results.filter((r) => r.transport?.code === 'T_REQUEST_TIMEOUT').length,
            retryAttempts: results.reduce((n, r) => n + (r.transport?.attempts ?? 0), 0),
            acceptedFacts,
            rejectedFacts: Object.values(codes).reduce((a, b) => a + b, 0),
            topReasonCodes: Object.fromEntries(Object.entries(codes).sort((a, b) => b[1] - a[1]).slice(0, 5)),
            gates: gate.gates,
            untriaged: gate.untriaged.length,
            f8: gate.f8,
            verdict: gate.verdict,
        }, null, 2));
    }

    console.log(`\n  VERDICT: ${gate.verdict}`);
    if (gate.verdict !== 'GO') process.exitCode = 1;
};

run().catch((error) => { console.error(error); process.exit(1); });
