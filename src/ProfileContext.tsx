import React, {
    ReactNode,
    createContext,
    useCallback,
    useContext,
    useMemo,
    useState,
} from 'react';
import {
    Account,
    AiProviderName,
    LoginRequest,
    PreferredTransport,
    RegisterAccountRequest,
    TravelPace,
    UpdateUserProfileRequest,
    UserProfile,
    getPreferences,
    loginAccount,
    registerAccount,
    updatePreferences,
} from './services/api';

// ─── Anonymous defaults (mid-range traveller) ─────────────────────────────────

export const ANONYMOUS_PROFILE: UserProfile = {
    dailyBudget: 100,
    pace: 'balanced',
    preferredTransport: 'public_transport',
    foodPreferences: [],
    preferredAiProvider: null,
};

// ─── Context shape ────────────────────────────────────────────────────────────

export interface ProfileContextType {
    /** Current effective profile — anonymous defaults or the loaded user profile */
    profile: UserProfile;
    account: Account | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    error: string | null;
    login: (request: LoginRequest) => Promise<void>;
    register: (request: RegisterAccountRequest) => Promise<void>;
    logout: () => void;
    savePreferences: (request: UpdateUserProfileRequest) => Promise<void>;
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

// ─── Provider ─────────────────────────────────────────────────────────────────

export const ProfileProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [account, setAccount] = useState<Account | null>(null);
    const [profile, setProfile] = useState<UserProfile>(ANONYMOUS_PROFILE);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const isAuthenticated = account !== null;

    const login = useCallback(async (request: LoginRequest) => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await loginAccount(request);
            setAccount({ username: response.username ?? request.username });
            // Load the user's stored preferences after login
            try {
                const prefs = await getPreferences();
                setProfile(prefs);
            } catch {
                // If prefs endpoint fails, keep anonymous defaults — not fatal
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Login failed');
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, []);

    const register = useCallback(async (request: RegisterAccountRequest) => {
        setIsLoading(true);
        setError(null);
        try {
            const created = await registerAccount(request);
            setAccount(created);
            setProfile(ANONYMOUS_PROFILE); // start with clean defaults
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Registration failed');
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, []);

    const logout = useCallback(() => {
        setAccount(null);
        setProfile(ANONYMOUS_PROFILE);
        setError(null);
    }, []);

    const savePreferences = useCallback(async (request: UpdateUserProfileRequest) => {
        setIsLoading(true);
        setError(null);
        try {
            const updated = await updatePreferences(request);
            setProfile(updated);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save preferences');
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, []);

    const value = useMemo<ProfileContextType>(
        () => ({ profile, account, isAuthenticated, isLoading, error, login, register, logout, savePreferences }),
        [profile, account, isAuthenticated, isLoading, error, login, register, logout, savePreferences],
    );

    return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export const useProfile = (): ProfileContextType => {
    const ctx = useContext(ProfileContext);
    if (!ctx) throw new Error('useProfile must be used within a ProfileProvider');
    return ctx;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const paceLabel = (pace?: TravelPace): string => {
    switch (pace) {
        case 'relaxed': return 'Relaxed';
        case 'intense': return 'Intense';
        default:        return 'Balanced';
    }
};

export const transportLabel = (t?: PreferredTransport): string => {
    switch (t) {
        case 'walking':       return 'Walking';
        case 'taxi':          return 'Taxi';
        case 'rental_car':    return 'Rental car';
        default:              return 'Public transport';
    }
};

export const providerLabel = (p?: AiProviderName | null): string => {
    switch (p) {
        case 'openai':  return 'OpenAI';
        case 'grok':    return 'Grok';
        case 'gemini':  return 'Gemini';
        default:        return 'Auto';
    }
};

