import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ResortMatch, searchResorts } from '../services/api';
import './ResortSearchBox.css';

interface Props {
    /** Currently selected resort name, shown when the box is not being edited. */
    value?: string;
    onSelect: (match: ResortMatch) => void;
    placeholder?: string;
    autoFocus?: boolean;
}

const DEBOUNCE_MS = 250;
const MIN_QUERY = 2;

/**
 * Type-ahead resort picker.
 *
 * <p>Implements the ARIA combobox pattern rather than a bare input plus div list:
 * the results are a real listbox, the highlighted row is announced through
 * `aria-activedescendant`, and focus never leaves the input. Keyboard users get
 * the same experience as mouse users, which a click-only dropdown does not give
 * them.
 *
 * <p>Two things that matter more than they look:
 *
 * <ul>
 *   <li><strong>In-flight requests are aborted.</strong> One request fires per
 *       keystroke burst, and without cancellation a slow response for "cha" can
 *       land after "chamonix" and repopulate the list with stale results.</li>
 *   <li><strong>Resorts with no planning data are shown, not hidden.</strong> The
 *       catalogue has ~3,800 resorts and almost none are set up. A box that finds
 *       nothing for "Chamonix" reads as a broken app; one that finds it and says
 *       so is merely honest.</li>
 * </ul>
 */
const ResortSearchBox: React.FC<Props> = ({ value, onSelect, placeholder, autoFocus }) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<ResortMatch[]>([]);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activeIndex, setActiveIndex] = useState(-1);

    const rootRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const abortRef = useRef<AbortController | null>(null);

    const listboxId = useId();
    const optionId = useCallback((index: number) => `${listboxId}-option-${index}`, [listboxId]);

    const trimmed = query.trim();
    const tooShort = trimmed.length > 0 && trimmed.length < MIN_QUERY;

    // One search per keystroke burst, with the previous one cancelled. The
    // cleanup aborts on unmount too, so a pending request cannot setState into a
    // torn-down component.
    useEffect(() => {
        if (trimmed.length < MIN_QUERY) {
            abortRef.current?.abort();
            setResults([]);
            setLoading(false);
            setError(null);
            return;
        }

        const timer = window.setTimeout(() => {
            abortRef.current?.abort();
            const controller = new AbortController();
            abortRef.current = controller;
            setLoading(true);
            setError(null);

            searchResorts(trimmed, { signal: controller.signal })
                .then((matches) => {
                    if (controller.signal.aborted) return;
                    setResults(matches);
                    setActiveIndex(matches.length > 0 ? 0 : -1);
                })
                .catch((err: unknown) => {
                    if (controller.signal.aborted) return;
                    setResults([]);
                    setError(err instanceof Error ? err.message : 'Search failed.');
                })
                .finally(() => {
                    if (!controller.signal.aborted) setLoading(false);
                });
        }, DEBOUNCE_MS);

        return () => window.clearTimeout(timer);
    }, [trimmed]);

    useEffect(() => () => abortRef.current?.abort(), []);

    // Close on outside click. Pointerdown rather than click so the list is gone
    // before a click on something underneath resolves.
    useEffect(() => {
        if (!open) return;
        const onPointerDown = (event: PointerEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('pointerdown', onPointerDown);
        return () => document.removeEventListener('pointerdown', onPointerDown);
    }, [open]);

    const commit = useCallback((match: ResortMatch) => {
        onSelect(match);
        setQuery('');
        setResults([]);
        setOpen(false);
        setActiveIndex(-1);
        inputRef.current?.blur();
    }, [onSelect]);

    const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Escape') {
            setOpen(false);
            setActiveIndex(-1);
            return;
        }
        if (!open || results.length === 0) {
            // ArrowDown reopens a list that was dismissed without retyping.
            if (event.key === 'ArrowDown' && results.length > 0) {
                setOpen(true);
                event.preventDefault();
            }
            return;
        }
        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                setActiveIndex((i) => (i + 1) % results.length);
                break;
            case 'ArrowUp':
                event.preventDefault();
                setActiveIndex((i) => (i - 1 + results.length) % results.length);
                break;
            case 'Home':
                event.preventDefault();
                setActiveIndex(0);
                break;
            case 'End':
                event.preventDefault();
                setActiveIndex(results.length - 1);
                break;
            case 'Enter': {
                const match = results[activeIndex];
                if (match) {
                    event.preventDefault();
                    commit(match);
                }
                break;
            }
            default:
                break;
        }
    };

    const status = useMemo(() => {
        if (tooShort) return `Keep typing — at least ${MIN_QUERY} characters.`;
        if (loading) return 'Searching…';
        if (error) return error;
        if (trimmed.length >= MIN_QUERY && results.length === 0) return `No resort matching “${trimmed}”.`;
        return null;
    }, [tooShort, loading, error, trimmed, results.length]);

    const expanded = open && (results.length > 0 || status != null);

    return (
        <div className="rsb" ref={rootRef}>
            <div
                className="rsb__field"
                role="combobox"
                aria-expanded={expanded}
                // aria-controls is the required relationship for combobox;
                // aria-owns only described the DOM ownership, so assistive tech
                // had no pointer to the popup it actually controls.
                aria-controls={listboxId}
                aria-haspopup="listbox"
            >
                <span className="rsb__icon" aria-hidden="true">⌕</span>
                <input
                    ref={inputRef}
                    type="text"
                    className="rsb__input"
                    // eslint-disable-next-line jsx-a11y/no-autofocus
                    autoFocus={autoFocus}
                    value={query}
                    placeholder={placeholder ?? (value ? `${value} — search another resort` : 'Search a ski resort…')}
                    aria-label="Search a ski resort"
                    aria-autocomplete="list"
                    aria-controls={listboxId}
                    aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setOpen(true);
                    }}
                    onFocus={() => setOpen(true)}
                    onKeyDown={onKeyDown}
                />
                {query && (
                    <button
                        type="button"
                        className="rsb__clear"
                        aria-label="Clear search"
                        onClick={() => {
                            setQuery('');
                            setResults([]);
                            inputRef.current?.focus();
                        }}
                    >
                        ×
                    </button>
                )}
            </div>

            {expanded && (
                <div className="rsb__popup">
                    <ul className="rsb__list" id={listboxId} role="listbox" aria-label="Resort results">
                        {results.map((match, index) => (
                            <li
                                key={match.slug}
                                id={optionId(index)}
                                role="option"
                                aria-selected={index === activeIndex}
                                className={`rsb__option ${index === activeIndex ? 'rsb__option--active' : ''}`.trim()}
                                // Mouse down rather than click: click fires after blur,
                                // by which point the outside-click handler has closed the list.
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    commit(match);
                                }}
                                onMouseEnter={() => setActiveIndex(index)}
                            >
                                <span className="rsb__option-main">
                                    <span className="rsb__name">{match.name}</span>
                                    <span className="rsb__meta">
                                        {[match.region, match.country].filter(Boolean).join(' · ')}
                                        {match.topAltM != null && ` · to ${match.topAltM} m`}
                                    </span>
                                </span>
                                {match.hasProfile ? (
                                    <span className="badge badge--success rsb__tag">Planner ready</span>
                                ) : (
                                    <span className="badge badge--neutral rsb__tag">No data yet</span>
                                )}
                            </li>
                        ))}
                    </ul>
                    {status && (
                        <p className="rsb__status" role="status">
                            {status}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
};

export default ResortSearchBox;
