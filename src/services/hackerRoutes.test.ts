import { vi } from 'vitest';
import { fetchHackerRoutePrice, fetchLegPrice } from './hackerRoutes';
import { HackerItinerary } from './hackerRoutes';

const priced = {
    ok: true,
    json: async () => ({
        leg1: { origin: 'MAD', destination: 'IBZ', price: 34.78, departure: '2026-09-27T17:15:00' },
        leg2: null,
        combinedPrice: 34.78,
        currency: 'EUR',
        status: 'PRICED',
    }),
};

const bodyOf = (): Record<string, unknown> => JSON.parse(
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body,
);

describe('fetch-price requests', () => {
    beforeEach(() => {
        global.fetch = vi.fn(async () => priced) as unknown as typeof fetch;
    });

    it('names the departure it wants priced, not just the route and day', async () => {
        // Ryanair's daily feed returns the CHEAPEST fare of the day, so a route
        // it flies twice would price both flights at the cheaper one's fare.
        // The clock is what makes the answer belong to this flight.
        await fetchLegPrice('MAD', 'IBZ', ['FR'], '2026-09-27', '17:15');

        expect(bodyOf()).toMatchObject({
            leg1Origin: 'MAD',
            leg1Destination: 'IBZ',
            leg1DepartureTime: '17:15',
            date: '2026-09-27',
        });
    });

    it('sends no clock when there is none to send, and the day answers instead', async () => {
        await fetchLegPrice('MAD', 'IBZ', ['FR'], '2026-09-27');

        expect(bodyOf().leg1DepartureTime).toBeNull();
    });

    it('sends both clocks for a self-transfer — two tickets, two departures', async () => {
        const itinerary: HackerItinerary = {
            type: 'SELF_TRANSFER',
            origin: 'SNN',
            hub: 'STN',
            destination: 'AGP',
            leg1: { airlineCodes: ['FR'], origin: 'SNN', destination: 'STN', departureTime: '19:00:00', arrivalTime: '20:30:00' },
            leg2: { airlineCodes: ['FR'], origin: 'STN', destination: 'AGP', departureTime: '06:35:00', arrivalTime: '10:30:00' },
            layoverMinutes: 605,
            totalJourneyMinutes: 870,
            status: 'SCHEDULE_ONLY',
        };

        await fetchHackerRoutePrice(itinerary, '2026-09-06');

        // Seconds trimmed: the API takes HH:mm.
        expect(bodyOf()).toMatchObject({ leg1DepartureTime: '19:00', leg2DepartureTime: '06:35' });
    });
});
