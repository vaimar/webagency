import { FlightAvailable } from './api';
import { HackerItinerary } from './hackerRoutes';
import {
    FlightSortKey,
    clockMinutes,
    compareUnknownsLast,
    hasKnownPrice,
    sortCachedFares,
    sortHackerRows,
} from './hackFlightSort';

const fare = (over: Partial<FlightAvailable>): FlightAvailable => ({
    origin: 'SNN',
    destination: 'AGP',
    price: 100,
    ...over,
});

const itinerary = (over: Partial<HackerItinerary>): HackerItinerary => ({
    type: 'DIRECT',
    origin: 'SNN',
    hub: null,
    destination: 'AGP',
    leg1: { origin: 'SNN', destination: 'AGP', departureTime: '10:00', arrivalTime: '13:00' },
    leg2: null,
    layoverMinutes: 0,
    totalJourneyMinutes: 180,
    status: 'OK',
    ...over,
});

const codes = (flights: FlightAvailable[]): string[] => flights.map((flight) => String(flight.flightNumber));
const hubs = (rows: { itinerary: HackerItinerary }[]): string[] => rows.map((row) => row.itinerary.hub ?? 'direct');

describe('compareUnknownsLast', () => {
    it('orders ascending and sinks unknowns', () => {
        expect([3, null, 1].sort(compareUnknownsLast)).toEqual([1, 3, null]);
    });
});

describe('clockMinutes', () => {
    it('reads bare clock times and ISO stamps alike', () => {
        expect(clockMinutes('07:15')).toBe(435);
        expect(clockMinutes('07:15:00')).toBe(435);
        expect(clockMinutes('2026-09-06T21:40:00')).toBe(1300);
        expect(clockMinutes(undefined)).toBeNull();
        expect(clockMinutes('nonsense')).toBeNull();
    });
});

describe('sortCachedFares', () => {
    const cheap = fare({ flightNumber: 'cheap', price: 40, departureDate: '2026-09-06T18:00:00', arrivalDate: '2026-09-06T22:30:00' });
    const early = fare({ flightNumber: 'early', price: 90, departureDate: '2026-09-06T06:30:00', arrivalDate: '2026-09-06T10:00:00' });
    const quick = fare({ flightNumber: 'quick', price: 120, departureDate: '2026-09-06T12:00:00', arrivalDate: '2026-09-06T14:15:00' });
    const flights = [quick, cheap, early];

    it('ranks by the honest price', () => {
        expect(codes(sortCachedFares(flights, 'cheapest'))).toEqual(['cheap', 'early', 'quick']);
    });

    it('ranks by take-off time', () => {
        expect(codes(sortCachedFares(flights, 'departure'))).toEqual(['early', 'quick', 'cheap']);
    });

    it('ranks by landing time', () => {
        expect(codes(sortCachedFares(flights, 'arrival'))).toEqual(['early', 'quick', 'cheap']);
    });

    it('ranks by journey length', () => {
        expect(codes(sortCachedFares(flights, 'duration'))).toEqual(['quick', 'early', 'cheap']);
    });

    it('keeps fares with no arrival stamp below the ones that have it', () => {
        const unknown = fare({ flightNumber: 'unknown', price: 10, departureDate: '2026-09-06T05:00:00' });
        expect(codes(sortCachedFares([unknown, early], 'arrival'))).toEqual(['early', 'unknown']);
    });

    it('does not mutate the input', () => {
        const input = [...flights];
        sortCachedFares(input, 'departure');
        expect(codes(input)).toEqual(['quick', 'cheap', 'early']);
    });
});

describe('sortHackerRows', () => {
    const direct = { itinerary: itinerary({ hub: null }), price: 180 };
    const viaStn = {
        itinerary: itinerary({
            type: 'SELF_TRANSFER',
            hub: 'STN',
            leg1: { origin: 'SNN', destination: 'STN', departureTime: '06:00', arrivalTime: '07:15' },
            leg2: { origin: 'STN', destination: 'AGP', departureTime: '09:00', arrivalTime: '12:40' },
            layoverMinutes: 105,
            totalJourneyMinutes: 400,
        }),
        price: 95,
    };
    const viaBcn = {
        itinerary: itinerary({
            type: 'SELF_TRANSFER',
            hub: 'BCN',
            leg1: { origin: 'SNN', destination: 'BCN', departureTime: '14:00', arrivalTime: '17:30' },
            leg2: { origin: 'BCN', destination: 'AGP', departureTime: '20:00', arrivalTime: '21:30' },
            layoverMinutes: 150,
            totalJourneyMinutes: 450,
        }),
        price: null,
    };
    const rows = [direct, viaBcn, viaStn];

    const order = (key: FlightSortKey): string[] => hubs(sortHackerRows(rows, key));

    it('ranks priced routes cheapest-first and leaves unpriced ones last', () => {
        expect(order('cheapest')).toEqual(['STN', 'direct', 'BCN']);
    });

    it('ranks by take-off, landing and journey length', () => {
        expect(order('departure')).toEqual(['STN', 'direct', 'BCN']);
        // STN lands 12:40 (06:00 + 6h40), the direct one 13:00 — earliest landing wins
        // even though the direct flight is the shortest hop.
        expect(order('arrival')).toEqual(['STN', 'direct', 'BCN']);
        expect(order('duration')).toEqual(['direct', 'STN', 'BCN']);
    });

    it('lands a past-midnight self-transfer after an evening arrival, not before it', () => {
        const redEye = {
            itinerary: itinerary({
                type: 'SELF_TRANSFER',
                hub: 'CRL',
                leg1: { origin: 'SNN', destination: 'CRL', departureTime: '19:00', arrivalTime: '22:10' },
                // Lands 00:45 the next day — a raw clock sort would call this the earliest landing of the day.
                leg2: { origin: 'CRL', destination: 'AGP', departureTime: '23:00', arrivalTime: '00:45' },
                layoverMinutes: 50,
                totalJourneyMinutes: 405,
            }),
            price: null,
        };
        expect(hubs(sortHackerRows([redEye, viaBcn], 'arrival'))).toEqual(['BCN', 'CRL']);
    });
});

describe('hasKnownPrice', () => {
    it('is false until a card has fetched a live fare', () => {
        expect(hasKnownPrice([{ itinerary: itinerary({}), price: null }])).toBe(false);
        expect(hasKnownPrice([{ itinerary: itinerary({}), price: 88 }])).toBe(true);
    });
});
