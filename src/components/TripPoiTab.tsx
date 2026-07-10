import React from 'react';
import { formatKm, getPoiCategory } from '../services/tripExploreSelectors';
import { ActivityPlace } from '../types/tripExploration';

interface TripPoiTabProps {
    eyebrow: string;
    title: string;
    badgeNoun: string;
    emptyText: string;
    pois: ActivityPlace[];
}

// Shared presentational tab for OpenTripMap points of interest — used for both
// the Activities and Restaurants views. Renders nothing it cannot verify:
// a POI with no readable category or distance simply shows its name.
const TripPoiTab: React.FC<TripPoiTabProps> = ({ eyebrow, title, badgeNoun, emptyText, pois }) => (
    <article className="trip-explore-dashboard__card trip-explore-dashboard__card--hotels">
        <div className="trip-explore-dashboard__card-top">
            <div>
                <p className="trip-explore-dashboard__label">{eyebrow}</p>
                <h3 className="trip-explore-dashboard__card-title">{title}</h3>
            </div>
            {pois.length > 0 ? (
                <span className="trip-explore-dashboard__badge trip-explore-dashboard__badge--accent">
                    {pois.length} {badgeNoun}
                </span>
            ) : (
                <span className="trip-explore-dashboard__badge trip-explore-dashboard__badge--warn">
                    None nearby
                </span>
            )}
        </div>

        {pois.length === 0 ? (
            <p className="trip-explore-dashboard__muted" role="status">{emptyText}</p>
        ) : (
            <div className="trip-explore-dashboard__stays-grid">
                {pois.map((poi, index) => {
                    const category = getPoiCategory(poi.kinds);
                    const distance = formatKm(poi.distanceKm ?? null);

                    return (
                        <div key={`${poi.xid ?? poi.name}-${index}`} className="trip-explore-dashboard__hotel-card">
                            <div className="trip-explore-dashboard__hotel-main">
                                <div>
                                    <h4 className="trip-explore-dashboard__hotel-name">{poi.name}</h4>
                                    {(category || distance) && (
                                        <div className="trip-explore-dashboard__hotel-meta">
                                            {category && (
                                                <span className="trip-explore-dashboard__hotel-rating">{category}</span>
                                            )}
                                            {distance && (
                                                <span className="trip-explore-dashboard__hotel-distance">{distance}</span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        )}
    </article>
);

export default TripPoiTab;
