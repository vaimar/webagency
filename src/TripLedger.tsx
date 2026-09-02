import { faCar, faParking, faPersonSwimming, faBed, faPlane, faPlus, faXmark } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { useMemo, useState } from 'react';
import BookingLinks from './components/BookingLinks';
import { getCityImageByName, getCityImageForAirport } from './data/cityImages';
import {
    ALPS_IBIZA_2026,
    LedgerSegment,
    LedgerSegmentKind,
    NewStopInput,
    TripLedgerModel,
    clearDocument,
    computeTotals,
    createPhase,
    createSegment,
    lineGroupAmount,
    linePax,
    loadDocument,
    saveDocument,
} from './data/tripLedger';
import './TripLedger.css';

// Trip Ledger — door-to-door multi-stop trip cost builder. The itinerary
// itself is editable: add stops (drives auto-estimate fuel/tolls from km,
// flights get booking links), add ad-hoc cost lines, remove anything.
// The whole document persists locally; Reset returns to the seed template.

const KIND_ICON: Record<LedgerSegmentKind, typeof faCar> = {
    drive: faCar,
    fly: faPlane,
    stay: faBed,
    activity: faPersonSwimming,
    parking: faParking,
};

const KIND_OPTIONS: Array<{ value: LedgerSegmentKind; label: string }> = [
    { value: 'drive', label: 'Drive' },
    { value: 'fly', label: 'Flight' },
    { value: 'stay', label: 'Stay' },
    { value: 'activity', label: 'Activity' },
    { value: 'parking', label: 'Parking' },
];

const STATUS_META = {
    EXACT: { badge: '✓ exact', className: 'trip-ledger__badge--exact' },
    ESTIMATED: { badge: '~ est.', className: 'trip-ledger__badge--est' },
    CHECK: { badge: '⚠ enter', className: 'trip-ledger__badge--check' },
} as const;

const euro = (value: number): string => `€${value.toLocaleString('en-IE', { maximumFractionDigits: 0 })}`;

// A photo for a stop: flights resolve by destination airport, everything else
// by matching a known city name in the title (e.g. "Night in Paris"). For
// "Origin → Destination" titles, only the destination side is matched so a
// drive/flight shows where it's going, never a city it's merely leaving.
const segmentImage = (segment: LedgerSegment) => {
    const flightLine = segment.lines.find((line) => line.booking);
    if (flightLine?.booking) {
        const byAirport = getCityImageForAirport(flightLine.booking.destination);
        if (byAirport) {
            return byAirport;
        }
    }
    const arrowIndex = segment.title.lastIndexOf('→');
    const destinationText = arrowIndex >= 0 ? segment.title.slice(arrowIndex + 1) : segment.title;
    return getCityImageByName(destinationText);
};

// ── Add-stop inline form ─────────────────────────────────────────────────────

interface AddStopFormProps {
    onAdd: (input: NewStopInput) => void;
}

