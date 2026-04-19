import React, { FormEvent, useEffect, useRef, useState } from 'react';
import { useAiChat } from './hooks/useAiChat';
import { useBackendHealth } from './hooks/useBackendHealth';

const Assistant: React.FC = () => {
    const backendStatus = useBackendHealth();
    const { messages, providers, activeProvider, isLoading, error, setActiveProvider, send, clearHistory, loadProviders } = useAiChat();
    const [input, setInput] = useState('');
    const bottomRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        void loadProviders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        if (!input.trim() || isLoading) return;
        const text = input.trim();
        setInput('');
        await send(text);
    };

    const formatTime = (iso: string) =>
        new Intl.DateTimeFormat('en', { timeStyle: 'short' }).format(new Date(iso));

    return (
        <div className="stack-xl">
            <section className="hero card hero-card hero-card--compact">
                <div className="hero-card__content">
                    <p className="eyebrow">AI assistant</p>
                    <h1>Ask anything about your trip.</h1>
                    <p className="hero-card__lede">
                        Chat with Grok or Gemini (via your backend on port 9090) for destination advice,
                        packing tips, visa info, or anything else.
                    </p>
                </div>

                <div className="hero-card__panel">
                    <p className="eyebrow">Backend status</p>
                    <strong className={backendStatus === 'online' ? 'status--online' : backendStatus === 'offline' ? 'status--offline' : ''}>
                        {backendStatus === 'online' ? '● Online' : backendStatus === 'offline' ? '● Offline' : '● Checking…'}
                    </strong>
                    {providers.length > 0 && (
                        <>
                            <p className="eyebrow" style={{ marginTop: '12px' }}>Provider</p>
                            <select
                                className="text-input"
                                value={activeProvider}
                                onChange={(event) => setActiveProvider(event.target.value)}
                            >
                                {providers.map((p) => (
                                    <option key={p.id ?? p.name} value={p.name ?? p.id ?? ''}>
                                        {p.name ?? p.id}
                                    </option>
                                ))}
                            </select>
                        </>
                    )}
                </div>
            </section>

            {backendStatus === 'offline' && (
                <div className="notice-banner">
                    The backend on port 9090 is not reachable. Start your Spring Boot app, then refresh.
                </div>
            )}

            <section className="card section-card stack-lg">
                <div className="section-card__header">
                    <div>
                        <p className="eyebrow">Conversation</p>
                        <h2>
                            {messages.length === 0
                                ? 'Ask your first question'
                                : `${messages.length} message${messages.length !== 1 ? 's' : ''}`}
                        </h2>
                    </div>
                    {messages.length > 0 && (
                        <button type="button" className="button button--secondary" onClick={clearHistory}>
                            Clear
                        </button>
                    )}
                </div>

                <div className="chat-thread" role="log" aria-live="polite">
                    {messages.length === 0 ? (
                        <p className="muted-text chat-thread__empty">
                            Try: <em>"What should I do in Barcelona for 3 days?"</em>
                        </p>
                    ) : (
                        messages.map((msg, index) => (
                            <div
                                key={index}
                                className={msg.role === 'user' ? 'chat-bubble chat-bubble--user' : 'chat-bubble chat-bubble--assistant'}
                            >
                                <div className="chat-bubble__meta">
                                    <span>{msg.role === 'user' ? 'You' : msg.provider ?? 'AI'}</span>
                                    <span>{formatTime(msg.timestamp)}</span>
                                </div>
                                <p className="chat-bubble__content">{msg.content}</p>
                            </div>
                        ))
                    )}

                    {isLoading && (
                        <div className="chat-bubble chat-bubble--assistant">
                            <div className="chat-bubble__meta"><span>AI</span></div>
                            <p className="chat-bubble__content muted-text">Thinking…</p>
                        </div>
                    )}

                    {error && <div className="notice-banner">{error}</div>}

                    <div ref={bottomRef} />
                </div>

                <form className="chat-input-row" onSubmit={(event) => void handleSubmit(event)}>
                    <input
                        className="text-input"
                        value={input}
                        disabled={isLoading || backendStatus === 'offline'}
                        placeholder={backendStatus === 'offline' ? 'Backend offline…' : 'Ask about your trip…'}
                        onChange={(event) => setInput(event.target.value)}
                    />
                    <button
                        type="submit"
                        className="button"
                        disabled={isLoading || !input.trim() || backendStatus === 'offline'}
                    >
                        Send
                    </button>
                </form>
            </section>
        </div>
    );
};

export default Assistant;

