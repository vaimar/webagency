import React, { useId } from 'react';
import { formatClock, formatDuration, formatShortDate } from '../services/flightFormat';
import {
    alightingLabel,
    changeMinutes,
    changesText,
    formatDistanceKm,
    legName,
    RailJourney,
    RailOrigin,
    RailWaysInResponse,
    waitText,
} from '../services/railWaysIn';
import './RailWaysIn.css';

// "By train" — the block on a French spot page that answers "I've landed, which
// train do I take?".
//
// Spec: docs/specs/sncf-rail-ways-in.md (rev 4), sections 8.2–8.3.
//
// Presentational only: every string below is fixed copy from 8.3 and every
// figure comes from the endpoint. Three things it deliberately refuses to do:
//
//   · It shows no price. SNCF publishes no fares through this API, so each
//     journey links out to SNCF Connect under a red Manual check badge rather
//     than implying a number we don't have. A €0 here would be a lie.
//   · It never re-zones a time. Clocks come from formatClock, which reads the
//     wall clock out of the ISO string, and the chained date is SLICED from the
//     Paris-offset stamp rather than parsed — parsing renders it in the
//     reader's zone and a 00:30 landing shows the previous day in New York.
//   · It says which kind of empty it hit. Nine statuses, each with its own
//     sentence, so "no train" and "SNCF is down" never look alike.

export interface RailWaysInProps {
    state:
        | { kind: 'loading' }
        | { kind: 'error' }
        | { kind: 'loaded'; data: RailWaysInResponse };
}

/** Statuses that render nothing at all — not even the heading (8.3). */
const SILENT_STATUSES = new Set(['NOT_FRANCE', 'NO_COORDINATES', 'NOT_CONFIGURED']);

const PROVIDER_UNAVAILABLE_TEXT = 'Train times are unavailable right now. Try again later.';

const ORIGIN_STATUS_TEXT: Record<string, string> = {
    NO_JOURNEY: 'No train from here on this date.',
    TIMETABLE_NOT_PUBLISHED: 'Times for this date are not published yet.',
    PROVIDER_UNAVAILABLE: 'Could not load trains from here right now.',
    QUOTA_EXHAUSTED: 'Could not load trains from here right now.',
};

/**
 * Shown once per journey that offers a choice, and only then: with a single
 * option there is no "getting off earlier" to warn about.
 *
 * Kept as one named constant because the wording is still settling — it must
 * stay true whether a journey yields one option or five, so it names no count
 * and no pair of stations.
 */
const ALIGHTING_NOTE = 'Getting off earlier can leave you farther from the spot. '
    + 'Onward travel from any of these stations is not included.';

const Journey: React.FC<{ journey: RailJourney; stationName: string; bookingUrl: string }> = ({
    journey, stationName, bookingUrl,
}) => {
    const options = journey.alightingOptions ?? [];
    // One option is not a choice, so it gets no heading and no warning — just
    // the line saying where this train leaves you.
    const offersChoice = options.length > 1;

    return (
        <li className="rail-ways-in__journey">
            {/* Names the end station, so a 4h37 headline can't be read as the
                earlier, nearer-sounding option below it. */}
            <p className="rail-ways-in__journey-summary">
                {`${formatClock(journey.departure)} → ${stationName} ${formatClock(journey.arrival)} · ${formatDuration(journey.durationMinutes)} · ${changesText(journey.changes)}`}
            </p>
            <ol className="rail-ways-in__legs">
                {journey.legs.map((leg, index) => {
                    const previous = index > 0 ? journey.legs[index - 1] : null;
                    return (
                        <li className="rail-ways-in__leg-item" key={`${leg.from}-${leg.departure}-${index}`}>
                            {previous && (
                                <p className="rail-ways-in__change">
                                    {`Change at ${previous.to}, ${waitText(changeMinutes(previous, leg))}`}
                                </p>
                            )}
                            <p className="rail-ways-in__leg">
                                {`${legName(leg)} · ${leg.from} ${formatClock(leg.departure)} → ${leg.to} ${formatClock(leg.arrival)}`}
                            </p>
                        </li>
                    );
                })}
            </ol>

            {options.length > 0 && (
                <div className="rail-ways-in__alighting">
                    {offersChoice && <p className="rail-ways-in__alighting-title">Where to get off:</p>}
                    <ul className="rail-ways-in__options">
                        {options.map((option) => (
                            <li
                                key={option.stationId}
                                className={`rail-ways-in__option${option.final ? ' rail-ways-in__option--final' : ''}`}
                            >
                                {alightingLabel(option)}
                            </li>
                        ))}
                    </ul>
                    {offersChoice && <p className="rail-ways-in__alighting-note">{ALIGHTING_NOTE}</p>}
                </div>
            )}

            <a
                className="rail-ways-in__link"
                href={bookingUrl}
                target="_blank"
                rel="noopener noreferrer"
            >
                Check fares on SNCF Connect
            </a>
        </li>
    );
};