const AddStopForm: React.FC<AddStopFormProps> = ({ onAdd }) => {
    const [open, setOpen] = useState(false);
    const [kind, setKind] = useState<LedgerSegmentKind>('stay');
    const [title, setTitle] = useState('');
    const [when, setWhen] = useState('');
    const [km, setKm] = useState('');
    const [origin, setOrigin] = useState('');
    const [destination, setDestination] = useState('');
    const [date, setDate] = useState('');

    if (!open) {
        return (
            <button type="button" className="trip-ledger__add-stop-toggle" onClick={() => setOpen(true)}>
                <FontAwesomeIcon icon={faPlus} /> Add a stop
            </button>
        );
    }

    const submit = (event: React.FormEvent) => {
        event.preventDefault();
        if (!title.trim()) {
            return;
        }
        onAdd({
            kind,
            title: title.trim(),
            when: when.trim() || 'TBD',
            km: kind === 'drive' && km !== '' ? Number(km) : undefined,
            origin: kind === 'fly' ? origin.trim() : undefined,
            destination: kind === 'fly' ? destination.trim() : undefined,
            date: kind === 'fly' && date ? date : undefined,
        });
        setOpen(false);
        setTitle('');
        setWhen('');
        setKm('');
        setOrigin('');
        setDestination('');
        setDate('');
    };

    return (
        <form className="trip-ledger__add-stop" onSubmit={submit}>
            <div className="trip-ledger__add-stop-row">
                <select className="trip-ledger__add-input" value={kind} onChange={(e) => setKind(e.target.value as LedgerSegmentKind)} aria-label="Stop type">
                    {KIND_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                </select>
                <input
                    className="trip-ledger__add-input trip-ledger__add-input--grow"
                    placeholder="Title — e.g. 2 nights in Barcelona"
                    aria-label="Stop title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                />
                <input
                    className="trip-ledger__add-input"
                    placeholder="When — e.g. Tue 4 Aug"
                    aria-label="Stop dates"
                    value={when}
                    onChange={(e) => setWhen(e.target.value)}
                />
            </div>
            {kind === 'drive' && (
                <div className="trip-ledger__add-stop-row">
                    <input
                        className="trip-ledger__add-input"
                        type="number"
                        min="1"
                        placeholder="Distance km"
                        aria-label="Distance in km"
                        value={km}
                        onChange={(e) => setKm(e.target.value)}
                    />
                    <span className="trip-ledger__add-hint">→ fuel &amp; toll estimates appear automatically</span>
                </div>
            )}
            {kind === 'fly' && (
                <div className="trip-ledger__add-stop-row">
                    <input className="trip-ledger__add-input trip-ledger__add-input--iata" placeholder="From (SNN)" aria-label="Origin airport" maxLength={3} value={origin} onChange={(e) => setOrigin(e.target.value)} />
                    <input className="trip-ledger__add-input trip-ledger__add-input--iata" placeholder="To (BCN)" aria-label="Destination airport" maxLength={3} value={destination} onChange={(e) => setDestination(e.target.value)} />
                    <input className="trip-ledger__add-input" type="date" aria-label="Flight date" value={date} onChange={(e) => setDate(e.target.value)} />
                    <span className="trip-ledger__add-hint">→ booking links appear automatically</span>
                </div>
            )}
            <div className="trip-ledger__add-stop-row">
                <button type="submit" className="trip-ledger__add-confirm">Add stop</button>
                <button type="button" className="trip-ledger__add-cancel" onClick={() => setOpen(false)}>Cancel</button>
            </div>
        </form>
    );
};

// ── Page ─────────────────────────────────────────────────────────────────────

const TripLedger: React.FC = () => {
    const [model, setModel] = useState<TripLedgerModel>(() => loadDocument(ALPS_IBIZA_2026));
    const [newPhaseTitle, setNewPhaseTitle] = useState('');

    const totals = useMemo(() => computeTotals(model, {}), [model]);

    const mutate = (fn: (draft: TripLedgerModel) => void) => {
        setModel((current) => {
            const draft = JSON.parse(JSON.stringify(current)) as TripLedgerModel;
            fn(draft);
            saveDocument(draft);
            return draft;
        });
    };

    const eachLine = (draft: TripLedgerModel, lineId: string, fn: (line: TripLedgerModel['phases'][0]['segments'][0]['lines'][0]) => void) => {
        for (const phase of draft.phases) {
            for (const segment of phase.segments) {
                for (const line of segment.lines) {
                    if (line.id === lineId) {
                        fn(line);
                        return;
                    }
                }
            }
        }
    };

    const updateAmount = (lineId: string, raw: string) => {
        mutate((draft) => eachLine(draft, lineId, (line) => {
            if (raw === '') {
                line.amount = null;
                line.status = 'CHECK';
                return;
            }
            const amount = Number(raw);
            if (Number.isNaN(amount) || amount < 0) {
                return;
            }
            // A figure the user typed is their real number — count it as exact.
            line.amount = amount;
            line.status = 'EXACT';
        }));
    };

    const updatePax = (lineId: string, raw: string) => {
        const pax = Number(raw);
        if (raw === '' || Number.isNaN(pax) || pax < 1 || pax > 9) {
            return;
        }
        mutate((draft) => eachLine(draft, lineId, (line) => {
            line.pax = Math.round(pax);
        }));
    };

    const removeLine = (segmentId: string, lineId: string) => {
        mutate((draft) => {
            for (const phase of draft.phases) {
                for (const segment of phase.segments) {
                    if (segment.id === segmentId) {
                        segment.lines = segment.lines.filter((line) => line.id !== lineId);
                    }
                }
            }
        });
    };

    const addLine = (segmentId: string) => {
        mutate((draft) => {
            for (const phase of draft.phases) {
                for (const segment of phase.segments) {
                    if (segment.id === segmentId) {
                        segment.lines.push({
                            id: `custom-line-${Date.now()}`,
                            label: 'Extra cost — rename me',
                            amount: null,
                            status: 'CHECK',
                        });
                    }
                }
            }
        });
    };

    const renameLine = (lineId: string, label: string) => {
        mutate((draft) => eachLine(draft, lineId, (line) => {
            line.label = label;
        }));
    };

    const removeSegment = (phaseId: string, segmentId: string) => {
        mutate((draft) => {
            const phase = draft.phases.find((p) => p.id === phaseId);
            if (phase) {
                phase.segments = phase.segments.filter((segment) => segment.id !== segmentId);
            }
        });
    };

    const addStop = (phaseId: string, input: NewStopInput) => {
        mutate((draft) => {
            const phase = draft.phases.find((p) => p.id === phaseId);
            if (phase) {
                phase.segments.push(createSegment(input));
            }
        });
    };

    const addPhase = () => {
        const title = newPhaseTitle.trim();
        if (!title) {
            return;
        }
        mutate((draft) => {
            draft.phases.push(createPhase(title));
        });
        setNewPhaseTitle('');
    };

    const resetAll = () => {
        clearDocument();
        setModel(ALPS_IBIZA_2026);
    };

    return (
        <section className="trip-ledger" aria-label="Trip ledger">
            <header className="trip-ledger__header">
                <p className="trip-ledger__eyebrow">Door-to-door ledger</p>
                <h1 className="trip-ledger__title">{model.title}</h1>
                <p className="trip-ledger__subtitle">
                    {model.partyLabel} · Add stops, flights, and costs as your plan grows — drives estimate fuel and
                    tolls from distance, flights get booking links. Your numbers count as exact; estimates stay labelled.
                </p>
            </header>

            <div className="trip-ledger__summary" role="status">
                <div className="trip-ledger__summary-item">
                    <span className="trip-ledger__summary-label">Exact so far</span>
                    <strong className="trip-ledger__summary-value trip-ledger__summary-value--exact">{euro(totals.exact)}</strong>
                </div>
                <div className="trip-ledger__summary-item">
                    <span className="trip-ledger__summary-label">Estimated</span>
                    <strong className="trip-ledger__summary-value trip-ledger__summary-value--est">{euro(totals.estimated)}</strong>
                </div>
                <div className="trip-ledger__summary-item">
                    <span className="trip-ledger__summary-label">Total so far</span>
                    <strong className="trip-ledger__summary-value">{euro(totals.knownTotal)}</strong>
                </div>
                <div className="trip-ledger__summary-item">
                    <span className="trip-ledger__summary-label">Still unknown</span>
                    <strong className={`trip-ledger__summary-value ${totals.unknownCount > 0 ? 'trip-ledger__summary-value--check' : 'trip-ledger__summary-value--exact'}`}>
                        {totals.unknownCount > 0 ? `${totals.unknownCount} lines` : 'none 🎉'}
                    </strong>
                </div>
                <button type="button" className="trip-ledger__reset" onClick={resetAll}>Reset to template</button>
            </div>

            {totals.unknownCount > 0 && (
                <p className="trip-ledger__honesty" role="note">
                    ⚠ {totals.unknownCount} cost line{totals.unknownCount === 1 ? '' : 's'} still unknown — the total above is a floor, not the trip price.
                </p>
            )}

            {model.phases.map((phase) => (
                <section key={phase.id} className="trip-ledger__phase" aria-label={phase.title}>
                    <h2 className="trip-ledger__phase-title">{phase.title}</h2>
                    {phase.segments.map((segment) => {
                        const photo = segmentImage(segment);
                        return (
                        <article key={segment.id} className="trip-ledger__segment">
                            {photo && (
                                <div className="trip-ledger__segment-photo">
                                    <img
                                        src={photo.url}
                                        alt={photo.city}
                                        loading="lazy"
                                        onError={(event) => { event.currentTarget.parentElement!.style.display = 'none'; }}
                                    />
                                    <span className="trip-ledger__segment-photo-caption">{photo.city} · {photo.credit}</span>
                                </div>
                            )}
                            <div className="trip-ledger__segment-head">
                                <span className="trip-ledger__segment-icon">
                                    <FontAwesomeIcon icon={KIND_ICON[segment.kind]} />
                                </span>
                                <div className="trip-ledger__segment-heading">
                                    <h3 className="trip-ledger__segment-title">{segment.title}</h3>
                                    <span className="trip-ledger__segment-when">{segment.when}</span>
                                </div>
                                <button
                                    type="button"
                                    className="trip-ledger__remove"
                                    aria-label={`Remove ${segment.title}`}
                                    title="Remove this stop"
                                    onClick={() => removeSegment(phase.id, segment.id)}
                                >
                                    <FontAwesomeIcon icon={faXmark} />
                                </button>
                            </div>

                            {segment.lines.map((line) => {
                                const group = lineGroupAmount(line, model.payingTravellers);
                                const meta = STATUS_META[line.status];
                                const isCustomLine = line.id.startsWith('custom-line-');
                                return (
                                    <div key={line.id} className="trip-ledger__line">
                                        <div className="trip-ledger__line-main">
                                            <span className={`trip-ledger__badge ${meta.className}`}>{meta.badge}</span>
                                            <span className="trip-ledger__line-label">
                                                {isCustomLine ? (
                                                    <input
                                                        className="trip-ledger__label-input"
                                                        aria-label="Cost line name"
                                                        value={line.label}
                                                        onChange={(event) => renameLine(line.id, event.target.value)}
                                                    />
                                                ) : (
                                                    line.label
                                                )}
                                                {line.perPerson && (
                                                    <span className="trip-ledger__pax">
                                                        {' × '}
                                                        <input
                                                            className="trip-ledger__pax-input"
                                                            type="number"
                                                            min="1"
                                                            max="9"
                                                            aria-label={`${line.label} traveller count`}
                                                            value={linePax(line, model.payingTravellers)}
                                                            onChange={(event) => updatePax(line.id, event.target.value)}
                                                        />
                                                        <em className="trip-ledger__pax-hint">travellers</em>
                                                    </span>
                                                )}
                                            </span>
                                            <span className="trip-ledger__line-amounts">
                                                <input
                                                    className="trip-ledger__amount-input"
                                                    type="number"
                                                    min="0"
                                                    inputMode="decimal"
                                                    placeholder="?"
                                                    aria-label={`${line.label} amount in euro${line.perPerson ? ' per person' : ''}`}
                                                    value={line.amount ?? ''}
                                                    onChange={(event) => updateAmount(line.id, event.target.value)}
                                                />
                                                <strong className="trip-ledger__line-total">
                                                    {group == null ? '—' : euro(group)}
                                                </strong>
                                                <button
                                                    type="button"
                                                    className="trip-ledger__remove trip-ledger__remove--line"
                                                    aria-label={`Remove cost line ${line.label}`}
                                                    title="Remove this cost line"
                                                    onClick={() => removeLine(segment.id, line.id)}
                                                >
                                                    <FontAwesomeIcon icon={faXmark} />
                                                </button>
                                            </span>
                                        </div>
                                        {line.note && <p className="trip-ledger__line-note">{line.note}</p>}
                                        {line.booking && (
                                            <BookingLinks
                                                origin={line.booking.origin}
                                                destination={line.booking.destination}
                                                date={line.booking.date}
                                            />
                                        )}
                                    </div>
                                );
                            })}

                            <button type="button" className="trip-ledger__add-line" onClick={() => addLine(segment.id)}>
                                <FontAwesomeIcon icon={faPlus} /> cost line
                            </button>

                            {segment.info && <p className="trip-ledger__segment-info">ℹ {segment.info}</p>}
                        </article>
                        );
                    })}

                    <AddStopForm onAdd={(input) => addStop(phase.id, input)} />
                </section>
            ))}

            <div className="trip-ledger__add-phase">
                <input
                    className="trip-ledger__add-input trip-ledger__add-input--grow"
                    placeholder="New phase — e.g. Barcelona detour"
                    aria-label="New phase title"
                    value={newPhaseTitle}
                    onChange={(event) => setNewPhaseTitle(event.target.value)}
                    onKeyDown={(event) => { if (event.key === 'Enter') addPhase(); }}
                />
                <button type="button" className="trip-ledger__add-confirm" onClick={addPhase}>
                    <FontAwesomeIcon icon={faPlus} /> Add phase
                </button>
            </div>

            <footer className="trip-ledger__excluded" role="note">
                <strong>Not in the total:</strong>
                <ul>
                    {model.excluded.map((item) => <li key={item}>{item}</li>)}
                </ul>
            </footer>
        </section>
    );
};

export default TripLedger;
