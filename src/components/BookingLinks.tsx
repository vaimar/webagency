import React from 'react';
import { flightUrls } from '../services/affiliates';
import './BookingLinks.css';

interface BookingLinksProps {
    origin?: string | null;
    destination?: string | null;
    /** YYYY-MM-DD; passed through to the partner deep links. */
    date?: string | null;
    label?: string;
}

// Real partner deep-links so a surfaced flight can actually be booked. All work
// without affiliate IDs (they fall back to plain search URLs); if REACT_APP_*
// affiliate IDs are set, affiliates.ts appends them automatically.
const BookingLinks: React.FC<BookingLinksProps> = ({ origin, destination, date, label = 'Book' }) => {
    if (!origin || !destination) {
        return null;
    }

    const urls = flightUrls(origin.toUpperCase(), destination.toUpperCase(), date ?? '');
    const partners: Array<[string, string]> = [
        ['Ryanair', urls.ryanair],
        ['Google Flights', urls.googleFlights],
        ['Skyscanner', urls.skyscanner],
        ['Kiwi', urls.kiwi],
    ];

    return (
        <div className="booking-links">
            <span className="booking-links__label">{label}:</span>
            {partners.map(([name, href]) => (
                <a
                    key={name}
                    className="booking-links__link"
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    {name} ↗
                </a>
            ))}
        </div>
    );
};

export default BookingLinks;
