import { useCallback, useState } from 'react';
import { AiProvider, ApiDiagnostics, ApiRequestError, ChatMessage, fetchAiProviders, sendChatMessage } from '../services/api';

interface UseAiChatResult {
    messages: ChatMessage[];
    providers: AiProvider[];
    activeProvider: string;
    isLoading: boolean;
    isLoadingProviders: boolean;
    error: string | null;
    providersError: string | null;
    providerDiagnostics: ApiDiagnostics | null;
    lastChatDiagnostics: ApiDiagnostics | null;
    setActiveProvider: (provider: string) => void;
    send: (message: string) => Promise<void>;
    clearHistory: () => void;
    loadProviders: () => Promise<void>;
}

export const useAiChat = (): UseAiChatResult => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [providers, setProviders] = useState<AiProvider[]>([]);
    const [activeProvider, setActiveProvider] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingProviders, setIsLoadingProviders] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [providersError, setProvidersError] = useState<string | null>(null);
    const [providerDiagnostics, setProviderDiagnostics] = useState<ApiDiagnostics | null>(null);
    const [lastChatDiagnostics, setLastChatDiagnostics] = useState<ApiDiagnostics | null>(null);

    const loadProviders = useCallback(async () => {
        setIsLoadingProviders(true);
        setProvidersError(null);

        try {
            const result = await fetchAiProviders();
            setProviders(result.providers);
            setProviderDiagnostics(result.diagnostics);
            if (result.providers.length > 0 && !activeProvider) {
                setActiveProvider(result.providers[0].name ?? result.providers[0].id ?? '');
            }
        } catch (error) {
            if (error instanceof ApiRequestError) {
                setProvidersError(`Could not load providers: ${error.message}`);
                setProviderDiagnostics(error.diagnostics);
            } else {
                setProvidersError('Could not load providers.');
            }
        } finally {
            setIsLoadingProviders(false);
        }
    }, [activeProvider]);

    const send = useCallback(
        async (text: string) => {
            if (!text.trim()) return;
            setError(null);

            const userMessage: ChatMessage = {
                role: 'user',
                content: text.trim(),
                timestamp: new Date().toISOString(),
            };
            setMessages((prev) => [...prev, userMessage]);
            setIsLoading(true);

            try {
                const result = await sendChatMessage({
                    message: text.trim(),
                    provider: activeProvider || undefined,
                });

                setLastChatDiagnostics(result.diagnostics);

                const assistantMessage: ChatMessage = {
                    role: 'assistant',
                    content: result.reply,
                    provider: activeProvider || undefined,
                    resolvedProvider: result.resolvedProvider,
                    fallback: result.fallback,
                    cached: result.cached,
                    timestamp: new Date().toISOString(),
                };
                setMessages((prev) => [...prev, assistantMessage]);
            } catch (error) {
                if (error instanceof ApiRequestError) {
                    setError(`Could not reach the AI assistant: ${error.message}`);
                    setLastChatDiagnostics(error.diagnostics);
                } else {
                    setError('Could not reach the AI assistant.');
                }
            } finally {
                setIsLoading(false);
            }
        },
        [activeProvider],
    );

    const clearHistory = useCallback(() => {
        setMessages([]);
        setError(null);
    }, []);

    return {
        messages,
        providers,
        activeProvider,
        isLoading,
        isLoadingProviders,
        error,
        providersError,
        providerDiagnostics,
        lastChatDiagnostics,
        setActiveProvider,
        send,
        clearHistory,
        loadProviders,
    };
};
