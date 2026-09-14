import {
    CartEstimate,
    amountOf,
    buildCartFlight,
    cartTotals,
    clearCart,
    flightFor,
    loadCart,
    markBooked,
    recordPaid,
    removeFlight,
    selectFlight,
} from './flightCart';
import { HackerItinerary } from './hackerRoutes';

const direct: HackerItinerary = {
    type: 'DIRECT',
    origin: 'SNN',
    hub: null,
    destination: 'AGP',
    leg1: {
        airlineCodes: ['FR'],
        origin: 'SNN',
        destination: 'AGP',
        departureTime: '07:15',
        arrivalTime: '11:20',
    },
    leg2: null,
    layoverMinutes: 0,
    totalJourneyMinutes: 245,
    status: 'SCHEDULE_ONLY',
};

// SNN 19:00 → STN 20:30, then STN 06:35 → AGP 10:30 the NEXT morning.
const overnight: HackerItinerary = {
    type: 'SELF_TRANSFER',
    origin: 'SNN',
    hub: 'STN',
    destination: 'AGP',
    leg1: { airlineCodes: ['FR'], origin: 'SNN', destination: 'STN', departureTime: '19:00', arrivalTime: '20:30' },
    leg2: { airlineCodes: ['U2'], origin: 'STN', destination: 'AGP', departureTime: '06:35', arrivalTime: '10:30' },
    layoverMinutes: 605,
    totalJourneyMinutes: 870,
    status: 'SCHEDULE_ONLY',
};

const exact = (fare: number, honest?: number): CartEstimate => ({
    fare,
    honest: honest ?? null,
    basis: 'exact',
});

const floor = (fare: number): CartEstimate => ({ fare, honest: null, basis: 'floor' });
const unpriced: CartEstimate = { fare: null, honest: null, basis: 'unknown' };

describe('flightCart', () => {
    beforeEach(() => window.localStorage.clear());

    it('carries each leg on its own date, so an overnight second leg books for the morning', () => {
        const flight = buildCartFlight('outbound', overnight, '2026-09-12', floor(47));

        expect(flight.legs.map((leg) => [leg.origin, leg.destination, leg.date, leg.departureTime])).toEqual([
            ['SNN', 'STN', '2026-09-12', '19:00'],
            ['STN', 'AGP', '2026-09-13', '06:35'],
        ]);
    });

    it('replaces the flight already picked for that direction instead of stacking one up', () => {
        const first = buildCartFlight('outbound', direct, '2026-09-12', exact(47));
        const second = buildCartFlight('outbound', overnight, '2026-09-12', exact(31));

        const cart = selectFlight(selectFlight([], first), second);

        expect(cart).toHaveLength(1);
        expect(flightFor(cart, 'outbound')?.hub).toBe('STN');
    });

    it('holds an outbound and a return side by side, outbound first', () => {
        const cart = selectFlight(
            selectFlight([], buildCartFlight('return', direct, '2026-09-15', exact(52))),
            buildCartFlight('outbound', direct, '2026-09-12', exact(47)),
        );

        expect(cart.map((flight) => flight.direction)).toEqual(['outbound', 'return']);
        expect(cartTotals(cart).total).toBe(99);
    });

    it('survives a reload, and drops anything that is not shaped like a flight', () => {
        selectFlight([], buildCartFlight('outbound', direct, '2026-09-12', exact(47)));
        const stored = JSON.parse(window.localStorage.getItem('travelhub.flightCart.v1') as string);
        window.localStorage.setItem('travelhub.flightCart.v1', JSON.stringify([...stored, { id: 'junk' }]));

        const cart = loadCart();
        expect(cart).toHaveLength(1);
        expect(cart[0].origin).toBe('SNN');
    });

    it('counts the fare the airline is asking, and what was paid once it is booked', () => {
        // The all-in is carried too, but the total has to be comparable with
        // the number the booking site will charge.
        const flight = buildCartFlight('outbound', direct, '2026-09-12', exact(47, 63));
        expect(amountOf(flight)).toBe(47);

        const cart = recordPaid(selectFlight([], flight), flight.id, 71.5);
        expect(amountOf(cart[0])).toBe(71.5);
    });

    it('calls the total exact only once every flight in it has been paid for', () => {
        const outbound = buildCartFlight('outbound', direct, '2026-09-12', exact(47));
        const inbound = buildCartFlight('return', direct, '2026-09-15', exact(52));
        let cart = selectFlight(selectFlight([], outbound), inbound);

        cart = recordPaid(markBooked(cart, outbound.id, true), outbound.id, 49);
        expect(cartTotals(cart)).toMatchObject({ total: 101, paid: 49, estimated: 52, allPaid: false });

        cart = recordPaid(markBooked(cart, inbound.id, true), inbound.id, 55);
        expect(cartTotals(cart)).toMatchObject({ total: 104, paid: 104, estimated: 0, allPaid: true });
    });

    it('flags a total built on a route floor, because that fare may be another departure', () => {
        const cart = selectFlight([], buildCartFlight('outbound', direct, '2026-09-12', floor(47)));

        expect(cartTotals(cart).hasFloor).toBe(true);
        expect(cartTotals(selectFlight([], buildCartFlight('outbound', direct, '2026-09-12', exact(47)))).hasFloor)
            .toBe(false);
    });

    it('counts a flight nobody could price rather than pretending it is free', () => {
        const cart = selectFlight(
            selectFlight([], buildCartFlight('outbound', direct, '2026-09-12', exact(47))),
            buildCartFlight('return', direct, '2026-09-15', unpriced),
        );

        expect(cartTotals(cart)).toMatchObject({ total: 47, unpricedCount: 1, count: 2 });
    });

    it('drops the amount paid when a flight is un-ticked', () => {
        const flight = buildCartFlight('outbound', direct, '2026-09-12', exact(47));
        let cart = recordPaid(markBooked(selectFlight([], flight), flight.id, true), flight.id, 49);

        cart = markBooked(cart, flight.id, false);
        expect(cart[0].paid).toBeNull();
        expect(cartTotals(cart).total).toBe(47);
    });

    it('empties on request, and forgets what it held', () => {
        const flight = buildCartFlight('outbound', direct, '2026-09-12', exact(47));
        selectFlight([], flight);

        expect(clearCart()).toEqual([]);
        expect(loadCart()).toEqual([]);
    });

    it('removes one flight without touching the other', () => {
        const outbound = buildCartFlight('outbound', direct, '2026-09-12', exact(47));
        const inbound = buildCartFlight('return', direct, '2026-09-15', exact(52));
        const cart = removeFlight(selectFlight(selectFlight([], outbound), inbound), outbound.id);

        expect(cart.map((flight) => flight.direction)).toEqual(['return']);
        expect(loadCart()).toHaveLength(1);
    });
});
