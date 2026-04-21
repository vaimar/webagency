import { faCircle, faComments, faPaperPlane, faRefresh, faRobot, faTrash, faUser } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { FormEvent, useEffect, useRef, useState } from 'react';
import { useAiChat } from './hooks/useAiChat';
import { useBackendHealth } from './hooks/useBackendHealth';
import { API_BASE, ApiDiagnostics } from './services/api';

const formatDiagnosticsTime = (value?: string): string => {
    if (!value) return '—';
    return new Intl.DateTimeFormat('en', { timeStyle: 'medium' }).format(new Date(value));
};

const DiagnosticsPanel = ({ title, diagnostics }: { title: string; diagnostics: ApiDiagnostics | null }) => {
    if (!diagnostics) {
        return null;
    }

    return (
        <details className="debug-panel">
            <summary>{title}</summary>
            <dl className="debug-panel__grid">
                <div>
                    <dt>URL</dt>
                    <dd>{diagnostics.url}</dd>
                </div>
                <div>
                    <dt>Status</dt>
                    <dd>{diagnostics.status ?? 'network error'} {diagnostics.statusText}</dd>
                </div>
                <div>
                    <dt>Duration</dt>
                    <dd>{diagnostics.durationMs} ms</dd>
                </div>
                <div>
                    <dt>When</dt>
                    <dd>{formatDiagnosticsTime(diagnostics.timestamp)}</dd>
                </div>
                {diagnostics.error ? (
                    <div className="debug-panel__full">
                        <dt>Error</dt>
                        <dd>{diagnostics.error}</dd>
                    </div>
                ) : null}
            </dl>
        </details>
    );
};

const quickQuestions = [
    "What should I pack for a week in Barcelona?",
    "Best time to visit Japan?",
    "What's the weather like in Iceland in March?",
    "Do I need a visa for Morocco?",
];

