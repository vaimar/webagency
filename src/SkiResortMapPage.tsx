import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import SkiResortMap from './components/SkiResortMap';
import './components/SkiResortMap.css';
import { SkiMapLayerData, loadSkiMap } from './services/skiMap';
import { getResortProfiles } from './services/api';

export default function SkiResortMapPage() {
    const [data, setData] = useState<SkiMapLayerData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [plannerSlugs, setPlannerSlugs] = useState<string[]>([]);

    // A missing profile list is not an error: the map is fully usable without
    // planner links, so this degrades to no links rather than an alert.
    useEffect(() => {
        let alive = true;
        getResortProfiles()
            .then(({ resorts }) => {
                if (alive) setPlannerSlugs(resorts.map((r) => r.slug));
            })
            .catch(() => undefined);
        return () => {
            alive = false;
        };
    }, []);

    useEffect(() => {
        let alive = true;

        loadSkiMap()
            .then((layerData) => {
                if (alive) {
                    setData(layerData);
                }
            })
            .catch((reason: unknown) => {
                if (!alive) return;
                const message = reason instanceof Error ? reason.message : 'Unable to load ski map data.';
                setError(message);
            });

        return () => {
            alive = false;
        };
    }, []);

    return (
        <section>
            <header className="page-head">
                <span className="page-head__eyebrow">Ski inventory</span>
                <h1 className="page-head__title">Ski resort map</h1>
                <p className="page-head__lead">
                    The resort catalog stays on the map, and the hotel catalog can be switched on as a grouped
                    overlay by resort key. No bundled checkout, just the terrain and the offers.
                </p>
                <p className="page-head__lead">
                    Working out <em>when</em> rather than where?{' '}
                    <Link to="/resorts/la-clusaz">Open the La Clusaz planner</Link> — low-crowd weeks ranked against
                    French and Irish school-holiday calendars, plus menus and hire rates for the resort.
                </p>
            </header>

            {error ? (
                <p className="ski-resort-map__alert" role="alert">
                    {error}
                </p>
            ) : data ? (
                <SkiResortMap data={data} plannerSlugs={plannerSlugs} />
            ) : (
                <p className="ski-resort-map__note" role="status">
                    Loading ski map data...
                </p>
            )}
        </section>
    );
}
