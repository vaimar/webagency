import React, { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

// ─── Cache schema ─────────────────────────────────────────────────────────────
// Bump CACHE_VERSION whenever the shape of stored data changes.
const CACHE_VERSION = 'v2';
const CACHE_STORAGE_KEY = 'webagency.cache';

/** Default TTLs in milliseconds */
export const CACHE_TTL = {
    /** Flight destination ideas — fairly stable */
    FLIGHT_DESTINATIONS: 6 * 60 * 60 * 1000,   // 6 hours
    /** AI-generated trip content — short; backend is source of truth */
    TRIP_SUGGESTION: 15 * 60 * 1000,             // 15 minutes
    /** AI provider list — changes rarely */
    AI_PROVIDERS: 60 * 60 * 1000,                // 1 hour
} as const;

interface CacheEntry<T = unknown> {
    value: T;
    expiresAt: number;
    version: string;
}

interface CacheStore {
    [key: string]: CacheEntry;
}

interface CacheContextType {
    getCachedResult: <T>(query: string) => T | undefined;
    updateCache: <T>(query: string, result: T, ttlMs?: number) => void;
    clearCache: (query?: string) => void;
}

// ─── Persistence helpers ──────────────────────────────────────────────────────

const loadInitialCache = (): CacheStore => {
    if (typeof window === 'undefined') return {};
    try {
        const stored = window.localStorage.getItem(CACHE_STORAGE_KEY);
        if (!stored) return {};
        return JSON.parse(stored) as CacheStore;
    } catch {
        return {};
    }
};

const pruneExpired = (store: CacheStore): CacheStore => {
    const now = Date.now();
    const pruned: CacheStore = {};
    for (const key of Object.keys(store)) {
        const entry = store[key];
        if (entry && entry.version === CACHE_VERSION && entry.expiresAt > now) {
            pruned[key] = entry;
        }
        // entries with wrong version or past expiry are silently dropped
    }
    return pruned;
};

// ─── Context ──────────────────────────────────────────────────────────────────

const CacheContext = createContext<CacheContextType | undefined>(undefined);

export const CacheProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [cache, setCache] = useState<CacheStore>(() => pruneExpired(loadInitialCache()));

    useEffect(() => {
        if (typeof window !== 'undefined') {
            window.localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(cache));
        }
    }, [cache]);

    const getCachedResult = useCallback(
        <T,>(query: string): T | undefined => {
            const entry = cache[query] as CacheEntry<T> | undefined;
            if (!entry) return undefined;
            // Double-check version + TTL at read time
            if (entry.version !== CACHE_VERSION || entry.expiresAt <= Date.now()) {
                return undefined;
            }
            return entry.value;
        },
        [cache],
    );

    const updateCache = useCallback(<T,>(query: string, result: T, ttlMs: number = CACHE_TTL.FLIGHT_DESTINATIONS) => {
        const entry: CacheEntry<T> = {
            value: result,
            expiresAt: Date.now() + ttlMs,
            version: CACHE_VERSION,
        };
        setCache((prev) => ({ ...prev, [query]: entry }));
    }, []);

    const clearCache = useCallback((query?: string) => {
        if (!query) {
            setCache({});
            return;
        }
        setCache((prev) => {
            const next = { ...prev };
            delete next[query];
            return next;
        });
    }, []);

    const value = useMemo(
        () => ({ getCachedResult, updateCache, clearCache }),
        [clearCache, getCachedResult, updateCache],
    );

    return <CacheContext.Provider value={value}>{children}</CacheContext.Provider>;
};

export const useCache = () => {
    const context = useContext(CacheContext);
    if (!context) throw new Error('useCache must be used within a CacheProvider');
    return context;
};
