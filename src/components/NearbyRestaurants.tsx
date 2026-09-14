import {
    faArrowUpRightFromSquare,
    faBeerMugEmpty,
    faBurger,
    faClock,
    faLocationDot,
    faMugSaucer,
    faPersonWalking,
    faPhone,
    faUtensils,
} from '@fortawesome/free-solid-svg-icons';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React from 'react';
import { MapPoi } from '../services/mapMarkers';
import {
    cuisineList,
    distanceKm,
    formatDistance,
    placeFeatures,
    placeKind,
    placeMapUrl,
    walkMinutes,
} from '../services/poiFormat';
import OutboundLink from './OutboundLink';
import './NearbyRestaurants.css';

interface NearbyRestaurantsProps {
    restaurants: MapPoi[];
    /** The spot itself — distances are measured from here. */
    lat: number;
    lon: number;
    radiusKm: number;
    /** Where these links were clicked from, for the outbound funnel. */
    surface?: string;
}

/**
 * One icon per kind of place, because most of these cards carry nothing else.
 *
 * OSM records a name and an amenity for almost every entry and little more —
 * measured across the catalogue, cuisine, hours, phone and website are usually
 * all absent. With a single fork-and-knife glyph on every card the list read as
 * ten copies of one row; the amenity is the one distinguishing fact that is
 * reliably there, so it is the one the eye gets first.
 */
const KIND_ICON: Record<string, IconDefinition> = {
    cafe: faMugSaucer,
    fast_food: faBurger,
    bar: faBeerMugEmpty,
    pub: faBeerMugEmpty,
    restaurant: faUtensils,
};

const kindIcon = (amenity?: string | null): IconDefinition => (
    KIND_ICON[(amenity ?? '').toLowerCase()] ?? faUtensils
);

/** Drives the icon tint. Unknown amenities fall back to the restaurant colour. */
const kindSlug = (amenity?: string | null): string => {
    const key = (amenity ?? '').toLowerCase();
    return key in KIND_ICON ? key : 'restaurant';
};

/**
 * Placeholder cards, shaped like the real ones.
 *
 * The Overpass lookup behind this list takes five to eleven seconds cold. A
 * single grey sentence for that long reads as a page that has stopped working,
 * and when the cards finally arrive the panel jumps by several hundred pixels.
 *
 * Six of them, because the grid runs one, two or three columns depending on
 * width and six is the smallest count that fills whole rows in all three — four
 * left a single placeholder stranded on its own row at desktop width, which is
 * the ragged look the real cards were just fixed for.
 */
export const NearbyRestaurantsSkeleton: React.FC<{ count?: number }> = ({ count = 6 }) => (
    <ul className="poi-cards poi-cards--loading" aria-hidden="true">
        {Array.from({ length: count }, (unused, index) => (
            <li key={index} className="poi-card poi-card--skeleton">
                <div className="poi-card__head">
                    <span className="poi-card__icon poi-card__icon--skeleton" />
                    <div className="poi-card__title">
                        <span className="skeleton-bar skeleton-bar--title" />
                        <span className="skeleton-bar skeleton-bar--sub" />
                    </div>
                </div>
                <span className="skeleton-bar skeleton-bar--line" />
                <div className="poi-card__links poi-card__links--skeleton">
                    <span className="skeleton-bar skeleton-bar--pill" />
                    <span className="skeleton-bar skeleton-bar--pill" />
                </div>
            </li>
        ))}
    </ul>
);

/**
 * Places to eat near a spot.
 *
 * This was a bare list of names, each with a "View on map" link pointing at raw
 * coordinates — no cuisine, no hours, no way to tell one from another, and a
 * map link that landed on empty ground rather than the business. Everything
 * shown here was already arriving from Overpass and being discarded by the
 * parser.
 *
 * What is still missing is a RATING, and that is not an oversight: OSM records
 * facts, not opinions. Rather than invent a score, the card hands the reader to
 * the places that have real reviews — the restaurant's own site, and the map
 * listing — and says so plainly.
 */
