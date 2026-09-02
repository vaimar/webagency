import { HackerItinerary } from './hackerRoutes';
import {
    fetchLegPrices,
    honestCostOf,
    isRyanairItinerary,
    itineraryPrice,
    legPriceKey,
    ryanairLegUnpriced,
    uniqueRyanairLegs,
} from './hackerAutoPrice';

const direct = (over: Partial<HackerItinerary> = {}): HackerItinerary => ({
    type: 'DIRECT',
    origin: 'SNN',
    hub: null,
    destination: 'AGP',
    leg1: { airlineCodes: ['FR'], origin: 'SNN', destination: 'AGP', departureTime: '08:50', arrivalTime: '12:40' },
    leg2: null,
    layoverMinutes: 0,
    totalJourneyMinutes: 230,
    status: 'SCHEDULE_ONLY',
    ...over,
});

// SNN 19:00 → STN 20:30, overnight, STN 06:35 → AGP 10:30 the next morning.
const overnight: HackerItinerary = {
    ...direct(),
    type: 'SELF_TRANSFER',
    hub: 'STN',
    leg1: { airlineCodes: ['FR'], origin: 'SNN', destination: 'STN', departureTime: '19:00', arrivalTime: '20:30' },
    leg2: { airlineCodes: ['FR'], origin: 'STN', destination: 'AGP', departureTime: '06:35', arrivalTime: '10:30' },
    layoverMinutes: 605,
    totalJourneyMinutes: 870,
};

const mixed: HackerItinerary = {
    ...overnight,
    hub: 'MAD',
    leg1: { airlineCodes: ['FR'], origin: 'SNN', destination: 'MAD', departureTime: '11:50', arrivalTime: '15:05' },
    leg2: { airlineCodes: ['IB', 'VY'], origin: 'MAD', destination: 'AGP', departureTime: '19:05', arrivalTime: '20:20' },
    layoverMinutes: 240,
    totalJourneyMinutes: 450,
};

describe('isRyanairItinerary', () => {
    it('needs every leg to be Ryanair, not just the first', () => {
        expect(isRyanairItinerary(direct())).toBe(true);
        expect(isRyanairItinerary(overnight)).toBe(true);
        expect(isRyanairItinerary(mixed)).toBe(false);
    });
});

describe('uniqueRyanairLegs', () => {
    it('collapses the legs itineraries share', () => {
        // Three routes out of Shannon, all starting with the same flight.
        const shared = [direct(), direct({ hub: null }), overnight];
        const legs = uniqueRyanairLegs(shared, '2026-09-06');

        expect(legs.map((leg) => `${leg.origin}-${leg.destination}`)).toEqual([
            'SNN-AGP', 'SNN-STN', 'STN-AGP',
        ]);
    });

    it('prices the second leg on the day it actually departs', () => {
        const legs = uniqueRyanairLegs([overnight], '2026-09-06');

        expect(legs).toEqual([
            { origin: 'SNN', destination: 'STN', date: '2026-09-06', carriers: ['FR'] },
            { origin: 'STN', destination: 'AGP', date: '2026-09-07', carriers: ['FR'] },
        ]);
    });

    it('looks up the Ryanair leg of a mixed itinerary too', () => {
        // The journey can never be fully priced, but the answer still says
        // whether that Ryanair flight exists on the day.
        expect(uniqueRyanairLegs([mixed], '2026-09-06')).toEqual([
            { origin: 'SNN', destination: 'MAD', date: '2026-09-06', carriers: ['FR'] },
        ]);
    });
});

