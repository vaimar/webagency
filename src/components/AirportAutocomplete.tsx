import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
    AirportMetadata,
    ORIGIN_AIRPORT_OPTIONS,
    formatAirportOptionLabel,
    getAirportMetadata,
    groupAirportsByCountry,
} from '../data/airportMetadata';
import { AirportOption, formatAirportLabel, getAirport, searchAirports } from '../services/airports';
import './AirportAutocomplete.css';

interface AirportAutocompleteProps {
    label: string;
    /** Currently selected IATA code (lifted to the parent). */
    value: string;
    onChange: (iata: string) => void;
    placeholder?: string;
}

const DEBOUNCE_MS = 220;
const MIN_QUERY = 2;

/**
 * Hybrid airport picker. On focus (empty box) it shows the curated shortlist
 * grouped by country with flags — the familiar, browsable ~90 routes. As soon as
 * the user types, it switches to a live search across the full imported airport
 * set (~9k) via GET /api/airports. Stores the IATA code as its value.
 */
const AirportAutocomplete: React.FC<AirportAutocompleteProps> = ({ label, value, onChange, placeholder }) => {
    const inputId = useId();
    const listboxId = `${inputId}-listbox`;

    const [query, setQuery] = useState('');
    const [selectedLabel, setSelectedLabel] = useState(value);
    const [results, setResults] = useState<AirportOption[]>([]);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const [focused, setFocused] = useState(false);

    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Curated shortlist, grouped by country (flags) for the browse view. Flattened
    // for keyboard navigation, which walks airports and skips the country headers.
    const browseGroups = useMemo(() => groupAirportsByCountry(ORIGIN_AIRPORT_OPTIONS), []);
    const browseFlat = useMemo(() => browseGroups.flatMap((group) => group.airports), [browseGroups]);
    const browseIndexByCode = useMemo(
        () => new Map(browseFlat.map((airport, index) => [airport.code, index])),
        [browseFlat],
    );

    const searching = query.trim().length >= MIN_QUERY;
    const navLength = searching ? results.length : browseFlat.length;

    // Resolve a friendly label for the selected code. Curated codes keep their
    // flag + city + country; anything else resolves to "Name · City (CODE)".
    useEffect(() => {
        if (!value) {
            setSelectedLabel('');
            return;
        }
        if (getAirportMetadata(value)) {
            setSelectedLabel(formatAirportOptionLabel(value));
            return;
        }
        let cancelled = false;
        setSelectedLabel(value); // raw code until the API name loads
        getAirport(value)
            .then((airport) => {
                if (!cancelled && airport) {
                    setSelectedLabel(formatAirportLabel(airport));
                }
            })
            .catch(() => { /* keep the raw code on lookup failure */ });
        return () => { cancelled = true; };
    }, [value]);

    // Debounced full-set search once the user types (>= MIN_QUERY chars).
    useEffect(() => {
        if (!focused) {
            return;
        }
        const trimmed = query.trim();
        if (trimmed.length < MIN_QUERY) {
            setResults([]);
            setLoading(false);
            return;
        }
        const controller = new AbortController();
        setLoading(true);
        const handle = window.setTimeout(() => {
            searchAirports(trimmed, { limit: 12, signal: controller.signal })
                .then((airports) => {
                    setResults(airports);
                    setActiveIndex(airports.length > 0 ? 0 : -1);
                    setLoading(false);
                })
                .catch((error) => {
                    if (error?.name !== 'AbortError') {
                        setResults([]);
                        setLoading(false);
                    }
                });
        }, DEBOUNCE_MS);
        return () => {
            controller.abort();
            window.clearTimeout(handle);
        };
    }, [query, focused]);

    // Close the dropdown on an outside click.
    useEffect(() => {
        if (!open) {
            return;
        }
        const onDocMouseDown = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', onDocMouseDown);
        return () => document.removeEventListener('mousedown', onDocMouseDown);
    }, [open]);

    const finishSelection = (iata: string, resolvedLabel: string) => {
        onChange(iata);
        setSelectedLabel(resolvedLabel);
        setQuery('');
        setResults([]);
        setOpen(false);
        setActiveIndex(-1);
        // Blur so the field leaves edit mode and shows the chosen airport right away.
        inputRef.current?.blur();
    };

    const selectApiOption = (airport: AirportOption) => finishSelection(airport.iata, formatAirportLabel(airport));
    const selectCurated = (airport: AirportMetadata) => finishSelection(airport.code, formatAirportOptionLabel(airport.code));

    const selectActive = () => {
        if (activeIndex < 0) {
            return;
        }
        if (searching) {
            if (activeIndex < results.length) {
                selectApiOption(results[activeIndex]);
            }
        } else if (activeIndex < browseFlat.length) {
            selectCurated(browseFlat[activeIndex]);
        }
    };

    const handleFocus = () => {
        setFocused(true);
        setOpen(true);
        setQuery('');
        setActiveIndex(-1);
    };

    const handleBlur = () => {
        setFocused(false);
        setQuery('');
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            if (navLength > 0) {
                setOpen(true);
                setActiveIndex((index) => (index + 1) % navLength);
            }
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            if (navLength > 0) {
                setActiveIndex((index) => (index - 1 + navLength) % navLength);
            }
        } else if (event.key === 'Enter') {
            if (open && activeIndex >= 0 && activeIndex < navLength) {
                event.preventDefault(); // pick the option, don't submit the form
                selectActive();
            }
        } else if (event.key === 'Escape') {
            setOpen(false);
        }
    };

    const showList = open && focused;

    return (
        <div className="airport-select" ref={containerRef}>
            <label className="airport-select__label" htmlFor={inputId}>{label}</label>
            <input
                ref={inputRef}
                id={inputId}
                className="airport-select__input"
                type="text"
                role="combobox"
                aria-expanded={showList}
                aria-controls={listboxId}
                aria-autocomplete="list"
                autoComplete="off"
                placeholder={placeholder ?? 'Search or browse cities…'}
                value={focused ? query : selectedLabel}
                onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
                onFocus={handleFocus}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
            />
            {/* aria-live so the hints inside are announced when they appear — they
                are status, not choices, so they carry role="presentation" rather
                than pretending to be selectable options. They previously used
                aria-disabled, which ARIA does not allow on a listitem. */}
            {showList && (
                <ul className="airport-select__list" id={listboxId} role="listbox" aria-live="polite">
                    {searching ? (
                        <>
                            {loading && results.length === 0 && (
                                <li className="airport-select__hint" role="presentation">Searching…</li>
                            )}
                            {!loading && results.length === 0 && (
                                <li className="airport-select__hint" role="presentation">No airports match “{query.trim()}”.</li>
                            )}
                            {results.map((airport, index) => (
                                <li
                                    key={`${airport.iata}-${airport.icao ?? index}`}
                                    role="option"
                                    aria-selected={index === activeIndex}
                                    className={`airport-select__option ${index === activeIndex ? 'airport-select__option--active' : ''}`}
                                    onMouseDown={(event) => { event.preventDefault(); selectApiOption(airport); }}
                                    onMouseEnter={() => setActiveIndex(index)}
                                >
                                    <span className="airport-select__code">{airport.iata}</span>
                                    <span className="airport-select__name">
                                        {airport.name}
                                        {airport.municipality && airport.municipality !== airport.name && (
                                            <span className="airport-select__muni"> · {airport.municipality}</span>
                                        )}
                                    </span>
                                    {airport.isoCountry && <span className="airport-select__country">{airport.isoCountry}</span>}
                                </li>
                            ))}
                        </>
                    ) : (
                        browseGroups.map((group) => (
                            <React.Fragment key={group.country}>
                                <li className="airport-select__group" role="presentation">
                                    <span className="airport-select__group-flag">{group.flag}</span>
                                    {group.country}
                                </li>
                                {group.airports.map((airport) => {
                                    const index = browseIndexByCode.get(airport.code) ?? -1;
                                    return (
                                        <li
                                            key={airport.code}
                                            role="option"
                                            aria-selected={index === activeIndex}
                                            className={`airport-select__option ${index === activeIndex ? 'airport-select__option--active' : ''}`}
                                            onMouseDown={(event) => { event.preventDefault(); selectCurated(airport); }}
                                            onMouseEnter={() => setActiveIndex(index)}
                                        >
                                            <span className="airport-select__code">{airport.code}</span>
                                            <span className="airport-select__name">
                                                <span className="airport-select__flag">{airport.flag}</span>
                                                {airport.city}
                                            </span>
                                        </li>
                                    );
                                })}
                            </React.Fragment>
                        ))
                    )}
                </ul>
            )}
        </div>
    );
};

export default AirportAutocomplete;
