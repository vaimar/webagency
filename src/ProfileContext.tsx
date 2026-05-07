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

export type SyncState = 'anonymous' | 'syncing' | 'synced' | 'error';
export interface GlobalToast {
    type: 'success' | 'error' | 'info';
    message: string;
    title?: string;
}

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
    error: string | null;
    statusMessage: string | null;
    successMessage: string | null;
    toast: GlobalToast | null;
    login: (request: LoginRequest) => Promise<void>;
    register: (request: RegisterAccountRequest) => Promise<void>;
    logout: () => Promise<void>;
    savePreferences: (request: UpdateUserProfileRequest) => Promise<void>;
    refreshSession: () => Promise<void>;
    setOnboardingStep: (step: number) => void;
    completeOnboarding: () => void;
    skipOnboarding: () => void;
    dismissToast: () => void;
    showToast: (toast: GlobalToast, dedupeKey?: string) => void;
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
    const [toast, setToast] = useState<GlobalToast | null>(null);
    const [flow, setFlow] = useState<ProfileContextType['flow']>('checking-session');
    const [syncState, setSyncState] = useState<SyncState>('syncing');
    const [hasCheckedSession, setHasCheckedSession] = useState(false);
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

    const isAuthenticated = account !== null;
    const isBootstrapping = !hasCheckedSession;
    const isSavingPreferences = flow === 'saving-preferences';

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

    useEffect(() => {
        if (!toast) return undefined;

        const timeout = window.setTimeout(() => setToast(null), 4500);
        return () => window.clearTimeout(timeout);
    }, [toast]);

    const showToast = useCallback((nextToast: GlobalToast, dedupeKey?: string) => {
        const key = dedupeKey ?? `${nextToast.type}:${nextToast.title ?? ''}:${nextToast.message}`;
        const now = Date.now();

        if (lastToastRef.current && lastToastRef.current.key === key && now - lastToastRef.current.at < 2500) {
            return;
        }

        lastToastRef.current = { key, at: now };
        setToast(nextToast);
    }, []);

    const mergeWithAnonymousDefaults = useCallback(
        (nextProfile?: UserProfile | null): UserProfile => ({
            ...ANONYMOUS_PROFILE,
            ...(nextProfile ?? {}),
        }),
        [],
    );

    const getReadableError = useCallback((err: unknown, fallback: string): string => {
        if (err instanceof ApiRequestError) {
            if (err.diagnostics.status === 401) return 'Identifiants invalides ou session expirée.';
            if (err.diagnostics.status === 409) return 'Ce nom d’utilisateur existe déjà.';
            if (err.diagnostics.status === 400) return 'Les informations envoyées sont invalides.';
            return err.message;
        }

        return err instanceof Error ? err.message : fallback;
    }, []);

    const loadAuthenticatedSession = useCallback(async (success?: string) => {
        setFlow('loading-profile');
        setSyncState('syncing');
        setStatusMessage('Vérification du compte et chargement du profil depuis la base…');

        const verifiedAccount = await getProfile();
        const prefs = await getPreferences();

        setAccount(verifiedAccount);
        setProfile(mergeWithAnonymousDefaults(prefs));
        setFlow('authenticated');
        setSyncState('synced');
        setStatusMessage(null);
        if (success) setSuccessMessage(success);
    }, [mergeWithAnonymousDefaults]);

    const refreshSession = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        setSuccessMessage(null);
        setFlow('checking-session');
        setSyncState('syncing');
        setStatusMessage('Vérification de votre session sécurisée…');

        try {
            await loadAuthenticatedSession();
        } catch (err) {
            setAccount(null);
            setProfile(ANONYMOUS_PROFILE);

            if (err instanceof ApiRequestError && (err.diagnostics.status === 401 || err.diagnostics.status === 404)) {
                setFlow('anonymous');
                setSyncState('anonymous');
                setStatusMessage(null);
                setError(null);
                setIsOnboardingActive(false);
                setOnboardingStepState(1);
            } else {
                setFlow('error');
                setSyncState('error');
                setStatusMessage(null);
                const message = getReadableError(err, 'Impossible de vérifier la session actuelle.');
                setError(message);
                showToast({ type: 'error', message }, 'session-check-error');
            }
        } finally {
            setIsLoading(false);
            setHasCheckedSession(true);
        }
    }, [getReadableError, loadAuthenticatedSession, showToast]);

    useEffect(() => {
        void refreshSession();
    }, [refreshSession]);

    const login = useCallback(async (request: LoginRequest) => {
        setIsLoading(true);
        setError(null);
        setSuccessMessage(null);
        setFlow('signing-in');
        setSyncState('syncing');
        setStatusMessage('Connexion sécurisée en cours…');
        try {
            await loginAccount(request);
            setIsOnboardingActive(false);
            setOnboardingStepState(1);
            await loadAuthenticatedSession('Connexion réussie — profil chargé depuis la base de données.');
            showToast({ type: 'success', message: 'Compte connecté et synchronisé avec la base.' }, 'login-success');
        } catch (err) {
            setAccount(null);
            setProfile(ANONYMOUS_PROFILE);
            setFlow('error');
            setSyncState('error');
            setStatusMessage(null);
            const message = getReadableError(err, 'Échec de la connexion.');
            setError(message);
            showToast({ type: 'error', message }, 'login-error');
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, [getReadableError, loadAuthenticatedSession, showToast]);

    const register = useCallback(async (request: RegisterAccountRequest) => {
        setIsLoading(true);
        setError(null);
        setSuccessMessage(null);
        setFlow('registering');
        setSyncState('syncing');
        setStatusMessage('Création du compte dans la base de données…');
        try {
            await registerAccount(request);
            setFlow('signing-in');
            setStatusMessage('Connexion automatique et préparation de votre profil…');
            await loginAccount({ username: request.username, password: request.password });
            setIsOnboardingActive(true);
            setOnboardingStepState(1);
            await loadAuthenticatedSession('Compte créé, connecté et synchronisé avec la base de données.');
            showToast({ type: 'success', message: 'Compte créé et prêt pour l’onboarding.' }, 'register-success');
        } catch (err) {
            setAccount(null);
            setProfile(ANONYMOUS_PROFILE);
            setFlow('error');
            setSyncState('error');
            setStatusMessage(null);
            const message = getReadableError(err, 'Échec de la création du compte.');
            setError(message);
            showToast({ type: 'error', message }, 'register-error');
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, [getReadableError, loadAuthenticatedSession, showToast]);

    const logout = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        setSuccessMessage(null);
        setFlow('checking-session');
        setSyncState('syncing');
        setStatusMessage('Déconnexion sécurisée et fermeture de session…');

        try {
            await logoutAccount();
            showToast({ type: 'success', message: 'Déconnexion confirmée côté serveur.' }, 'logout-success');
        } catch (err) {
            if (!(err instanceof ApiRequestError) || (err.diagnostics.status !== 401 && err.diagnostics.status !== 204)) {
                const message = getReadableError(err, 'Échec de la déconnexion serveur.');
                setError(message);
                showToast({ type: 'error', message }, 'logout-error');
                throw err;
            }
        } finally {
            setAccount(null);
            setProfile(ANONYMOUS_PROFILE);
            setError(null);
            setStatusMessage(null);
            setSuccessMessage('Session fermée.');
            setFlow('anonymous');
            setSyncState('anonymous');
            setIsOnboardingActive(false);
            setOnboardingStepState(1);
            setIsLoading(false);
        }
    }, [getReadableError, showToast]);

    const savePreferences = useCallback(async (request: UpdateUserProfileRequest) => {
        setIsLoading(true);
        setError(null);
        setSuccessMessage(null);
        setFlow('saving-preferences');
        setSyncState('syncing');
        setStatusMessage('Enregistrement de vos préférences en base…');
        try {
            const updated = await updatePreferences(request);
            setProfile(mergeWithAnonymousDefaults(updated));
            setStatusMessage(null);
            setSuccessMessage('Préférences enregistrées dans la base de données.');
            setFlow(isAuthenticated ? 'authenticated' : 'anonymous');
            setSyncState(isAuthenticated ? 'synced' : 'anonymous');
            showToast({ type: 'success', message: 'Synchronisation réussie avec la base de données.' }, 'preferences-save-success');
        } catch (err) {
            setStatusMessage(null);
            setFlow('error');
            setSyncState('error');
            const message = getReadableError(err, 'Impossible d’enregistrer les préférences.');
            setError(message);
            showToast({ type: 'error', message }, 'preferences-save-error');
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
        setSuccessMessage('Onboarding terminé — votre profil est prêt et synchronisé.');
    }, []);

    const skipOnboarding = useCallback(() => {
        setIsOnboardingActive(false);
        setOnboardingStepState(1);
        setSuccessMessage('Onboarding ignoré — vous pourrez compléter votre profil à tout moment.');
    }, []);

    const dismissToast = useCallback(() => setToast(null), []);

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
            error,
            statusMessage,
            successMessage,
            toast,
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
            error,
            statusMessage,
            successMessage,
            toast,
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

