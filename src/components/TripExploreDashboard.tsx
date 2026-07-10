import React, { useCallback, useEffect, useState } from 'react';
import {
    formatDate,
    getActivityPois,
    getFlightRows,
    getOrchestrationStatus,
    getRestaurantPois,
    getWarningText,
    humanizeOrchestrationStatus,
    isDegradedResponse,
} from '../services/tripExploreSelectors';
import { AiTripGuide, fetchAiTripGuide } from '../services/aiTripGuide';
import { fetchSelfConnect, SelfConnectResult } from '../services/selfConnect';
import { HotelResult, TripExplorationResponse, UnifiedFlightOption } from '../types/tripExploration';
import TripAiGuideTab, { AiGuideStatus } from './TripAiGuideTab';
import TripSelfConnectTab, { SelfConnectStatus } from './TripSelfConnectTab';
import TripFlightsTab from './TripFlightsTab';
import TripOverviewTab from './TripOverviewTab';
import TripPoiTab from './TripPoiTab';
import TripStaysTab from './TripStaysTab';
import TripVerdictCard from './TripVerdictCard';
import './TripExploreDashboard.css';

// Lazy — keeps the heavy maplibre-gl (pure ESM) bundle out of the initial
// load and out of the Jest module graph until the Map tab is opened.
const TripMapTab = React.lazy(() => import('./TripMapTab'));

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
    /** Direct /api/hotels/nearby results filling the stays gap when the
     *  backend has no city coordinates for this destination. */
    extraStays?: HotelResult[];
    /** Activity that produced this result (from the request) — feeds the AI guide. */
    activity?: string | null;
    /** Trip length in nights — drives parking and stay/food totals. */
    nights?: number;
    /** True when the traveller drives to the airport (rental_car first mile). */
    driveMode?: boolean;
}

/** The user's flight pick: row key + the underlying option it promotes. */
export interface SelectedFlight {
    key: string;
    option: UnifiedFlightOption;
}

type DashboardTab = 'overview' | 'flights' | 'stays' | 'activities' | 'restaurants' | 'map' | 'selfConnect' | 'aiGuide';

