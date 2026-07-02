import React, { useState } from 'react';
import {
    formatDate,
    getFlightRows,
    getOrchestrationStatus,
    getWarningText,
    isDegradedResponse,
} from '../services/tripExploreSelectors';
import { TripExplorationResponse } from '../types/tripExploration';
import TripFlightsTab from './TripFlightsTab';
import TripOverviewTab from './TripOverviewTab';
import TripStaysTab from './TripStaysTab';
import './TripExploreDashboard.css';

// Wire contract lives in src/types/tripExploration.ts (mirrors the Spring
// DTOs field-for-field). Re-exported here so existing imports keep working.
export type {
    AccommodationTradeoff,
    ActivityPlace,
    ExploreWarning,
    HiddenGemHotel,
    HotelDetails,
    HotelResult,
    TripExplorationResponse,
    TripExplorePayload,
    UnifiedFlight,
    UnifiedFlightOption,
} from '../types/tripExploration';

export interface TripExploreDashboardProps {
    tripData: TripExplorationResponse;
}

type DashboardTab = 'overview' | 'flights' | 'stays';

// Shell component: header, orchestration status, and tab navigation. Each tab
// is an isolated read-only projection of the same untruncated payload — the
// dashboard never re-shapes tripData, so nothing is lost between views.
const TripExploreDashboard: React.FC<TripExploreDashboardProps> = ({ tripData }) => {
    const [activeTab, setActiveTab] = useState<DashboardTab>('overview');

    const destination = tripData.destination ?? 'Your next drop';
    const travelDate = tripData.travelDate;
    const status = getOrchestrationStatus(tripData);
    const isDegraded = isDegradedResponse(tripData);
    const warnings = (tripData.orchestrationWarnings ?? []).map((warning) => getWarningText(warning));

    const flightCount = getFlightRows(tripData).length;
    const staysCount = tripData.hiddenGemHotels?.length ?? 0;

    const tabs: Array<{ id: DashboardTab; label: string }> = [
        { id: 'overview', label: 'Overview' },
        { id: 'flights', label: `Flights (${flightCount})` },
        { id: 'stays', label: `Stays (${staysCount})` },
    ];

    return (
        <section className="trip-explore-dashboard" aria-label="Trip explore dashboard">
            <header className="trip-explore-dashboard__header">
                <div>
                    <p className="trip-explore-dashboard__eyebrow">Adrenaline weekend</p>
                    <h2 className="trip-explore-dashboard__title">{destination}</h2>
                    <p className="trip-explore-dashboard__subtitle">
                        {travelDate ? `Main move • ${formatDate(travelDate)}` : 'Main move • ready to lock'}
                        {tripData.resolvedArrivalAirport ? ` • via ${tripData.resolvedArrivalAirport}` : ''}
                    </p>
                </div>
                <div className="trip-explore-dashboard__status-pill">
                    <span className="trip-explore-dashboard__status-dot" />
                    {status}
                </div>
            </header>

            {(isDegraded || warnings.length > 0) && (
                <div className="trip-explore-dashboard__warning-banner" role="status">
                    <strong>Orchestration status: {status}.</strong>
                    <div className="trip-explore-dashboard__warning-list">
                        {warnings.map((warning, index) => (
                            <span key={`${warning}-${index}`} className="trip-explore-dashboard__tiny-pill">
                                {warning}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            <div className="trip-explore-dashboard__tab-bar" role="tablist" aria-label="Trip views">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={activeTab === tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={
                            activeTab === tab.id
                                ? 'trip-explore-dashboard__tab trip-explore-dashboard__tab--active'
                                : 'trip-explore-dashboard__tab'
                        }
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {activeTab === 'overview' && <TripOverviewTab trip={tripData} />}
            {activeTab === 'flights' && <TripFlightsTab trip={tripData} />}
            {activeTab === 'stays' && <TripStaysTab trip={tripData} />}
        </section>
    );
};

export default TripExploreDashboard;
