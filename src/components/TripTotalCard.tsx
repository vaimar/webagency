import React, { useId } from 'react';
import { formatCents } from '../services/flightFormat';
import {
    NIGHTS_MAX,
    TRAVELLERS_MAX,
    TotalLineKind,
    TripTotal,
    TripTotalLine,
} from '../services/tripTotal';
import './TripTotalCard.css';

// Rough trip cost — the card on a spot page that adds one outbound fare to one
// place to stay, for a group, for a number of nights.
//
// Presentational only: every number comes from combineTripTotal
// (src/services/tripTotal.ts). Spec: docs/specs/combined-trip-total.md, 7.8–7.9.
//
// Its honesty is in what it refuses to hide. The headline names its basis
// ("Flight out + stay"), the all-in sits beside it rather than inside it, a
// line with no usable price stays on the card saying so, and the list of what
// the figure leaves out is always open — never a disclosure to expand.

export interface TripTotalCardProps {
    total: TripTotal;
    onNightsChange: (nights: number) => void;
    onTravellersChange: (travellers: number) => void;
    onRemove: (kind: TotalLineKind) => void;
}

const KIND_HEADING: Record<TotalLineKind, string> = {
    'outbound-flight': 'Flight out',
    'return-flight': 'Flight home',
    stay: 'Stay',
};

const REMOVE_LABEL: Record<TotalLineKind, string> = {
    'outbound-flight': 'Remove flight from trip cost',
    'return-flight': 'Remove return flight from trip cost',
    stay: 'Remove stay from trip cost',
};

const UNPRICED_NOTE: Record<TotalLineKind, string> = {
    'outbound-flight': 'No usable fare. Check the fare before booking.',
    'return-flight': 'No usable fare. Check the fare before booking.',
    stay: 'No live rate. Check the rate before booking.',
};

/** A stay is quantified in nights; both flight kinds share the traveller form. */
const quantityText = (line: TripTotalLine): string => {
    const n = line.quantity;
    return line.kind === 'stay'
        ? `× ${n} ${n === 1 ? 'night' : 'nights'}, 1 room`
        : `× ${n} ${n === 1 ? 'traveller' : 'travellers'}`;
};

const hasUsableAllIn = (line: TripTotalLine): boolean => {
    const value = line.component?.allInUnitAmount;
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
};

const isFlightKind = (kind: TotalLineKind): boolean => kind === 'outbound-flight' || kind === 'return-flight';

/**
 * §7.14 — the fares are undated cheapest-per-day rows, not a booked round
 * trip. Parses to a timestamp for a real date compare; `label` already
 * dropped the year formatting for display, so it cannot be used here (a
 * Dec-to-Jan round trip would compare wrong as strings).
 */
const parseDeparture = (iso: string | null | undefined): number | null => {
    if (!iso) return null;
    const time = Date.parse(iso);
    return Number.isFinite(time) ? time : null;
};

const DATE_COHERENCE_NOTE = "These two fares aren't a round trip — the flight home leaves before the flight out. Check dates before booking.";

const LineAmount: React.FC<{ line: TripTotalLine }> = ({ line }) => {
    const { component } = line;
    if (!component) return null;

    if (line.state === 'included' && line.amountCents != null) {
        return <span className="trip-total__line-amount">{formatCents(line.amountCents, 'EUR')}</span>;
    }
    if (line.state === 'not-converted' && component.unitAmount != null) {
        // The UNIT amount, not unit × quantity: the quantity is printed beside
        // it, and a £450 here would read as a price someone quoted.
        const code = (component.currency || 'EUR').toUpperCase();
        return (
            <span className="trip-total__line-state trip-total__line-state--converted">
                {`${formatCents(Math.round(component.unitAmount * 100), code)} · In ${code}, not converted, not in this total`}
            </span>
        );
    }
    return (
        <span className="trip-total__line-state trip-total__line-state--unpriced">
            {UNPRICED_NOTE[line.kind]}
        </span>
    );
};

const TotalLineRow: React.FC<{ line: TripTotalLine; onRemove: (kind: TotalLineKind) => void }> = ({ line, onRemove }) => {
    const { component } = line;

    const testId = `trip-total-line-${line.kind}`;

    if (!component) {
        return (
            <li className="trip-total__line trip-total__line--empty" data-testid={testId}>
                <span className="trip-total__line-kind">{KIND_HEADING[line.kind]}</span>
                <span className="trip-total__line-muted">Not chosen yet</span>
            </li>
        );
    }

    return (
        <li className={`trip-total__line trip-total__line--${line.state}`} data-testid={testId}>
            <div className="trip-total__line-head">
                <span className="trip-total__line-kind">{KIND_HEADING[line.kind]}</span>
                {component.manualCheck && <span className="badge badge--danger">Manual check</span>}
                <button
                    type="button"
                    className="btn btn--ghost btn--sm trip-total__remove"
                    aria-label={REMOVE_LABEL[line.kind]}
                    onClick={() => onRemove(line.kind)}
                >
                    Remove
                </button>
            </div>
            <div className="trip-total__line-body">
                <span className="trip-total__line-label">{component.label}</span>
                <span className="trip-total__line-quantity">{quantityText(line)}</span>
                <LineAmount line={line} />
            </div>
            {isFlightKind(line.kind) && component.note && (
                <p className="trip-total__note">{component.note}</p>
            )}
            {line.kind === 'stay' && (
                <>
                    <p className="trip-total__note">Price may vary for group size: the rate is for one room, not per person.</p>
                    <p className="trip-total__note">Sample rate for one night about six weeks out, not your dates.</p>
                </>
            )}
        </li>
    );
};