describe('itineraryPrice', () => {
    // Fares that belong to exactly the flights `overnight` is built from.
    const matching = {
        [legPriceKey('SNN', 'STN', '2026-09-06')]: { price: 18.99, departure: '2026-09-06T19:00:00' },
        [legPriceKey('STN', 'AGP', '2026-09-07')]: { price: 86.31, departure: '2026-09-07T06:35:00' },
        [legPriceKey('SNN', 'AGP', '2026-09-06')]: { price: 153.42, departure: '2026-09-06T08:50:00' },
    };

    it('adds the legs of a self-transfer', () => {
        expect(itineraryPrice(overnight, '2026-09-06', matching)).toMatchObject({
            total: 105.3, leg1: 18.99, leg2: 86.31, exact: true, farePoints: [],
            // No breakdown on these fixtures, so no honest total to offer.
            honestTotal: null, cabinBags: 0,
        });
    });

    it('reports a direct fare on its own', () => {
        expect(itineraryPrice(direct(), '2026-09-06', matching)).toMatchObject({
            total: 153.42, leg1: 153.42, leg2: null, exact: true, farePoints: [],
            honestTotal: null,
        });
    });

    it('flags a fare that belongs to another departure that day', () => {
        // Ryanair's cheapest SNN-STN that day is the 06:20, not this 19:00 flight.
        const dayFloor = {
            ...matching,
            [legPriceKey('SNN', 'STN', '2026-09-06')]: { price: 15.99, departure: '2026-09-06T06:20:00' },
        };

        const result = itineraryPrice(overnight, '2026-09-06', dayFloor);

        expect(result?.exact).toBe(false);
        expect(result?.farePoints).toEqual([{ leg: 1, clock: '06:20' }]);
        expect(result?.total).toBe(102.3);
    });

    it('is not exact when the fare names no departure at all', () => {
        const aggregate = {
            ...matching,
            [legPriceKey('SNN', 'AGP', '2026-09-06')]: { price: 153.42, departure: null },
        };

        expect(itineraryPrice(direct(), '2026-09-06', aggregate)?.exact).toBe(false);
    });

    it('reports nothing when only half the journey priced', () => {
        // Half a self-transfer's price would read as a bargain that does not exist.
        const partial = { [legPriceKey('SNN', 'STN', '2026-09-06')]: { price: 18.99, departure: null } };
        expect(itineraryPrice(overnight, '2026-09-06', partial)).toBeNull();
    });

    it('never prices an itinerary it cannot price for free', () => {
        expect(itineraryPrice(mixed, '2026-09-06', matching)).toBeNull();
    });
});

describe('fetchLegPrices', () => {
    it('fetches every leg exactly once and keys them by route and day', async () => {
        const calls: string[] = [];
        const fetcher = async (origin: string, destination: string, _c: unknown, date: string) => {
            calls.push(`${origin}-${destination}-${date}`);
            return { price: 20, departure: `${date}T06:35:00` };
        };
        const legs = uniqueRyanairLegs([overnight], '2026-09-06');

        const prices = await fetchLegPrices(legs, 2, fetcher);

        expect(calls).toEqual(['SNN-STN-2026-09-06', 'STN-AGP-2026-09-07']);
        expect(prices[legPriceKey('STN', 'AGP', '2026-09-07')]).toEqual({
            price: 20, departure: '2026-09-07T06:35:00',
        });
    });

    it('records a failed leg as unpriced instead of losing the whole batch', async () => {
        const fetcher = async (origin: string) => {
            if (origin === 'STN') throw new Error('upstream down');
            return { price: 18.99, departure: '2026-09-06T19:00:00' };
        };
        const legs = uniqueRyanairLegs([overnight], '2026-09-06');

        const prices = await fetchLegPrices(legs, 2, fetcher);

        expect(prices[legPriceKey('SNN', 'STN', '2026-09-06')].price).toBe(18.99);
        expect(prices[legPriceKey('STN', 'AGP', '2026-09-07')].price).toBeNull();
    });

    it('never runs more than the pool allows at once', async () => {
        let inFlight = 0;
        let peak = 0;
        const fetcher = async () => {
            inFlight += 1;
            peak = Math.max(peak, inFlight);
            await new Promise((resolve) => setTimeout(resolve, 5));
            inFlight -= 1;
            return { price: 10, departure: null };
        };
        const legs = Array.from({ length: 9 }, (_, i) => ({
            origin: 'SNN', destination: `X${i}`, date: '2026-09-06', carriers: ['FR'],
        }));

        await fetchLegPrices(legs, 3, fetcher);

        expect(peak).toBe(3);
    });
});

