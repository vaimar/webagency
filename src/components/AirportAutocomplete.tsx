import { faPlaneUp } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
    AirportMetadata,
    ORIGIN_AIRPORT_OPTIONS,
    formatAirportOptionLabel,
    getAirportMetadata,
    groupAirportsByCountry,
} from '../data/airportMetadata';
import {
    AIRPORT_CITIES,
    AirportCity,
    formatAirportCityLabel,
    getAirportCity,
    searchAirportCities,
} from '../data/airportCities';
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
 * Hybrid airport picker. On focus (empty box) it shows the cities served by
 * more than one airport, then the curated shortlist grouped by country with
 * flags — the familiar, browsable ~90 routes. As soon as the user types, it
 * switches to a live search across the full imported airport set (~9k) via GET
 * /api/airports, with any matching cities kept at the top.
 *
 * Stores the IATA code as its value — or a city token (see `airportCities`),
 * which every search expands into the airports it stands for.
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
    // Cities lead: "Paris" is what someone came here to say, and it is the one
    // option that cannot be typed as a code.
    const browseFlat = useMemo(() => [
        ...AIRPORT_CITIES.map((city) => city.code),
        ...browseGroups.flatMap((group) => group.airports.map((airport) => airport.code)),
    ], [browseGroups]);
    const browseIndexByCode = useMemo(
        () => new Map(browseFlat.map((code, index) => [code, index])),
        [browseFlat],
    );

    const searching = query.trim().length >= MIN_QUERY;
    // Cities are matched here rather than by the airport API, which has never
    // heard of them: it indexes airports, and a city is a group of them.
    const cityMatches = useMemo(
        () => (searching ? searchAirportCities(query) : []),
        [query, searching],
    );
    const navLength = searching ? cityMatches.length + results.length : browseFlat.length;

    // Resolve a friendly label for the selected code. Curated codes keep their
    // flag + city + country; anything else resolves to "Name · City (CODE)".
    useEffect(() => {
        if (!value) {
            setSelectedLabel('');
            return;
        }
        const city = getAirportCity(value);
        if (city) {
            setSelectedLabel(formatAirportCityLabel(city));
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
    const selectCity = (city: AirportCity) => finishSelection(city.code, formatAirportCityLabel(city));

    const selectActive = () => {
        if (activeIndex < 0) {
            return;
        }
        if (searching) {
            if (activeIndex < cityMatches.length) {
                selectCity(cityMatches[activeIndex]);
            } else if (activeIndex - cityMatches.length < results.length) {
                selectApiOption(results[activeIndex - cityMatches.length]);
            }
            return;
        }
        const code = browseFlat[activeIndex];
        const city = getAirportCity(code);
        if (city) {
            selectCity(city);
            return;
        }
        const airport = getAirportMetadata(code);
        if (airport) {
            selectCurated(airport);
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

    /** One city row: the flag and the name lead, the airports it covers follow. */
    const cityRow = (city: AirportCity, index: number) => (
        <li
            key={city.code}
            role="option"
            /* Spelled out rather than left to the markup: an accessible name
               assembled from a count chip, a flag and two spans reads as
               "3✈🇫🇷Paris· CDG". This is the option, said once. */
            aria-label={`${city.name} — ${city.airports.join(', ')}`}
            aria-selected={index === activeIndex}
            className={`airport-select__option ${index === activeIndex ? 'airport-select__option--active' : ''}`}
            onMouseDown={(event) => { event.preventDefault(); selectCity(city); }}
            onMouseEnter={() => setActiveIndex(index)}
        >
            <span className="airport-select__flag" aria-hidden="true">{city.flag}</span>
            <span className="airport-select__text">
                <span className="airport-select__primary">{city.name}, {city.country}</span>
                <span className="airport-select__secondary">
                    Any airport · {city.airports.join(' · ')}
                </span>
            </span>
            <span className="airport-select__code airport-select__code--city">ANY</span>
        </li>
    );

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
                            {cityMatches.length > 0 && (
                                <>
                                    <li className="airport-select__group" role="presentation">
                                        Cities
                                    </li>
                                    {cityMatches.map((city, index) => cityRow(city, index))}
                                </>
                            )}
                            {loading && results.length === 0 && (
                                <li className="airport-select__hint" role="presentation">Searching…</li>
                            )}
                            {!loading && results.length === 0 && cityMatches.length === 0 && (
                                <li className="airport-select__hint" role="presentation">No airports match “{query.trim()}”.</li>
                            )}
                            {results.map((airport, resultIndex) => {
                                // Cities sit above the airports, so an airport's
                                // place in the keyboard walk is offset by them.
                                const index = cityMatches.length + resultIndex;
                                return (
                                <li
                                    key={`${airport.iata}-${airport.icao ?? resultIndex}`}
                                    role="option"
                                    aria-selected={index === activeIndex}
                                    className={`airport-select__option ${index === activeIndex ? 'airport-select__option--active' : ''}`}
                                    onMouseDown={(event) => { event.preventDefault(); selectApiOption(airport); }}
                                    onMouseEnter={() => setActiveIndex(index)}
                                >
                                    <span className="airport-select__pin" aria-hidden="true">
                                        <FontAwesomeIcon icon={faPlaneUp} />
                                    </span>
                                    <span className="airport-select__text">
                                        <span className="airport-select__primary">{airport.name}</span>
                                        <span className="airport-select__secondary">
                                            {[airport.municipality, airport.isoCountry].filter(Boolean).join(', ')}
                                        </span>
                                    </span>
                                    <span className="airport-select__code">{airport.iata}</span>
                                </li>
                                );
                            })}
                        </>
                    ) : (
                        <>
                        <li className="airport-select__group" role="presentation">
                            Cities · search every airport at once
                        </li>
                        {AIRPORT_CITIES.map((city) => cityRow(city, browseIndexByCode.get(city.code) ?? -1))}
                        {browseGroups.map((group) => (
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
                                            <span className="airport-select__flag" aria-hidden="true">{airport.flag}</span>
                                            <span className="airport-select__text">
                                                <span className="airport-select__primary">{airport.city}</span>
                                                <span className="airport-select__secondary">{airport.airportName}</span>
                                            </span>
                                            <span className="airport-select__code">{airport.code}</span>
                                        </li>
                                    );
                                })}
                            </React.Fragment>
                        ))}
                        </>
                    )}
                </ul>
            )}
        </div>
    );
};

export default AirportAutocomplete;