const Origin: React.FC<{ origin: RailOrigin; stationName: string; bookingUrl: string }> = ({
    origin, stationName, bookingUrl,
}) => (
    <li className="rail-ways-in__origin">
        <h4 className="rail-ways-in__origin-title">
            {origin.kind === 'AIRPORT' ? `From ${origin.label} (${origin.code})` : `From ${origin.label}`}
        </h4>
        <p className="rail-ways-in__origin-note">{origin.note}</p>
        {origin.status === 'OK' ? (
            <ul className="rail-ways-in__journeys">
                {origin.journeys.map((journey) => (
                    <Journey
                        key={`${journey.departure}-${journey.arrival}`}
                        journey={journey}
                        stationName={stationName}
                        bookingUrl={bookingUrl}
                    />
                ))}
            </ul>
        ) : (
            <p className="rail-ways-in__origin-status">{ORIGIN_STATUS_TEXT[origin.status]}</p>
        )}
    </li>
);

/**
 * The date line. Chained mode names the flight and the buffer it allows; sample
 * mode says loudly that the date is not the reader's.
 *
 * The chained date is `slice(0, 10)` of the Paris-offset stamp, not a parse of
 * it — see the module note above.
 */
const dateLineText = (data: RailWaysInResponse): string | null => {
    const { chain, date, dateBasis, departAfter, origins } = data;

    if (dateBasis === 'AFTER_FLIGHT' && chain && chain.bufferMinutes != null) {
        const landingDate = formatShortDate(chain.arrivalTime.slice(0, 10));
        if (!landingDate) return null;
        // Chained mode has exactly one origin (7.3); a city origin has no
        // station of its own, so the copy names "a Paris station" instead.
        const target = origins[0]?.stationName ?? 'a Paris station';
        return `After your flight lands at ${chain.airport} at ${formatClock(chain.arrivalTime)} on ${landingDate}: `
            + `trains from ${departAfter}, allowing ${formatDuration(chain.bufferMinutes)} to reach ${target}.`;
    }

    if (dateBasis === 'SAMPLE' && date) {
        const sampleDate = formatShortDate(date);
        if (!sampleDate) return null;
        return `Sample date ${sampleDate}, departures from ${departAfter}. Not your travel date.`;
    }

    return null;
};

const RailWaysIn: React.FC<RailWaysInProps> = ({ state }) => {
    const headingId = useId();

    if (state.kind === 'loaded' && SILENT_STATUSES.has(state.data.status)) return null;

    const body = (): React.ReactNode => {
        if (state.kind === 'loading') {
            return <p className="rail-ways-in__message" role="status">Looking up train times…</p>;
        }
        if (state.kind === 'error') {
            return <p className="rail-ways-in__message">{PROVIDER_UNAVAILABLE_TEXT}</p>;
        }

        const { data } = state;
        const { chain, date, station, status } = data;

        if (status === 'NO_STATION_NEARBY') {
            return <p className="rail-ways-in__message">No train station within 30 km of this spot.</p>;
        }

        const dateLine = dateLineText(data);
        const formattedDate = formatShortDate(date);

        return (
            <>
                {chain?.routed === false && (
                    <p className="rail-ways-in__note">
                        {`Your flight lands at ${chain.airport}. We don't have train times from there yet, so these are for a sample date.`}
                    </p>
                )}

                {dateLine && <p className="rail-ways-in__date">{dateLine}</p>}

                {station && (
                    <p className="rail-ways-in__station">
                        {`To ${station.name}, ${formatDistanceKm(station.distanceKm)} km from the spot in a straight line. `
                            + 'Getting from the station to the spot is not included.'}
                    </p>
                )}

                {status === 'OK' && (
                    <p className="rail-ways-in__price-note">
                        <span className="badge badge--danger">Manual check</span>
                        <span>SNCF gives no fares, so trains are not in any total.</span>
                    </p>
                )}

                {status === 'NO_JOURNEY' && formattedDate && (
                    <p className="rail-ways-in__message">{`SNCF found no train to ${station?.name} on ${formattedDate}.`}</p>
                )}

                {status === 'TIMETABLE_NOT_PUBLISHED' && formattedDate && (
                    <p className="rail-ways-in__message">{`SNCF has not published train times for ${formattedDate} yet.`}</p>
                )}

                {status === 'PROVIDER_UNAVAILABLE' && (
                    <p className="rail-ways-in__message">{PROVIDER_UNAVAILABLE_TEXT}</p>
                )}

                {status === 'QUOTA_EXHAUSTED' && (
                    <p className="rail-ways-in__message">Train times are paused for today. Try again tomorrow.</p>
                )}

                {status === 'OK' && station && (
                    <ul className="rail-ways-in__origins">
                        {data.origins.map((origin) => (
                            <Origin
                                key={origin.code}
                                origin={origin}
                                stationName={station.name}
                                bookingUrl={data.bookingUrl}
                            />
                        ))}
                    </ul>
                )}

                {station && <p className="rail-ways-in__attribution">Train times from SNCF.</p>}
            </>
        );
    };

    return (
        <section className="rail-ways-in" aria-labelledby={headingId}>
            <h3 id={headingId} className="rail-ways-in__title">By train</h3>
            {body()}
        </section>
    );
};

export default RailWaysIn;
