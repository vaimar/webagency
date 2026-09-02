import React from 'react';
import { airlineBookingUrl, airlineName, isRyanairCode, operatorBrands } from '../data/airlines';
import { PlaceHint, flightUrls } from '../services/affiliates';
import OutboundLink from './OutboundLink';
import './BookingLinks.css';

interface BookingLinksProps {
    /** Screen this appeared on, so outbound clicks can be split by surface. */
    surface?: string;
    origin?: string | null;
    destination?: string | null;
    /** YYYY-MM-DD; passed through to the partner deep links. */
    date?: string | null;
    label?: string;
    /**
     * IATA codes operating this leg. Given them, the first link becomes the
     * airline that actually flies it. Omitted, the links stay as they were.
     */
    carriers?: string[] | null;
    /**
     * The leg's own clock times. With them the Kiwi link filters to the hour
     * this flight departs and lands, so it opens on this leg rather than every
     * flight the city pair sees that day.
     */
    departureTime?: string | null;
    arrivalTime?: string | null;
    /**
     * What the caller knows about these airports, for the ones the curated
     * metadata has never heard of. Without it a partner keyed on city names
     * silently loses its link at an uncurated hub.
     */
    originPlace?: PlaceHint | null;
    destinationPlace?: PlaceHint | null;
}

// Real partner deep-links so a surfaced flight can actually be booked. All work
// without affiliate IDs (they fall back to plain search URLs); if REACT_APP_*
// affiliate IDs are set, affiliates.ts appends them automatically.
const BookingLinks: React.FC<BookingLinksProps> = ({
    origin, destination, date, label = 'Book', surface = 'booking-links', carriers = null,
    departureTime = null, arrivalTime = null, originPlace = null, destinationPlace = null,
}) => {
    if (!origin || !destination) {
        return null;
    }

    const urls = flightUrls(
        origin.toUpperCase(),
        destination.toUpperCase(),
        date ?? '',
        { departureTime, arrivalTime },
        { origin: originPlace, destination: destinationPlace },
    );
    // An empty URL means the partner could not be addressed for this route —
    // Kiwi needs a city it knows, and a link to a dead search is worse than one
    // partner fewer.
    const aggregators: Array<[string, string]> = ([
        ['Google Flights', urls.googleFlights],
        ['Kiwi', urls.kiwi],
    ] as Array<[string, string]>).filter(([, href]) => href !== '');

    // Which airline's own site to lead with.
    //
    // Every leg used to lead with Ryanair, whoever was flying it — so a Vueling
    // hop out of Madrid sent people to Ryanair to search a route Ryanair does
    // not fly. The Ryanair deep link is only right when Ryanair is the operator;
    // for anyone else it is their own front door, and for a carrier we hold no
    // site for it is no airline link at all, because a wrong one is worse than
    // none. With no carriers named we cannot know, so nothing changes.
    //
    // ONE brand only. A merged flight lists every marketing carrier on it, in no
    // meaningful order — Madrid–Málaga comes through as "Azul · Aeroméxico · ITA
    // · Etihad · SAS · Air Europa", where only the last one flies it and the
    // first is simply alphabetical. Picking one of those is a coin flip, so a
    // codeshare gets the aggregators alone; they resolve the operator properly.
    const brands = operatorBrands(carriers);
    const operator = brands.length === 1 ? brands[0] : null;
    const airlineLink: [string, string] | null = (() => {
        if (!operator) {
            return carriers === null ? ['Ryanair', urls.ryanair] : null;
        }
        if (isRyanairCode(operator.code)) {
            return ['Ryanair', urls.ryanair];
        }
        const site = airlineBookingUrl(operator.code, origin, destination, date);
        return site ? [airlineName(operator.code), site] : null;
    })();

    const partners: Array<[string, string]> = airlineLink ? [airlineLink, ...aggregators] : aggregators;

    return (
        <div className="booking-links">
            <span className="booking-links__label">{label}:</span>
            {partners.map(([name, href]) => (
                <OutboundLink
                    key={name}
                    className="booking-links__link"
                    href={href}
                    partner={name}
                    surface={surface}
                    origin={origin}
                    destination={destination}
                >
                    {name} ↗
                </OutboundLink>
            ))}
            <span className="booking-links__disclaimer">Prices on partner sites may differ</span>
        </div>
    );
};

export default BookingLinks;