interface StepperProps {
    label: string;
    unit: string;
    value: number;
    max: number;
    onChange: (value: number) => void;
}

const Stepper: React.FC<StepperProps> = ({ label, unit, value, max, onChange }) => {
    const labelId = useId();
    return (
        <div className="trip-total__stepper" role="group" aria-labelledby={labelId}>
            <span id={labelId} className="trip-total__stepper-label">{label}</span>
            <div className="trip-total__stepper-controls">
                <button
                    type="button"
                    className="btn btn--quiet btn--sm trip-total__stepper-button"
                    aria-label={`One fewer ${unit}`}
                    disabled={value <= 1}
                    onClick={() => onChange(value - 1)}
                >
                    <span aria-hidden="true">−</span>
                </button>
                <output className="trip-total__stepper-value">{value}</output>
                <button
                    type="button"
                    className="btn btn--quiet btn--sm trip-total__stepper-button"
                    aria-label={`One more ${unit}`}
                    disabled={value >= max}
                    onClick={() => onChange(value + 1)}
                >
                    <span aria-hidden="true">+</span>
                </button>
            </div>
        </div>
    );
};

const TripTotalCard: React.FC<TripTotalCardProps> = ({ total, onNightsChange, onTravellersChange, onRemove }) => {
    const headingId = useId();
    const excludedId = useId();
    const hasPicks = total.lines.some((line) => line.component != null);
    const flightLines = total.lines.filter((line) => isFlightKind(line.kind));
    // Any included flight line with unknown extras trips the note — outbound
    // or return, text stays singular either way (§7.7).
    const flightAllInUnknown = flightLines.some((line) => line.state === 'included' && !hasUsableAllIn(line));

    const outboundComponent = total.lines.find((line) => line.kind === 'outbound-flight')?.component ?? null;
    const returnComponent = total.lines.find((line) => line.kind === 'return-flight')?.component ?? null;
    const outboundDeparture = parseDeparture(outboundComponent?.departureDate);
    const returnDeparture = parseDeparture(returnComponent?.departureDate);
    // §7.14 — only when both fares are picked and both dates are usable; a
    // missing/unparseable date on either side says nothing about coherence.
    const showDateCoherenceNote = outboundComponent != null && returnComponent != null
        && outboundDeparture != null && returnDeparture != null
        && returnDeparture <= outboundDeparture;

    return (
        <section className="panel trip-total" aria-labelledby={headingId}>
            <h2 id={headingId} className="panel__title trip-total__title">Rough trip cost</h2>

            {!hasPicks ? (
                <p className="trip-total__empty">Pick a flight and a place to stay to see a rough trip cost.</p>
            ) : (
                <>
                    <div className="trip-total__figures">
                        {total.totalCents != null && total.allInCents != null ? (
                            <>
                                <div className="trip-total__row trip-total__row--headline">
                                    <span className="trip-total__row-label">{total.headlineLabel}</span>
                                    <strong className="trip-total__figure">
                                        {`${total.prefix}${formatCents(total.totalCents, 'EUR')}`}
                                    </strong>
                                </div>
                                <div className="trip-total__row trip-total__row--all-in">
                                    <span className="trip-total__row-label">With bags and airport extras</span>
                                    <span className="trip-total__figure trip-total__figure--all-in">
                                        {`${total.allInPrefix}${formatCents(total.allInCents, 'EUR')}`}
                                    </span>
                                </div>
                                {flightAllInUnknown && (
                                    <p className="trip-total__note">Bags and airport extras not known for this flight.</p>
                                )}
                                {showDateCoherenceNote && (
                                    <p className="trip-total__note trip-total__note--warn">{DATE_COHERENCE_NOTE}</p>
                                )}
                            </>
                        ) : (
                            <p className="trip-total__nothing-priced">Nothing picked has a price yet.</p>
                        )}
                    </div>

                    <ul className="trip-total__lines">
                        {total.lines.map((line) => (
                            <TotalLineRow key={line.kind} line={line} onRemove={onRemove} />
                        ))}
                    </ul>

                    <div className="trip-total__steppers">
                        <Stepper label="Nights" unit="night" value={total.nights} max={NIGHTS_MAX} onChange={onNightsChange} />
                        <Stepper label="Travellers" unit="traveller" value={total.travellers} max={TRAVELLERS_MAX} onChange={onTravellersChange} />
                    </div>

                    <div className="trip-total__excluded">
                        <h3 id={excludedId} className="trip-total__excluded-title">Not in this total</h3>
                        <ul className="trip-total__excluded-list" aria-labelledby={excludedId}>
                            {total.excluded.map((item) => <li key={item}>{item}</li>)}
                        </ul>
                    </div>
                </>
            )}
        </section>
    );
};

export default TripTotalCard;
