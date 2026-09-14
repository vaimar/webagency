// Feature flags.
//
// Read at call time rather than module scope so a flag can be flipped in a
// test without reloading the module. Values come through readEnv(), which
// checks Vite's import.meta.env first and falls back to process.env — the
// source Vitest tests set — so this works in the built app and under test.

import { readEnv } from './env';

/** Values that count as "on" in an env var. */
const TRUTHY = ['1', 'true', 'on', 'yes'];
const FALSY = ['0', 'false', 'off', 'no'];

const readEnvFlag = (raw: string | undefined): boolean | null => {
    const value = (raw ?? '').trim().toLowerCase();
    if (TRUTHY.includes(value)) return true;
    if (FALSY.includes(value)) return false;
    return null;
};

/**
 * A per-visit override, so the flag can be demoed on an already-built deploy
 * without a rebuild: `?rideFinder=1` turns it on, `?rideFinder=0` off.
 * This is a UI flag, not a security boundary — nothing privileged sits behind it.
 */
const readUrlOverride = (search: string, key: string): boolean | null => {
    try {
        return readEnvFlag(new URLSearchParams(search).get(key) ?? undefined);
    } catch {
        return null;
    }
};

const currentSearch = (): string => (
    typeof window === 'undefined' ? '' : window.location.search
);

/**
 * Ride Finder: the deterministic intent search surface.
 * Off by default — it ships before the curated venue data that makes its
 * surface/beginner/warmth filters return anything.
 */
export const isRideFinderEnabled = (search: string = currentSearch()): boolean => (
    readUrlOverride(search, 'rideFinder')
    ?? readEnvFlag(readEnv('REACT_APP_RIDE_FINDER'))
    ?? false
);
