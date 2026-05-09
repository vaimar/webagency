import React, {
    ReactNode,
    createContext,
    useEffect,
    useCallback,
    useContext,
    useMemo,
    useRef,
    useState,
} from 'react';
import {
    Account,
    ApiRequestError,
    AuthFailureEvent,
    AiProviderName,
    LoginRequest,
    PreferredTransport,
    RegisterAccountRequest,
    TravelPace,
    UpdateUserProfileRequest,
    UserProfile,
    getProfile,
    getPreferences,
    loginAccount,
    logoutAccount,
    registerAccount,
    setAuthFailureHandler,
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

const ONBOARDING_STORAGE_KEY = 'travelhub:onboarding-active';
const ONBOARDING_STEP_STORAGE_KEY = 'travelhub:onboarding-step';
const AUTH_HINT_STORAGE_KEY = 'travelhub:auth-hint';

export type SyncState = 'anonymous' | 'syncing' | 'synced' | 'error';
export type ToastSource = 'planner' | 'assistant' | 'auth' | 'sync';
export interface GlobalToast {
    id: string;
    type: 'success' | 'error' | 'info';
    source: ToastSource;
    message: string;
    title?: string;
}

export type ToastInput = Omit<GlobalToast, 'id'>;

// ─── Context shape ────────────────────────────────────────────────────────────

export interface ProfileContextType {
    /** Current effective profile — anonymous defaults or the loaded user profile */
    profile: UserProfile;
    account: Account | null;
    flow: 'idle' | 'checking-session' | 'signing-in' | 'registering' | 'loading-profile' | 'saving-preferences' | 'authenticated' | 'anonymous' | 'error';
    syncState: SyncState;
    isAuthenticated: boolean;
    isLoading: boolean;
    isBootstrapping: boolean;
    isSavingPreferences: boolean;
    isOnboardingActive: boolean;
    onboardingStep: number;
    sessionNotice: string | null;
    pendingLoginRedirect: { reason: string; nonce: number } | null;
    error: string | null;
    statusMessage: string | null;
    successMessage: string | null;
    toasts: GlobalToast[];
    login: (request: LoginRequest) => Promise<void>;
    register: (request: RegisterAccountRequest) => Promise<void>;
    logout: () => Promise<void>;
    savePreferences: (request: UpdateUserProfileRequest) => Promise<void>;
    refreshSession: () => Promise<void>;
    setOnboardingStep: (step: number) => void;
    completeOnboarding: () => void;
    skipOnboarding: () => void;
    dismissToast: (id: string) => void;
    showToast: (toast: ToastInput, dedupeKey?: string) => void;
    clearSessionNotice: () => void;
    consumePendingLoginRedirect: () => void;
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

// ─── Provider ─────────────────────────────────────────────────────────────────

export const ProfileProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [account, setAccount] = useState<Account | null>(null);
    const [profile, setProfile] = useState<UserProfile>(ANONYMOUS_PROFILE);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [toasts, setToasts] = useState<GlobalToast[]>([]);
    const [flow, setFlow] = useState<ProfileContextType['flow']>('checking-session');
    const [syncState, setSyncState] = useState<SyncState>('syncing');
    const [hasCheckedSession, setHasCheckedSession] = useState(false);
    const [sessionNotice, setSessionNotice] = useState<string | null>(null);
    const [pendingLoginRedirect, setPendingLoginRedirect] = useState<{ reason: string; nonce: number } | null>(null);
    const [isOnboardingActive, setIsOnboardingActive] = useState<boolean>(() => {
        if (typeof window === 'undefined') return false;
        return window.sessionStorage.getItem(ONBOARDING_STORAGE_KEY) === '1';
    });
    const [onboardingStep, setOnboardingStepState] = useState<number>(() => {
        if (typeof window === 'undefined') return 1;
        const raw = Number.parseInt(window.sessionStorage.getItem(ONBOARDING_STEP_STORAGE_KEY) ?? '1', 10);
        return Number.isFinite(raw) && raw >= 1 && raw <= 3 ? raw : 1;
    });
    const lastToastRef = useRef<{ key: string; at: number } | null>(null);
    const toastTimersRef = useRef<Record<string, number>>({});

    const isAuthenticated = account !== null;
    const isBootstrapping = !hasCheckedSession;
    const isSavingPreferences = flow === 'saving-preferences';

    const hasAuthHint = useCallback((): boolean => {
        if (typeof window === 'undefined') return false;
        return window.localStorage.getItem(AUTH_HINT_STORAGE_KEY) === '1';
    }, []);

    const persistAuthHint = useCallback((enabled: boolean) => {
        if (typeof window === 'undefined') return;

        if (enabled) {
            window.localStorage.setItem(AUTH_HINT_STORAGE_KEY, '1');
        } else {
            window.localStorage.removeItem(AUTH_HINT_STORAGE_KEY);
        }
    }, []);

    const clearLocalAuthState = useCallback(() => {
        setAccount(null);
        setProfile(ANONYMOUS_PROFILE);
        setFlow('anonymous');
        setSyncState('anonymous');
        setIsOnboardingActive(false);
        setOnboardingStepState(1);
        persistAuthHint(false);
    }, [persistAuthHint]);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        if (isOnboardingActive) {
            window.sessionStorage.setItem(ONBOARDING_STORAGE_KEY, '1');
            window.sessionStorage.setItem(ONBOARDING_STEP_STORAGE_KEY, String(onboardingStep));
        } else {
            window.sessionStorage.removeItem(ONBOARDING_STORAGE_KEY);
            window.sessionStorage.removeItem(ONBOARDING_STEP_STORAGE_KEY);
        }
    }, [isOnboardingActive, onboardingStep]);

    useEffect(() => () => {
        Object.values(toastTimersRef.current).forEach((timeout) => window.clearTimeout(timeout));
        toastTimersRef.current = {};
    }, []);

    const dismissToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
        const timeout = toastTimersRef.current[id];
        if (timeout) {
            window.clearTimeout(timeout);
            delete toastTimersRef.current[id];
        }
    }, []);

    const showToast = useCallback((nextToast: ToastInput, dedupeKey?: string) => {
        const key = `${nextToast.source}:${dedupeKey ?? `${nextToast.type}:${nextToast.title ?? ''}:${nextToast.message}`}`;
        const now = Date.now();

        if (lastToastRef.current && lastToastRef.current.key === key && now - lastToastRef.current.at < 2500) {
            return;
        }

        lastToastRef.current = { key, at: now };
        const id = `${now}-${Math.random().toString(36).slice(2, 8)}`;
        const toast: GlobalToast = { id, ...nextToast };

        setToasts((prev) => [...prev, toast]);
        toastTimersRef.current[id] = window.setTimeout(() => {
            setToasts((prev) => prev.filter((item) => item.id !== id));
            delete toastTimersRef.current[id];
        }, 4500);
    }, []);

    const handleAuthFailure = useCallback((event: AuthFailureEvent) => {
        const message = event.status === 403 ? 'Session expired, please sign in again.' : 'Authentication required. Please sign in again.';

        clearLocalAuthState();
        setStatusMessage(null);
        setError(message);
        setSessionNotice(message);
        setPendingLoginRedirect({ reason: message, nonce: Date.now() });
        showToast({ type: 'info', source: 'auth', title: 'Session expired', message }, 'session-expired');
    }, [clearLocalAuthState, showToast]);

    useEffect(() => {
        setAuthFailureHandler(handleAuthFailure);
        return () => setAuthFailureHandler(null);
    }, [handleAuthFailure]);

    const mergeWithAnonymousDefaults = useCallback(
        (nextProfile?: UserProfile | null): UserProfile => ({
            ...ANONYMOUS_PROFILE,
            ...(nextProfile ?? {}),
        }),
        [],
    );

    const getReadableError = useCallback((err: unknown, fallback: string): string => {
        if (err instanceof ApiRequestError) {
            if (err.diagnostics.status === 401 || err.diagnostics.status === 403) return 'Invalid credentials or expired session.';
            if (err.diagnostics.status === 409) return 'This username already exists.';
            if (err.diagnostics.status === 400) return 'The submitted information is invalid.';
            return err.message;
        }

        return err instanceof Error ? err.message : fallback;
    }, []);

    const loadAuthenticatedSession = useCallback(async (success?: string) => {
        setFlow('loading-profile');
        setSyncState('syncing');
        setStatusMessage('Verifying account and loading profile from the database...');

        const verifiedAccount = await getProfile();
        const prefs = await getPreferences();

        setAccount(verifiedAccount);
        setProfile(mergeWithAnonymousDefaults(prefs));
        setFlow('authenticated');
        setSyncState('synced');
        setStatusMessage(null);
        setSessionNotice(null);
        setPendingLoginRedirect(null);
        persistAuthHint(true);
        if (success) setSuccessMessage(success);
    }, [mergeWithAnonymousDefaults, persistAuthHint]);

    const refreshSession = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        setSuccessMessage(null);
        setFlow('checking-session');
        setSyncState('syncing');
        setStatusMessage('Verifying your secure session...');

        try {
            await loadAuthenticatedSession();
        } catch (err) {
            if (err instanceof ApiRequestError && (err.diagnostics.status === 401 || err.diagnostics.status === 403 || err.diagnostics.status === 404)) {
                const hadAuthHint = hasAuthHint();
                clearLocalAuthState();
                setStatusMessage(null);
                if (hadAuthHint && (err.diagnostics.status === 401 || err.diagnostics.status === 403)) {
                    const message = 'Session expired, please sign in again.';
                    setSessionNotice(message);
                    setPendingLoginRedirect({ reason: message, nonce: Date.now() });
                    showToast({ type: 'info', source: 'auth', title: 'Session expired', message }, 'boot-session-expired');
                } else {
                    setError(null);
                    setSessionNotice(null);
                }
            } else {
                setFlow('error');
                setSyncState('error');
                setStatusMessage(null);
                const message = getReadableError(err, 'Could not verify the current session.');
                setError(message);
                showToast({ type: 'error', source: 'sync', title: 'Sync error', message }, 'session-check-error');
            }
        } finally {
            setIsLoading(false);
            setHasCheckedSession(true);
        }
    }, [clearLocalAuthState, getReadableError, hasAuthHint, loadAuthenticatedSession, showToast]);

    useEffect(() => {
        if (process.env.NODE_ENV === 'test') {
            setIsLoading(false);
            setHasCheckedSession(true);
            return;
        }

        void refreshSession();
    }, [refreshSession]);

    const login = useCallback(async (request: LoginRequest) => {
        setIsLoading(true);
        setError(null);
        setSessionNotice(null);
        setSuccessMessage(null);
        setFlow('signing-in');
        setSyncState('syncing');
        setStatusMessage('Secure sign-in in progress...');
        try {
            await loginAccount(request);
            setIsOnboardingActive(false);
            setOnboardingStepState(1);
            await loadAuthenticatedSession('Sign-in successful — profile loaded from the database.');
            showToast({ type: 'success', source: 'auth', title: 'Signed in', message: 'Account connected and synced with the database.' }, 'login-success');
        } catch (err) {
            clearLocalAuthState();
            setFlow('error');
            setSyncState('error');
            setStatusMessage(null);
            const message = getReadableError(err, 'Sign-in failed.');
            setError(message);
            showToast({ type: 'error', source: 'auth', title: 'Sign-in error', message }, 'login-error');
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, [clearLocalAuthState, getReadableError, loadAuthenticatedSession, showToast]);

    const register = useCallback(async (request: RegisterAccountRequest) => {
        setIsLoading(true);
        setError(null);
        setSessionNotice(null);
        setSuccessMessage(null);
        setFlow('registering');
        setSyncState('syncing');
        setStatusMessage('Creating your account in the database...');
        try {
            await registerAccount(request);
            setFlow('signing-in');
            setStatusMessage('Signing you in automatically and preparing your profile...');
            await loginAccount({ username: request.username, password: request.password });
            setIsOnboardingActive(true);
            setOnboardingStepState(1);
            await loadAuthenticatedSession('Account created, signed in, and synced with the database.');
            showToast({ type: 'success', source: 'auth', title: 'Account created', message: 'Account created and ready for onboarding.' }, 'register-success');
        } catch (err) {
            clearLocalAuthState();
            setFlow('error');
            setSyncState('error');
            setStatusMessage(null);
            const message = getReadableError(err, 'Account creation failed.');
            setError(message);
            showToast({ type: 'error', source: 'auth', title: 'Sign-up error', message }, 'register-error');
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, [clearLocalAuthState, getReadableError, loadAuthenticatedSession, showToast]);

    const logout = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        setSuccessMessage(null);
        setFlow('checking-session');
        setSyncState('syncing');
        setStatusMessage('Signing you out securely and closing the session...');

        try {
            await logoutAccount();
            showToast({ type: 'success', source: 'auth', title: 'Signed out', message: 'Sign-out confirmed by the server.' }, 'logout-success');
        } catch (err) {
            if (!(err instanceof ApiRequestError) || (err.diagnostics.status !== 401 && err.diagnostics.status !== 204)) {
                const message = getReadableError(err, 'Server sign-out failed.');
                setError(message);
                showToast({ type: 'error', source: 'auth', title: 'Sign-out error', message }, 'logout-error');
                throw err;
            }
        } finally {
            clearLocalAuthState();
            setError(null);
            setStatusMessage(null);
            setSessionNotice(null);
            setPendingLoginRedirect(null);
            setSuccessMessage('Session closed.');
            setIsLoading(false);
        }
    }, [clearLocalAuthState, getReadableError, showToast]);

    const savePreferences = useCallback(async (request: UpdateUserProfileRequest) => {
        setIsLoading(true);
        setError(null);
        setSuccessMessage(null);
        setFlow('saving-preferences');
        setSyncState('syncing');
        setStatusMessage('Saving your preferences to the database...');
        try {
            const updated = await updatePreferences(request);
            setProfile(mergeWithAnonymousDefaults(updated));
            setStatusMessage(null);
            setSuccessMessage('Preferences saved to the database.');
            setFlow(isAuthenticated ? 'authenticated' : 'anonymous');
            setSyncState(isAuthenticated ? 'synced' : 'anonymous');
            showToast({ type: 'success', source: 'sync', title: 'Sync successful', message: 'Synced successfully with the database.' }, 'preferences-save-success');
        } catch (err) {
            setStatusMessage(null);
            setFlow('error');
            setSyncState('error');
            const message = getReadableError(err, 'Could not save preferences.');
            setError(message);
            showToast({ type: 'error', source: 'sync', title: 'Sync error', message }, 'preferences-save-error');
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, [getReadableError, isAuthenticated, mergeWithAnonymousDefaults, showToast]);

    const setOnboardingStep = useCallback((step: number) => {
        setOnboardingStepState(Math.min(3, Math.max(1, step)));
    }, []);

    const completeOnboarding = useCallback(() => {
        setIsOnboardingActive(false);
        setOnboardingStepState(1);
        setSuccessMessage('Onboarding complete — your profile is ready and synced.');
    }, []);

    const skipOnboarding = useCallback(() => {
        setIsOnboardingActive(false);
        setOnboardingStepState(1);
        setSuccessMessage('Onboarding skipped — you can complete your profile anytime.');
    }, []);

    const clearSessionNotice = useCallback(() => setSessionNotice(null), []);
    const consumePendingLoginRedirect = useCallback(() => setPendingLoginRedirect(null), []);

    const value = useMemo<ProfileContextType>(
        () => ({
            profile,
            account,
            flow,
            syncState,
            isAuthenticated,
            isLoading,
            isBootstrapping,
            isSavingPreferences,
            isOnboardingActive,
            onboardingStep,
            sessionNotice,
            pendingLoginRedirect,
            error,
            statusMessage,
            successMessage,
            toasts,
            login,
            register,
            logout,
            savePreferences,
            refreshSession,
            setOnboardingStep,
            completeOnboarding,
            skipOnboarding,
            dismissToast,
            showToast,
            clearSessionNotice,
            consumePendingLoginRedirect,
        }),
        [
            profile,
            account,
            flow,
            syncState,
            isAuthenticated,
            isLoading,
            isBootstrapping,
            isSavingPreferences,
            isOnboardingActive,
            onboardingStep,
            sessionNotice,
            pendingLoginRedirect,
            error,
            statusMessage,
            successMessage,
            toasts,
            login,
            register,
            logout,
            savePreferences,
            refreshSession,
            setOnboardingStep,
            completeOnboarding,
            skipOnboarding,
            dismissToast,
            showToast,
            clearSessionNotice,
            consumePendingLoginRedirect,
        ],
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