const NearbyRestaurants: React.FC<NearbyRestaurantsProps> = ({
    restaurants, lat, lon, radiusKm, surface = 'spot-restaurants',
}) => {
    // Nearest first. Distance is the one thing that reliably decides whether a
    // place is worth walking to after a session, and it was not shown at all.
    const sorted = [...restaurants]
        .map((poi) => ({ poi, km: distanceKm(lat, lon, poi.lat, poi.lon) }))
        .sort((left, right) => left.km - right.km);

    return (
        <>
            <p className="sdp-tab-panel__meta">
                {restaurants.length} {restaurants.length === 1 ? 'place' : 'places'} to eat within {radiusKm} km,
                nearest first. Details come from OpenStreetMap, which records facts rather than
                reviews — so there are no ratings here. The links go where the reviews are.
            </p>

            <ul className="poi-cards">
                {sorted.map(({ poi, km }) => {
                    const cuisines = cuisineList(poi.cuisine);
                    const features = placeFeatures(poi);
                    const walk = walkMinutes(km);
                    return (
                        <li key={poi.id} className="poi-card">
                            <div className="poi-card__head">
                                <span
                                    className={`poi-card__icon poi-card__icon--${kindSlug(poi.amenity)}`}
                                    aria-hidden="true"
                                >
                                    <FontAwesomeIcon icon={kindIcon(poi.amenity)} />
                                </span>
                                <div className="poi-card__title">
                                    <h3 className="poi-card__name">{poi.name}</h3>
                                    <p className="poi-card__kind">
                                        {placeKind(poi.amenity)}
                                        {cuisines.length > 0 && ` · ${cuisines.join(', ')}`}
                                    </p>
                                </div>
                                <span className="poi-card__distance">
                                    <span
                                        className="poi-card__distance-value"
                                        title="Straight-line distance from the spot"
                                    >
                                        {formatDistance(km)}
                                    </span>
                                    {/* Past 3 km nobody is walking, so poiFormat
                                        returns nothing rather than a number that
                                        would only be read as a suggestion. */}
                                    {walk != null && (
                                        <span className="poi-card__walk">
                                            <FontAwesomeIcon icon={faPersonWalking} aria-hidden="true" />
                                            {walk} min
                                        </span>
                                    )}
                                </span>
                            </div>

                            {(poi.openingHours || poi.address) && (
                                <ul className="poi-card__facts">
                                    {poi.openingHours && (
                                        <li className="poi-card__fact">
                                            <FontAwesomeIcon
                                                className="poi-card__fact-icon"
                                                icon={faClock}
                                                aria-hidden="true"
                                            />
                                            {/* As OSM writes it. Reformatting risks changing what it means. */}
                                            <span>{poi.openingHours}</span>
                                        </li>
                                    )}
                                    {poi.address && (
                                        <li className="poi-card__fact">
                                            <FontAwesomeIcon
                                                className="poi-card__fact-icon"
                                                icon={faLocationDot}
                                                aria-hidden="true"
                                            />
                                            <span>{poi.address}</span>
                                        </li>
                                    )}
                                </ul>
                            )}

                            {features.length > 0 && (
                                <ul className="poi-card__features">
                                    {features.map((feature) => (
                                        <li key={feature} className="poi-card__feature">{feature}</li>
                                    ))}
                                </ul>
                            )}

                            <div className="poi-card__links">
                                {poi.website && (
                                    <OutboundLink
                                        className="poi-card__link poi-card__link--primary"
                                        href={poi.website}
                                        partner={poi.name}
                                        surface={surface}
                                    >
                                        Their website <FontAwesomeIcon icon={faArrowUpRightFromSquare} />
                                    </OutboundLink>
                                )}
                                <OutboundLink
                                    className="poi-card__link"
                                    href={placeMapUrl(poi)}
                                    partner="Google Maps"
                                    surface={surface}
                                >
                                    Map &amp; reviews <FontAwesomeIcon icon={faArrowUpRightFromSquare} />
                                </OutboundLink>
                                {poi.phone && (
                                    <a className="poi-card__link" href={`tel:${poi.phone.replace(/\s/g, '')}`}>
                                        <FontAwesomeIcon icon={faPhone} aria-hidden="true" /> {poi.phone}
                                    </a>
                                )}
                            </div>
                        </li>
                    );
                })}
            </ul>
        </>
    );
};

export default NearbyRestaurants;