// Shell component: header, orchestration status, and tab navigation. Each tab
// is an isolated read-only projection of the same untruncated payload — the
// dashboard never re-shapes tripData, so nothing is lost between views.
const TripExploreDashboard: React.FC<TripExploreDashboardProps> = ({ tripData, extraStays = [], activity, nights, driveMode }) => {
    const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
    const [selectedFlight, setSelectedFlight] = useState<SelectedFlight | null>(null);
    const [aiGuide, setAiGuide] = useState<AiTripGuide | null>(null);
    const [aiStatus, setAiStatus] = useState<AiGuideStatus>('idle');
    const [selfConnect, setSelfConnect] = useState<SelfConnectResult | null>(null);
    const [scStatus, setScStatus] = useState<SelfConnectStatus>('idle');

    // A new exploration invalidates the previous flight pick, AI guide and routing.
    useEffect(() => {
        setSelectedFlight(null);
        setAiGuide(null);
        setAiStatus('idle');
        setSelfConnect(null);
        setScStatus('idle');
    }, [tripData]);

    const destinationName = tripData.destination ?? '';

    // Lazy — only fetch the AI guide when the tab is actually opened, and only once.
    const loadAiGuide = useCallback(async () => {
        if (!destinationName) {
            return;
        }
        setAiStatus('loading');
        try {
            const guide = await fetchAiTripGuide(destinationName, activity);
            setAiGuide(guide);
            setAiStatus('done');
        } catch {
            setAiStatus('error');
        }
    }, [destinationName, activity]);

    const openAiGuide = useCallback(() => {
        setActiveTab('aiGuide');
        if (aiStatus === 'idle') {
            void loadAiGuide();
        }
    }, [aiStatus, loadAiGuide]);

    // Self-transfer routing — needs the resolved origin + arrival airports.
    const scOrigin = tripData.originAirport ?? '';
    const scDestination = tripData.resolvedArrivalAirport ?? '';
    const loadSelfConnect = useCallback(async () => {
        if (!scOrigin || !scDestination) {
            return;
        }
        setScStatus('loading');
        try {
            const found = await fetchSelfConnect(scOrigin, scDestination, tripData.travelDate ?? undefined);
            setSelfConnect(found);
            setScStatus('done');
        } catch {
            setScStatus('error');
        }
    }, [scOrigin, scDestination, tripData.travelDate]);

    const openSelfConnect = useCallback(() => {
        setActiveTab('selfConnect');
        if (scStatus === 'idle') {
            void loadSelfConnect();
        }
    }, [scStatus, loadSelfConnect]);

    const destination = tripData.destination ?? 'Your next drop';
    const travelDate = tripData.travelDate;
    const status = humanizeOrchestrationStatus(getOrchestrationStatus(tripData));
    const isDegraded = isDegradedResponse(tripData);
    const warnings = Array.from(new Set(
        (tripData.orchestrationWarnings ?? [])
            .map((warning) => getWarningText(warning))
            .filter((warning) => warning.trim().length > 0),
    ));

    const flightRows = getFlightRows(tripData);
    const flightCount = flightRows.length;
    // No flight data at all → the no-flight state in the overview says it best;
    // a verdict card with nothing to verdict would just be noise.
    const showVerdict = flightCount > 0 || Boolean(tripData.bestUnifiedFlight);
    const staysCount = tripData.hiddenGemHotels?.length || extraStays.length;
    const activities = getActivityPois(tripData);
    const restaurants = getRestaurantPois(tripData);

    const tabs: Array<{ id: DashboardTab; label: string }> = [
        { id: 'overview', label: 'Overview' },
        { id: 'flights', label: `Flights (${flightCount})` },
        { id: 'stays', label: `Stays (${staysCount})` },
        { id: 'activities', label: `Activities (${activities.length})` },
        { id: 'restaurants', label: `Restaurants (${restaurants.length})` },
        { id: 'map', label: '🗺 Map' },
        { id: 'selfConnect', label: '🔀 Self-transfer' },
        { id: 'aiGuide', label: '✨ AI Guide' },
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

            {showVerdict && (
                <TripVerdictCard
                    trip={tripData}
                    selectedFlight={selectedFlight?.option ?? null}
                    nights={nights}
                    driveMode={driveMode}
                    extraStays={extraStays}
                    selfConnect={selfConnect}
                    selfConnectStatus={scStatus}
                    onJumpToTab={(tab) => {
                        if (tab === 'selfConnect') {
                            openSelfConnect();
                        } else {
                            setActiveTab(tab);
                        }
                    }}
                    onCheckSelfTransfer={loadSelfConnect}
                />
            )}

            <div className="trip-explore-dashboard__tab-bar" role="tablist" aria-label="Trip views">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={activeTab === tab.id}
                        onClick={() => {
                            if (tab.id === 'aiGuide') {
                                openAiGuide();
                            } else if (tab.id === 'selfConnect') {
                                openSelfConnect();
                            } else {
                                setActiveTab(tab.id);
                            }
                        }}
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

            {activeTab === 'overview' && (
                <TripOverviewTab
                    trip={tripData}
                    selectedFlight={selectedFlight?.option ?? null}
                    nights={nights}
                    driveMode={driveMode}
                />
            )}
            {activeTab === 'flights' && (
                <TripFlightsTab
                    trip={tripData}
                    selectedFlightKey={selectedFlight?.key ?? null}
                    onSelectFlight={setSelectedFlight}
                />
            )}
            {activeTab === 'stays' && <TripStaysTab trip={tripData} extraStays={extraStays} />}
            {activeTab === 'activities' && (
                <TripPoiTab
                    eyebrow="Plan de ouf"
                    title="Things to do nearby"
                    badgeNoun="spots"
                    emptyText="No activity spots were returned for this destination."
                    pois={activities}
                />
            )}
            {activeTab === 'restaurants' && (
                <TripPoiTab
                    eyebrow="Where to eat"
                    title="Dining nearby"
                    badgeNoun="places"
                    emptyText="No dining spots were returned for this destination."
                    pois={restaurants}
                />
            )}
            {activeTab === 'map' && (
                <React.Suspense
                    fallback={(
                        <article className="trip-explore-dashboard__card">
                            <p className="trip-explore-dashboard__muted">Loading map…</p>
                        </article>
                    )}
                >
                    <TripMapTab trip={tripData} extraStays={extraStays} />
                </React.Suspense>
            )}
            {activeTab === 'selfConnect' && (
                <TripSelfConnectTab status={scStatus} result={selfConnect} onRetry={loadSelfConnect} />
            )}
            {activeTab === 'aiGuide' && (
                <TripAiGuideTab status={aiStatus} guide={aiGuide} onRetry={loadAiGuide} />
            )}
        </section>
    );
};

export default TripExploreDashboard;
