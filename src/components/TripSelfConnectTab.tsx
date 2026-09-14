import React from 'react';
import { getCityImageForAirport } from '../data/cityImages';
import { formatCurrency, formatDateTime, formatMinutes } from '../services/tripExploreSelectors';
import { SelfConnectLeg, SelfConnectResult } from '../services/selfConnect';
import BookingLinks from './BookingLinks';

export type SelfConnectStatus = 'idle' | 'loading' | 'done' | 'error';

interface TripSelfConnectTabProps {
    status: SelfConnectStatus;
    result: SelfConnectResult | null;
    onRetry: () => void;
}

const Leg: React.FC<{ leg?: SelfConnectLeg | null; label: string; date?: string | null }> = ({ leg, label, date }) => {
    if (!leg) {
        return null;
    }
    const dep = formatDateTime(leg.scheduledDeparture);
    const arr = formatDateTime(leg.scheduledArrival);
    return (
        <div className="trip-explore-dashboard__sc-leg trip-explore-dashboard__sc-leg--col">
            <div className="trip-explore-dashboard__sc-leg-top">
                <div>
                    <span className="trip-explore-dashboard__meta-label">{label}</span>
                    <strong>
                        {leg.departureAirport} → {leg.arrivalAirport}
                        {leg.airline ? ` · ${leg.airline}` : ''}
                    </strong>
                    {(dep || arr) && (
                        <p className="trip-explore-dashboard__muted">{[dep, arr].filter(Boolean).join(' → ')}</p>
                    )}
                </div>
                <strong className="trip-explore-dashboard__sc-leg-price">
                    {leg.priceEur != null ? formatCurrency(leg.priceEur) : '—'}
                </strong>
            </div>
            <BookingLinks origin={leg.departureAirport} destination={leg.arrivalAirport} date={date} />
        </div>
    );
};

const TripSelfConnectTab: React.FC<TripSelfConnectTabProps> = ({ status, result, onRetry }) => {
    const options = result?.options ?? [];
    const directPrice = result?.directPriceEur ?? null;

    return (
        <article className="trip-explore-dashboard__card">
            <div className="trip-explore-dashboard__card-top">
                <div>
                    <p className="trip-explore-dashboard__label">Creative routing</p>
                    <h3 className="trip-explore-dashboard__card-title">Self-transfer deals</h3>
                </div>
                {status === 'done' && (
                    <span className="trip-explore-dashboard__badge trip-explore-dashboard__badge--accent">
                        {options.length} beat{options.length === 1 ? 's' : ''} direct
                    </span>
                )}
            </div>

            {status === 'loading' && (
                <div className="trip-explore-dashboard__ai-loading" role="status" aria-live="polite">
                    <span className="trip-explore-dashboard__ai-spinner" />
                    <p className="trip-explore-dashboard__muted">
                        Searching hidden 2-leg routes through Europe's cheap hubs… this runs several flight searches.
                    </p>
                </div>
            )}

            {status === 'error' && (
                <div className="trip-explore-dashboard__alert-block">
                    <span className="trip-explore-dashboard__alert-label">Self-transfer search unavailable</span>
                    <p>Could not run the routing search. Your direct/fly-drive options are unaffected.</p>
                    <button type="button" className="trip-explore-dashboard__chip" onClick={onRetry}>Try again</button>
                </div>
            )}

            {status === 'done' && (
                <>
                    <p className="trip-explore-dashboard__muted">
                        Book each leg separately to beat the airlines' hidden pricing.
                        {directPrice != null && <> Direct fare for comparison: <strong>{formatCurrency(directPrice)}</strong>.</>}
                    </p>

                    {options.length === 0 ? (
                        <p className="trip-explore-dashboard__muted" role="status">
                            No self-transfer route beat the direct fare this time — the direct option is already your best bet.
                        </p>
                    ) : (
                        <>
                            <div className="trip-explore-dashboard__sc-list">
                                {options.map((option, index) => {
                                    const hubImage = getCityImageForAirport(option.hub);
                                    return (
                                    <div key={`${option.hub}-${index}`} className="trip-explore-dashboard__sc-option">
                                        {hubImage && (
                                            <div className="trip-explore-dashboard__sc-photo">
                                                <img
                                                    src={hubImage.url}
                                                    alt={`${hubImage.city} — connection city`}
                                                    loading="lazy"
                                                    onError={(event) => { event.currentTarget.parentElement!.style.display = 'none'; }}
                                                />
                                                <span className="trip-explore-dashboard__sc-photo-caption">
                                                    {hubImage.city} · {hubImage.credit}
                                                </span>
                                            </div>
                                        )}
                                        <div className="trip-explore-dashboard__sc-head">
                                            <div>
                                                <strong className="trip-explore-dashboard__sc-hub">
                                                    via {option.hubName ?? option.hub}
                                                </strong>
                                                <span className={
                                                    option.connectionType === 'OVERNIGHT'
                                                        ? 'trip-explore-dashboard__badge trip-explore-dashboard__badge--warn'
                                                        : 'trip-explore-dashboard__badge trip-explore-dashboard__badge--accent'
                                                }>
                                                    {option.connectionType === 'OVERNIGHT'
                                                        ? 'Overnight'
                                                        : `Same-day · ${formatMinutes(option.layoverMinutes) ?? ''} layover`}
                                                </span>
                                            </div>
                                            <div className="trip-explore-dashboard__sc-totals">
                                                <strong className="trip-explore-dashboard__sc-total">
                                                    {formatCurrency(option.totalEur)}
                                                </strong>
                                                {option.savingsVsDirectEur != null && option.savingsVsDirectEur > 0 && (
                                                    <span className="trip-explore-dashboard__sc-save">
                                                        save {formatCurrency(option.savingsVsDirectEur)}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <Leg leg={option.leg1} label="Leg 1" date={result?.travelDate} />
                                        <Leg leg={option.leg2} label="Leg 2" date={result?.travelDate} />

                                        {option.overnightHotelEur != null && (
                                            <div className="trip-explore-dashboard__sc-leg">
                                                <span className="trip-explore-dashboard__meta-label">
                                                    Overnight at {option.hub} <em>est.</em>
                                                </span>
                                                <strong className="trip-explore-dashboard__sc-leg-price">
                                                    {formatCurrency(option.overnightHotelEur)}
                                                </strong>
                                            </div>
                                        )}
                                    </div>
                                    );
                                })}
                            </div>

                            <div className="trip-explore-dashboard__sc-risk" role="note">
                                <p className="trip-explore-dashboard__sc-risk-lead">
                                    ⚠ <strong>Self-transfer risk:</strong> these are separate tickets — if a delay or
                                    cancellation makes you miss leg 2, the second airline owes you nothing.
                                </p>
                                <ul className="trip-explore-dashboard__sc-tips">
                                    <li><strong>Buffer:</strong> keep at least 2h30 between landing and the next take-off — more if you check a bag.</li>
                                    <li><strong>Bags:</strong> luggage is never through-checked. Collect it, exit arrivals, and check in again for leg 2.</li>
                                    <li><strong>Check-in:</strong> do online check-in for both legs before you leave home — low-cost bag drops close ~40 min before departure.</li>
                                    <li><strong>Overnight:</strong> on overnight connections, book a hotel by the hub airport or confirm the terminal stays open all night.</li>
                                    <li><strong>Cover:</strong> travel insurance with missed-connection cover turns the worst case into paperwork instead of a lost trip.</li>
                                </ul>
                            </div>
                        </>
                    )}
                </>
            )}
        </article>
    );
};

export default TripSelfConnectTab;
