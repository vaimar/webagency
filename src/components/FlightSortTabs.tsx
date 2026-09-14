import React from 'react';
import { FLIGHT_SORT_OPTIONS, FlightSortKey } from '../services/hackFlightSort';
import './FlightSortTabs.css';

interface FlightSortTabsProps {
    value: FlightSortKey;
    onChange: (key: FlightSortKey) => void;
    /**
     * What the winner of each ordering actually is — "€155", "06:20", "5h15".
     * Every metasearch puts this on the tab, and it is the cheapest way to
     * answer "is it worth switching?" without switching.
     */
    summaries?: Partial<Record<FlightSortKey, string | null>>;
}

/**
 * Cheapest / take-off / landing / shortest, as one segmented control shared by
 * both Hack Flights tabs — they used to keep a copy each and could drift.
 *
 * The accessible name is the plain option label: the summary underneath is a
 * live number, and a control whose name changes as data loads is one a screen
 * reader user cannot refer to twice.
 */
const FlightSortTabs: React.FC<FlightSortTabsProps> = ({ value, onChange, summaries }) => (
    <div className="flight-sort" role="group" aria-label="Sort results">
        {FLIGHT_SORT_OPTIONS.map((option) => {
            const summary = summaries?.[option.key];
            return (
                <button
                    key={option.key}
                    type="button"
                    className={`flight-sort__tab ${value === option.key ? 'flight-sort__tab--active' : ''}`}
                    aria-label={option.label}
                    aria-pressed={value === option.key}
                    onClick={() => onChange(option.key)}
                >
                    <span className="flight-sort__label">{option.label}</span>
                    {summaries && <span className="flight-sort__meta">{summary ?? '—'}</span>}
                </button>
            );
        })}
    </div>
);

export default FlightSortTabs;
