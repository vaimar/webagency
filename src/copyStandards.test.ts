/**
 * The copy standards in docs/POSITIONING.md, as a test.
 *
 * A positioning document that is only prose drifts: someone writes "best price
 * guarantee" into a hero eighteen months from now and no reviewer remembers a
 * markdown file said not to. The banned patterns below are the "Not allowed"
 * list from that document, encoded so the build fails instead.
 *
 * Scope is user-facing source only. Comments are stripped before matching, so
 * a comment *discussing* a banned phrase — Main.tsx explains which trust
 * badges it deliberately replaced — is not a violation.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(process.cwd(), 'src');

/**
 * Absolute claims about price, coverage and finality.
 *
 * Each pattern targets the *unqualified* form. "across every airline it knows"
 * is honest and passes; "across every airline" would not. That distinction is
 * the whole point of the standard, so patterns are written narrowly enough to
 * keep it rather than banning the words outright.
 */
const BANNED: ReadonlyArray<{ pattern: RegExp; why: string }> = [
    // Price claims. `guarantee` on its own is allowed: the legal pages need
    // "availability is not guaranteed" and "what we do not guarantee".
    { pattern: /\bbest price\b/i, why: 'we do not compare the market' },
    { pattern: /\bprice (guarantee|match)\b/i, why: 'we guarantee no price' },
    { pattern: /\bguaranteed (cheapest|lowest|best)\b/i, why: 'no fare is guaranteed' },
    { pattern: /\b(cheapest|lowest|best) (price|fare|flight)s? guaranteed\b/i, why: 'no fare is guaranteed' },
    { pattern: /\bwe guarantee\b/i, why: 'we guarantee nothing about price or availability' },
    { pattern: /\blowest (price|fare)s?\b/i, why: 'we see one fare per day per route, not the market' },
    { pattern: /\bunbeatable\b/i, why: 'unfalsifiable price claim' },

    // Coverage claims.
    { pattern: /\ball (flights|routes|fares|airlines|carriers)\b/i, why: 'coverage is partial by design' },
    { pattern: /\bevery (flight|route|fare|airline|carrier) (in|on|across) the (market|world)\b/i, why: 'coverage is partial by design' },
    { pattern: /\b(complete|full|universal|total) coverage\b/i, why: 'coverage is partial by design' },
    { pattern: /\ball markets\b/i, why: 'one departure region is supported' },
    { pattern: /\bfully (verified|priced|covered)\b/i, why: 'fares carry provenance, not verification' },

    // Finality claims.
    { pattern: /\b100% (accurate|verified|reliable|complete)\b/i, why: 'unfalsifiable accuracy claim' },
    { pattern: /\bbook instantly\b/i, why: 'booking happens on the provider site, not here' },
];

/**
 * Deliberate exceptions. An entry here is a reviewed decision with a reason
 * attached — which is the difference between an exception and a regression.
 * Keep it short; a long allowlist means the patterns are wrong, not that the
 * copy is fine.
 */
const ALLOWLIST: ReadonlyArray<{ file: string; pattern: string; why: string }> = [
    {
        file: 'src/components/TripFlightsTab.tsx',
        pattern: '\\ball (flights|routes|fares|airlines|carriers)\\b',
        why: '"All routes" is the unfiltered view-mode tab, sitting beside "Cheapest first" '
            + 'and "Anti-Cauchemar approved". It scopes a filter over the rows already found, '
            + 'not a claim about what exists in the market.',
    },
];

/**
 * Strips comments while respecting string and template literals, so that
 * `'https://example.com'` survives and `// best price` does not. Regex
 * literals are not tracked; none in this codebase contain a comment sequence.
 */
function stripComments(source: string): string {
    let out = '';
    let i = 0;
    let quote: string | null = null;

    while (i < source.length) {
        const c = source[i];
        const next = source[i + 1];

        if (quote) {
            if (c === '\\') {
                out += '  ';
                i += 2;
                continue;
            }
            if (c === quote) quote = null;
            out += c;
            i += 1;
            continue;
        }

        if (c === '"' || c === "'" || c === '`') {
            quote = c;
            out += c;
            i += 1;
            continue;
        }

        if (c === '/' && next === '/') {
            while (i < source.length && source[i] !== '\n') i += 1;
            continue;
        }

        if (c === '/' && next === '*') {
            i += 2;
            while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i += 1;
            i += 2;
            continue;
        }

        out += c;
        i += 1;
    }

    return out;
}

function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) return sourceFiles(full);
        if (!/\.tsx?$/.test(entry.name)) return [];
        // Tests and fixtures are not user-facing copy, and they legitimately
        // assert on strings this standard forbids elsewhere.
        if (/\.(test|spec)\.tsx?$/.test(entry.name)) return [];
        return [full];
    });
}

function lineOf(source: string, index: number): number {
    return source.slice(0, index).split('\n').length;
}

describe('copy standards (docs/POSITIONING.md)', () => {
    const files = sourceFiles(SRC);

    it('scans the source tree', () => {
        // A glob that silently matches nothing would make every assertion below
        // pass for the wrong reason.
        expect(files.length).toBeGreaterThan(50);
    });

    it('makes no absolute price, coverage or finality claim', () => {
        const violations: string[] = [];

        for (const file of files) {
            const rel = relative(process.cwd(), file);
            const code = stripComments(readFileSync(file, 'utf8'));

            for (const { pattern, why } of BANNED) {
                const rx = new RegExp(pattern.source, `${pattern.flags.replace('g', '')}g`);
                let match: RegExpExecArray | null;

                while ((match = rx.exec(code)) !== null) {
                    const allowed = ALLOWLIST.some(
                        (entry) => entry.file === rel && entry.pattern === pattern.source,
                    );
                    if (allowed) continue;
                    violations.push(`${rel}:${lineOf(code, match.index)} — "${match[0]}" (${why})`);
                }
            }
        }

        expect(
            violations,
            `Copy that overclaims. Rewrite it, or add a reviewed entry to ALLOWLIST in this file:\n${violations.join('\n')}`,
        ).toEqual([]);
    });
});
