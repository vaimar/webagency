import { useCallback, useState } from 'react';
import { AiProvider, ChatMessage, fetchAiProviders, sendChatMessage } from '../services/api';

interface UseAiChatResult {
    messages: ChatMessage[];
    providers: AiProvider[];
    activeProvider: string;
    isLoading: boolean;
    error: string | null;
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
    const [error, setError] = useState<string | null>(null);

    const loadProviders = useCallback(async () => {
        try {
            const result = await fetchAiProviders();
            setProviders(result);
            if (result.length > 0 && !activeProvider) {
                setActiveProvider(result[0].name ?? result[0].id ?? '');
            }
        } catch {
            // providers are a nice-to-have; swallow errors silently
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
                const reply = await sendChatMessage({
                    message: text.trim(),
                    provider: activeProvider || undefined,
                });

                const assistantMessage: ChatMessage = {
                    role: 'assistant',
                    content: reply,
                    provider: activeProvider || undefined,
                    timestamp: new Date().toISOString(),
                };
                setMessages((prev) => [...prev, assistantMessage]);
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Unknown error';
                setError(`Could not reach the AI assistant: ${message}`);
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

    return { messages, providers, activeProvider, isLoading, error, setActiveProvider, send, clearHistory, loadProviders };
};

