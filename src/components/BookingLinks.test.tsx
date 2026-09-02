import React from 'react';
import { render, screen } from '@testing-library/react';
import BookingLinks from './BookingLinks';

const linkNames = (): string[] => screen.getAllByRole('link').map((a) => a.textContent?.replace(' ↗', '') ?? '');
const hrefOf = (name: RegExp): string => (
    screen.getByRole('link', { name }).getAttribute('href') ?? ''
);

describe('BookingLinks', () => {
    it('does not offer Skyscanner, which answers every deep link with a bot check', () => {
        render(<BookingLinks origin="SNN" destination="AGP" date="2026-09-11" carriers={['FR']} />);

        expect(screen.queryByRole('link', { name: /Skyscanner/ })).not.toBeInTheDocument();
    });

    it('leads with Ryanair when Ryanair is the operator', () => {
        render(<BookingLinks origin="SNN" destination="STN" date="2026-09-11" carriers={['FR']} />);

        expect(linkNames()).toEqual(['Ryanair', 'Google Flights', 'Kiwi']);
        expect(hrefOf(/Ryanair/)).toContain('ryanair.com');
        expect(hrefOf(/Ryanair/)).toContain('originIata=SNN');
    });

    it('leads with the airline that actually flies the leg', () => {
        render(<BookingLinks origin="BCN" destination="AGP" date="2026-09-11" carriers={['VY']} />);

        // The bug this covers: every leg used to offer a Ryanair search, for
        // routes Ryanair does not fly.
        expect(linkNames()).toEqual(['Vueling', 'Google Flights', 'Kiwi']);
        expect(screen.queryByRole('link', { name: /Ryanair/ })).not.toBeInTheDocument();
        expect(hrefOf(/Vueling/)).toBe('https://www.vueling.com/');
    });

    it('names no airline for a codeshare, where the operator is a guess', () => {
        // Madrid–Málaga arrives as an alphabetical list of marketing carriers.
        // Only Air Europa flies it; Azul and SAS are simply first in the alphabet.
        render(<BookingLinks origin="MAD" destination="AGP" date="2026-09-11" carriers={['AD', 'AM', 'SK', 'UX']} />);

        expect(linkNames()).toEqual(['Google Flights', 'Kiwi']);
        expect(screen.queryByRole('link', { name: /SAS/ })).not.toBeInTheDocument();
    });

    it('deep-links straight into the airline search where the format is known', () => {
        render(<BookingLinks origin="SNN" destination="CDG" date="2026-09-10" carriers={['EI']} />);

        const href = hrefOf(/Aer Lingus/);
        expect(href).toContain('aerlingus.com/app/make/flight-search-result');
        expect(href).toContain('sourceAirportCode_0=SNN');
        expect(href).toContain('destinationAirportCode_0=CDG');
        expect(href).toContain('departureDate_0=2026-09-10');
    });

    it('falls back to the airline homepage when there is no date to search on', () => {
        // A search URL with no date in it is not a search.
        render(<BookingLinks origin="SNN" destination="CDG" carriers={['EI']} />);

        expect(hrefOf(/Aer Lingus/)).toBe('https://www.aerlingus.com/');
    });

    it('offers no airline link at all for a carrier it has no site for', () => {
        render(<BookingLinks origin="MAD" destination="AGP" date="2026-09-11" carriers={['ZZ']} />);

        // A wrong airline link is worse than none — the aggregators still carry
        // the exact route and date.
        expect(linkNames()).toEqual(['Google Flights', 'Kiwi']);
    });

    it('collapses codeshare codes to the one operating airline', () => {
        render(<BookingLinks origin="LGW" destination="AGP" date="2026-09-11" carriers={['EZY', 'U2']} />);

        expect(linkNames()).toEqual(['easyJet', 'Google Flights', 'Kiwi']);
    });

    it('keeps its previous behaviour when no carrier is named', () => {
        // Other surfaces pass no carriers and must not change.
        render(<BookingLinks origin="SNN" destination="AGP" date="2026-09-11" />);

        expect(linkNames()).toEqual(['Ryanair', 'Google Flights', 'Kiwi']);
    });
});
