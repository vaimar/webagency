import React, { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

interface CacheStore {
    [query: string]: unknown;
}

interface CacheContextType {
    getCachedResult: <T>(query: string) => T | undefined;
    updateCache: <T>(query: string, result: T) => void;
    clearCache: (query?: string) => void;
}

const CACHE_STORAGE_KEY = 'webagency.cache';

const loadInitialCache = (): CacheStore => {
    if (typeof window === 'undefined') {
        return {};
    }

    const storedCache = window.localStorage.getItem(CACHE_STORAGE_KEY);
    if (!storedCache) {
        return {};
    }

    try {
        return JSON.parse(storedCache) as CacheStore;
    } catch {
        return {};
    }
};

const CacheContext = createContext<CacheContextType | undefined>(undefined);

export const CacheProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [cache, setCache] = useState<CacheStore>(() => loadInitialCache());

    useEffect(() => {
        if (typeof window !== 'undefined') {
            window.localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(cache));
        }
    }, [cache]);

    const getCachedResult = useCallback(
        <T,>(query: string) => {
            return cache[query] as T | undefined;
        },
        [cache],
    );

    const updateCache = useCallback(<T,>(query: string, result: T) => {
        setCache((prevCache) => ({
            ...prevCache,
            [query]: result,
        }));
    }, []);

    const clearCache = useCallback((query?: string) => {
        if (!query) {
            setCache({});
            return;
        }

        setCache((prevCache) => {
            const nextCache = { ...prevCache };
            delete nextCache[query];
            return nextCache;
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
    if (!context) {
        throw new Error('useCache must be used within a CacheProvider');
    }
    return context;
};