describe('ryanairLegUnpriced', () => {
    const priced = { [legPriceKey('SNN', 'STN', '2026-09-06')]: { price: 18.99, departure: '2026-09-06T19:00:00' } };
    const empty = { [legPriceKey('SNN', 'STN', '2026-09-06')]: { price: null, departure: null } };

    it('flags a Ryanair leg the fare feed has nothing for', () => {
        // Ryanair answers per calendar day, so silence means the route almost
        // certainly is not flying — better evidence than the weekday pattern
        // the schedule grid guessed from.
        expect(ryanairLegUnpriced(overnight, '2026-09-06', empty)).toBe(true);
    });

    it('is happy when every Ryanair leg has a fare', () => {
        const all = {
            ...priced,
            [legPriceKey('STN', 'AGP', '2026-09-07')]: { price: 86.31, departure: '2026-09-07T06:35:00' },
        };
        expect(ryanairLegUnpriced(overnight, '2026-09-06', all)).toBe(false);
    });

    it('holds no opinion on a leg it never looked up', () => {
        // No evidence is not evidence of absence — a non-Ryanair leg is unknown,
        // not condemned.
        expect(ryanairLegUnpriced(mixed, '2026-09-06', {})).toBe(false);
    });

    it('defers to a fare the traveller entered themselves', () => {
        // They found the flight; the feed's silence loses.
        const excused = (o: string, d: string) => o === 'SNN' && d === 'STN';
        expect(ryanairLegUnpriced(overnight, '2026-09-06', empty, excused)).toBe(false);
    });
});

describe('honestCostOf', () => {
    // What Ryanair quotes, and what you actually pay.
    const leg = (price: number, cabinBag: number, transfer: number) => ({
        price,
        antiCauchemar: {
            ticketPrice: price,
            cabinBagEstimate: cabinBag,
            airportShuttleEstimate: transfer,
            realCost: price + cabinBag + transfer,
            auditedTotalCost: price + cabinBag + transfer,
            currency: 'EUR',
        },
    });

    it('counts every leg\'s own extras, because two tickets is two of everything', () => {
        const result = honestCostOf([leg(15, 24, 17), leg(23, 24, 0)]);

        // 15 + 23 = 38 in fares; 24 + 17 + 24 = 65 nobody quoted.
        expect(result.honestTotal).toBe(103);
        expect(result.extras).toBe(65);
        expect(result.cabinBags).toBe(2);
    });

    it('counts one cabin bag on a direct', () => {
        const result = honestCostOf([leg(60, 24, 17)]);

        expect(result.honestTotal).toBe(101);
        expect(result.cabinBags).toBe(1);
    });

    it('is the number that decides whether a self-transfer really wins', () => {
        // The routing looks €22 cheaper on fares alone and is €2 dearer once
        // both cabin bags are counted.
        const transfer = honestCostOf([leg(15, 24, 17), leg(23, 24, 0)]);
        const direct = honestCostOf([leg(60, 24, 17)]);

        expect(15 + 23).toBeLessThan(60);
        expect(transfer.honestTotal!).toBeGreaterThan(direct.honestTotal!);
    });

    it('withholds a total when a leg has no breakdown', () => {
        // A total missing one leg's extras understates the very thing it exists
        // to expose.
        expect(honestCostOf([leg(15, 24, 17), { price: 23, antiCauchemar: null }]).honestTotal).toBeNull();
        expect(honestCostOf([leg(15, 24, 17), { price: null }]).honestTotal).toBeNull();
    });
});
