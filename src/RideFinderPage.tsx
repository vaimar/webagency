// Ride Finder route.
//
// Wires the deterministic search path to the real app: profile preferences in,
// RideFinder out. No model is involved anywhere on this route — there is no
// parser wired, so nothing here calls /api/ai/*. The only network traffic is
// POST /api/trips/explore, issued by the fan-out.
//
// The catalogue banner is deliberate. Surface, beginner and warmth filters
// cannot return anything until a human verifies those facts per venue, and
// that state should be visible in the product rather than looking like a bug.

import React from 'react';
import RideFinder from './components/RideFinder';
import { useProfile } from './ProfileContext';
import { getCoverage, LAUNCH_CRITICAL_FACTS, RIDE_SPOTS } from './data/rideSpots';

const CatalogueBanner: React.FC = () => {
    const coverage = getCoverage();
    if (coverage.launchReady === coverage.totalSpots) {
        return null;
    }

    const unverified = LAUNCH_CRITICAL_FACTS.filter((field) => coverage.byField[field] === 0);

    return (
        <div className="ride-finder__notice ride-finder__notice--warn" role="status">
            <p>
                <strong>
                    {coverage.launchReady} of {coverage.totalSpots} venues have verified facts.
                </strong>{' '}
                Filtering by{' '}
                {unverified.length > 0 ? unverified.join(', ') : 'some venue facts'}{' '}
                will return nothing until a curator fills them in — we hide venues we cannot
                vouch for rather than guessing.
            </p>
            <p style={{ marginTop: 6, fontSize: '.85em', opacity: .8 }}>
                Flights, prices and transfers are unaffected — those come from the backend.
            </p>
        </div>
    );
};

const RideFinderPage: React.FC = () => {
    const { profile } = useProfile();

    return (
        <div className="stack-xl">
            <section className="card" style={{ padding: 24 }}>
                <p className="eyebrow">Ride Finder · preview</p>
                <h1 style={{ marginTop: 4 }}>Describe the trip. We search what we can back.</h1>
                <p style={{ color: 'var(--text-secondary, #475569)', maxWidth: '62ch', marginTop: 8 }}>
                    Every option below is a real backend result. Nothing is written by a model —
                    prices, routes and transfers come straight from the trip search, and a venue
                    we cannot verify is hidden rather than guessed at.
                </p>
            </section>

            <CatalogueBanner />

            <section className="card" style={{ padding: 24 }}>
                <RideFinder
                    profileContext={{ profile }}
                    spots={RIDE_SPOTS}
                    firstMileMode="public_transport"
                />
            </section>
        </div>
    );
};

export default RideFinderPage;
