import React from 'react';
import { render, screen, within } from '@testing-library/react';
import SpotTariff, { PriceLine } from './SpotTariff';

const line = (overrides: Partial<PriceLine>): PriceLine => ({
    kind: 'HOUR',
    amount: 22,
    currency: 'EUR',
    durationMinutes: 60,
    perPerson: true,
    partySizeMin: null,
    partySizeMax: null,
    includesGear: null,
    tier: 'STANDARD',
    label: null,
    notes: null,
    confidence: 'STATED',
    perRiderAmount: 22,
    sourceUrl: null,
    observedAt: null,
    ...overrides,
});

describe('SpotTariff', () => {
    it('renders nothing when a park has no recorded prices', () => {
        const { container } = render(<SpotTariff prices={[]} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('shows the per-rider figure for a party rate, next to the price the park quotes', () => {
        // Crans-Montana: the cable for an hour, CHF 120, up to five riders. Both
        // numbers have to be visible — the 120 is what gets paid at the desk and
        // the 24 is what a rider compares against another park.
        render(<SpotTariff prices={[line({
            kind: 'GROUP_HIRE',
            amount: 120,
            currency: 'CHF',
            perPerson: false,
            partySizeMax: 5,
            perRiderAmount: 24,
            label: 'Location du câble 1h',
        })]} />);

        expect(screen.getByText('CHF 120')).toBeInTheDocument();
        expect(screen.getByText('CHF 24 each')).toBeInTheDocument();
        expect(screen.getByText('up to 5 riders')).toBeInTheDocument();
    });

    it('says a flat party rate cannot be divided rather than inventing a headcount', () => {
        // Delta hires the line at a flat 90 EUR "whatever the headcount".
        render(<SpotTariff prices={[line({
            kind: 'GROUP_HIRE',
            amount: 90,
            perPerson: false,
            partySizeMax: null,
            perRiderAmount: null,
            label: 'Privatisation 1h',
        })]} />);

        expect(screen.getByText('flat, any headcount')).toBeInTheDocument();
        expect(screen.queryByText(/each/)).not.toBeInTheDocument();
    });

    it('never derives a per-rider figure on a price that is already per person', () => {
        render(<SpotTariff prices={[line({ amount: 22, perRiderAmount: 22 })]} />);
        expect(screen.queryByText(/each/)).not.toBeInTheDocument();
    });

    it('separates party rates from per-person prices into their own group', () => {
        render(<SpotTariff prices={[
            line({ kind: 'SESSION', amount: 24, durationMinutes: 15, label: '1 séance' }),
            line({ kind: 'GROUP_HIRE', amount: 90, perPerson: false, perRiderAmount: null, label: 'Privatisation' }),
        ]} />);

        expect(screen.getByText('Riding time')).toBeInTheDocument();
        expect(screen.getByText('The whole line to yourselves')).toBeInTheDocument();
        expect(screen.getByText('One flat price for the party, not per rider.')).toBeInTheDocument();
    });

    it('marks whether gear is in the price, because it decides the real cost', () => {
        render(<SpotTariff prices={[
            line({ amount: 22, includesGear: true, label: 'Avec matériel' }),
            line({ amount: 25, includesGear: false, label: 'Sans matériel' }),
            line({ amount: 30, includesGear: null, label: 'Inconnu' }),
        ]} />);

        expect(screen.getByText('gear included')).toBeInTheDocument();
        expect(screen.getByText('gear extra')).toBeInTheDocument();
        // The unknown case asserts nothing at all rather than guessing either way.
        const rows = screen.getAllByRole('listitem');
        const unknown = rows.find((r) => within(r).queryByText('Inconnu'));
        expect(within(unknown!).queryByText(/gear/)).not.toBeInTheDocument();
    });

    it("labels a pack's minutes as a total so it does not read as one long session", () => {
        render(<SpotTariff prices={[line({
            kind: 'PACK', amount: 180, durationMinutes: 600, label: 'Carte 10 heures',
        })]} />);
        expect(screen.getByText('10 h total')).toBeInTheDocument();
    });

    it('writes durations the way a park prints them', () => {
        render(<SpotTariff prices={[
            line({ kind: 'SESSION', amount: 24, durationMinutes: 15, label: 'Quart d\'heure' }),
            line({ kind: 'GROUP_HIRE', amount: 135, durationMinutes: 90, perPerson: false, perRiderAmount: null, label: '1h30' }),
        ]} />);

        expect(screen.getByText('15 min')).toBeInTheDocument();
        expect(screen.getByText('1 h 30')).toBeInTheDocument();
        expect(screen.queryByText('1.5 h')).not.toBeInTheDocument();
    });

    it('puts a compulsory access band above the optional extras', () => {
        // Dock 5: you cannot reach the start pontoon without the 6 EUR band, so it
        // belongs beside the riding prices, not filed with gear you may decline.
        render(<SpotTariff prices={[
            line({ kind: 'GEAR_RENTAL', amount: 22, durationMinutes: null, label: 'Park Wakeboard' }),
            line({ kind: 'ACCESS_BAND', amount: 6, durationMinutes: null, label: 'RFID-Armband' }),
        ]} />);

        expect(screen.getByText('Before you can ride')).toBeInTheDocument();
        expect(screen.getByText('Compulsory, paid once.')).toBeInTheDocument();

        const groups = screen.getAllByRole('heading', { level: 4 }).map((h) => h.textContent);
        expect(groups.findIndex((t) => t?.startsWith('Before you can ride')))
            .toBeLessThan(groups.findIndex((t) => t?.startsWith('Gear')));
    });

    it('credits the tariff page it was read from and when', () => {
        render(<SpotTariff prices={[line({
            sourceUrl: 'https://www.lesokiri.com/teleski-nautique-pau/',
            observedAt: '2026-08-20T00:00:00Z',
        })]} />);

        expect(screen.getByRole('link', { name: /lesokiri\.com/ })).toHaveAttribute(
            'href', 'https://www.lesokiri.com/teleski-nautique-pau/');
        expect(screen.getByText(/20 Aug 2026/)).toBeInTheDocument();
    });
});
