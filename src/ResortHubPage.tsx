import React, { useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import LowCrowdWindows from './components/LowCrowdWindows';
import ResortCostSummary from './components/ResortCostSummary';
import ResortVendors from './components/ResortVendors';
import { monthSearchRange } from './services/skiWindows';
import './ResortHubPage.css';

type Section = 'when' | 'eat';

/**
 * Everything known about one resort, in one place: when to go, and what it costs
 * once you are there.
 *
 * <p>Deliberately two tabs over one long scroll. The two halves answer different
 * questions asked at different times — "which week" is decided months ahead and
 * once, "where do we eat" is browsed repeatedly — and stacking them buries
 * whichever one you did not come for.
 *
 * <p>The month defaults to March 2027 because that is the trip this was built
 * for; {@code ?year=&month=} moves it without touching code.
 */
const ResortHubPage: React.FC = () => {
    const { slug } = useParams<{ slug: string }>();
    const [params] = useSearchParams();
    const [section, setSection] = useState<Section>((params.get('tab') as Section) ?? 'when');

    const resort = slug ?? 'la-clusaz';
    /**
     * The trip actually being planned. Overridable with ?tripStart=, but it
     * defaults to the chosen week rather than to "this month" — a planner that
     * forgets which week you picked makes you re-pick it on every visit.
     */
    const tripStart = params.get('tripStart') ?? '2027-03-06';
    const tripEnd = params.get('tripEnd') ?? '2027-03-13';
    const year = Number.parseInt(params.get('year') ?? '2027', 10);
    const month = Number.parseInt(params.get('month') ?? '3', 10);
    const partySize = Number.parseInt(params.get('party') ?? '2', 10);

    const range = useMemo(() => {
        const safeYear = Number.isFinite(year) ? year : 2027;
        const safeMonth = Number.isFinite(month) && month >= 1 && month <= 12 ? month : 3;
        return monthSearchRange(safeYear, safeMonth);
    }, [year, month]);

    const party = Number.isFinite(partySize) && partySize > 0 ? partySize : 2;

    return (
        <div className="resort-hub">
            <ResortCostSummary
                resort={resort}
                partySize={party}
                tripStart={tripStart}
                tripEnd={tripEnd}
                onOpenDetail={() => setSection('eat')}
            />

            <nav className="resort-hub__tabs" aria-label="Resort sections">
                <button
                    type="button"
                    className={`resort-hub__tab ${section === 'when' ? 'resort-hub__tab--active' : ''}`.trim()}
                    onClick={() => setSection('when')}
                >
                    When to go
                </button>
                <button
                    type="button"
                    className={`resort-hub__tab ${section === 'eat' ? 'resort-hub__tab--active' : ''}`.trim()}
                    onClick={() => setSection('eat')}
                >
                    Prices &amp; menus
                </button>
            </nav>

            {section === 'when' ? (
                <LowCrowdWindows
                    resort={resort}
                    highlightWeekStart={tripStart}
                    from={params.get('from') ?? range.from}
                    to={params.get('to') ?? range.to}
                    homeCalendar={params.get('homeCalendar') ?? 'IE-NATIONAL'}
                />
            ) : (
                <div className="resort-hub__panel">
                    <ResortVendors resort={resort} partySize={party} />
                </div>
            )}
        </div>
    );
};

export default ResortHubPage;