const Assistant: React.FC = () => {
    const apiTarget = API_BASE || window.location.origin;
    const { status: backendStatus, backendState, diagnostics: healthDiagnostics, lastCheckedAt, refresh } = useBackendHealth();
    const {
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
    } = useAiChat();
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

    const handleQuickQuestion = async (question: string) => {
        if (isLoading || backendStatus === 'offline') return;
        await send(question);
    };

    const formatTime = (iso: string) =>
        new Intl.DateTimeFormat('en', { timeStyle: 'short' }).format(new Date(iso));

    return (
        <div className="stack-xl">
            {/* Hero Section */}
            <section className="hero-card card hero-card--compact">
                <div className="hero-card__grid">
                    <div className="hero-card__content">
                        <p className="eyebrow eyebrow--light">
                            <FontAwesomeIcon icon={faComments} style={{ marginRight: '8px' }} />
                            AI Travel Assistant
                        </p>
                        <h1>Your personal travel expert</h1>
                        <p className="hero-card__lede">
                            Ask anything about your trip — visa requirements, packing tips, best neighborhoods,
                            local customs, restaurant recommendations, and more. Our AI has you covered.
                        </p>
                    </div>

                    <div className="hero-card__panel">
                        <p className="eyebrow eyebrow--light">
                            <FontAwesomeIcon icon={faCircle} style={{ fontSize: '0.5rem', marginRight: '6px' }} />
                            Connection Status
                        </p>
                        <strong className={backendStatus === 'online' ? 'status--online' : backendStatus === 'offline' ? 'status--offline' : ''}>
                            {backendStatus === 'online' ? (
                                <>● Online {backendState && `(${backendState})`}</>
                            ) : backendStatus === 'offline' ? (
                                '● Offline'
                            ) : (
                                '● Checking...'
                            )}
                        </strong>
                        <p className="muted-text" style={{ fontSize: '0.8rem' }}>
                            {lastCheckedAt ? `Last check: ${formatDiagnosticsTime(lastCheckedAt)}` : 'Connecting...'}
                        </p>

                        {providers.length > 0 && (
                            <div style={{ marginTop: '8px' }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                                    AI Provider
                                </label>
                                <select
                                    className="text-input"
                                    value={activeProvider}
                                    onChange={(event) => setActiveProvider(event.target.value)}
                                    style={{ padding: '8px 12px', fontSize: '0.85rem' }}
                                >
                                    {providers.map((p) => (
                                        <option key={p.id ?? p.name} value={p.name ?? p.id ?? ''}>
                                            {p.name ?? p.id}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <button
                            type="button"
                            className="button button--small button--secondary"
                            onClick={() => void refresh()}
                            style={{ alignSelf: 'flex-start', marginTop: '8px' }}
                        >
                            <FontAwesomeIcon icon={faRefresh} />
                            Refresh
                        </button>
                    </div>
                </div>
            </section>

            {/* Status Notices */}
            {backendStatus === 'offline' && (
                <div className="notice-banner notice-banner--error">
                    <FontAwesomeIcon icon={faCircle} style={{ fontSize: '0.6rem' }} />
                    <span>
                        <strong>Backend Offline</strong> — The API service is not reachable at {apiTarget}.
                        Please start your backend server and click Refresh.
                    </span>
                </div>
            )}

            {providersError && (
                <div className="notice-banner notice-banner--warning">{providersError}</div>
            )}

            {isLoadingProviders && (
                <div className="notice-banner">Loading available AI providers...</div>
            )}

            <DiagnosticsPanel title="Health check details" diagnostics={healthDiagnostics} />
            <DiagnosticsPanel title="Provider request details" diagnostics={providerDiagnostics} />

            {/* Chat Section */}
            <section className="card section-card stack-lg">
                <div className="section-card__header">
                    <div>
                        <p className="eyebrow">💬 Conversation</p>
                        <h2>
                            {messages.length === 0
                                ? 'Start a conversation'
                                : `${messages.length} message${messages.length !== 1 ? 's' : ''}`}
                        </h2>
                    </div>
                    {messages.length > 0 && (
                        <button type="button" className="button button--secondary button--small" onClick={clearHistory}>
                            <FontAwesomeIcon icon={faTrash} />
                            Clear Chat
                        </button>
                    )}
                </div>

                {/* Quick Questions */}
                {messages.length === 0 && backendStatus === 'online' && (
                    <div className="stack-sm">
                        <p className="muted-text" style={{ fontSize: '0.85rem' }}>Try asking:</p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {quickQuestions.map((q) => (
                                <button
                                    key={q}
                                    type="button"
                                    className="tag"
                                    onClick={() => void handleQuickQuestion(q)}
                                    style={{ cursor: 'pointer', border: 'none' }}
                                >
                                    {q}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Chat Thread */}
                <div className="chat-thread" role="log" aria-live="polite">
                    {messages.length === 0 ? (
                        <div className="chat-thread__empty">
                            <FontAwesomeIcon icon={faRobot} style={{ fontSize: '2rem', opacity: 0.3, marginBottom: '12px', display: 'block' }} />
                            <p className="muted-text">
                                Hi! I'm your AI travel assistant. Ask me anything about your upcoming trip!
                            </p>
                            <p className="muted-text" style={{ fontSize: '0.8rem', marginTop: '8px' }}>
                                Examples: "What to see in Rome in 3 days?" or "Best budget hotels in Tokyo"
                            </p>
                        </div>
                    ) : (
                        messages.map((msg, index) => (
                            <div
                                key={index}
                                className={msg.role === 'user' ? 'chat-bubble chat-bubble--user' : 'chat-bubble chat-bubble--assistant'}
                            >
                                <div className="chat-bubble__meta">
                                    <span>
                                        <FontAwesomeIcon
                                            icon={msg.role === 'user' ? faUser : faRobot}
                                            style={{ marginRight: '6px' }}
                                        />
                                        {msg.role === 'user' ? 'You' : msg.provider ?? 'AI Assistant'}
                                    </span>
                                    <span>{formatTime(msg.timestamp)}</span>
                                </div>
                                <p className="chat-bubble__content">{msg.content}</p>
                            </div>
                        ))
                    )}

                    {isLoading && (
                        <div className="chat-bubble chat-bubble--assistant">
                            <div className="chat-bubble__meta">
                                <span>
                                    <FontAwesomeIcon icon={faRobot} style={{ marginRight: '6px' }} />
                                    AI Assistant
                                </span>
                            </div>
                            <p className="chat-bubble__content muted-text loading-pulse">
                                Thinking...
                            </p>
                        </div>
                    )}

                    {error && (
                        <div className="notice-banner notice-banner--error" style={{ margin: '0' }}>
                            {error}
                        </div>
                    )}

                    <DiagnosticsPanel title="Last request details" diagnostics={lastChatDiagnostics} />
                    <div ref={bottomRef} />
                </div>

                {/* Input Form */}
                <form className="chat-input-row" onSubmit={(event) => void handleSubmit(event)}>
                    <input
                        className="text-input text-input--large"
                        value={input}
                        disabled={isLoading || backendStatus === 'offline'}
                        placeholder={
                            backendStatus === 'offline'
                                ? 'Backend offline — start server to chat'
                                : 'Ask about destinations, packing, visas, food...'
                        }
                        onChange={(event) => setInput(event.target.value)}
                    />
                    <button
                        type="submit"
                        className="button button--large"
                        disabled={isLoading || !input.trim() || backendStatus === 'offline'}
                    >
                        <FontAwesomeIcon icon={faPaperPlane} />
                        Send
                    </button>
                </form>
            </section>

            {/* Tips Section */}
            <section className="info-grid">
                <article className="card info-card">
                    <h3>🌍 Destination Advice</h3>
                    <p>Get recommendations for attractions, neighborhoods, and local experiences tailored to your interests.</p>
                </article>
                <article className="card info-card">
                    <h3>📋 Practical Tips</h3>
                    <p>Learn about visa requirements, currency, language basics, and what to pack for your destination.</p>
                </article>
                <article className="card info-card">
                    <h3>🍽️ Food & Culture</h3>
                    <p>Discover local cuisine, dining etiquette, and cultural customs to make the most of your trip.</p>
                </article>
            </section>
        </div>
    );
};

export default Assistant;

