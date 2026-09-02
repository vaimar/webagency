import { HackerItinerary } from './hackerRoutes';
import { addDays, formatLegDate, itinerarySchedule } from './itinerarySchedule';

const itinerary = (over: Partial<HackerItinerary>): HackerItinerary => ({
    type: 'DIRECT',
    origin: 'SNN',
    hub: null,
    destination: 'AGP',
    leg1: { origin: 'SNN', destination: 'AGP', departureTime: '08:50:00', arrivalTime: '12:40:00' },
    leg2: null,
    layoverMinutes: 0,
    totalJourneyMinutes: 230,
    status: 'SCHEDULE_ONLY',
    ...over,
});

describe('addDays', () => {
    it('walks the calendar in UTC, across month ends', () => {
        expect(addDays('2026-09-06', 0)).toBe('2026-09-06');
        expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
        expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    });
});

describe('itinerarySchedule', () => {
    it('dates a direct flight on the search day', () => {
        const schedule = itinerarySchedule(itinerary({}), '2026-09-06');

        expect(schedule.leg1.departure).toEqual({ clock: '08:50', date: '2026-09-06', dayOffset: 0 });
        expect(schedule.leg1.arrival).toEqual({ clock: '12:40', date: '2026-09-06', dayOffset: 0 });
        expect(schedule.leg1.durationMinutes).toBe(230);
        expect(schedule.leg2).toBeNull();
    });

    it('measures a flight that lands after midnight as its real length', () => {
        // 23:10 → 02:35 is 3h25 in the air. Subtracting the clock times alone
        // would call it minus twenty hours.
        const schedule = itinerarySchedule(itinerary({
            leg1: { origin: 'SNN', destination: 'AGP', departureTime: '23:10', arrivalTime: '02:35' },
            totalJourneyMinutes: 205,
        }), '2026-09-06');

        expect(schedule.leg1.durationMinutes).toBe(205);
    });

    it('measures each leg of a self-transfer separately from the layover', () => {
        const schedule = itinerarySchedule(itinerary({
            type: 'SELF_TRANSFER',
            hub: 'STN',
            leg1: { origin: 'SNN', destination: 'STN', departureTime: '19:00', arrivalTime: '20:30' },
            leg2: { origin: 'STN', destination: 'AGP', departureTime: '06:35', arrivalTime: '10:30' },
            layoverMinutes: 605,
            totalJourneyMinutes: 870,
        }), '2026-09-06');

        expect(schedule.leg1.durationMinutes).toBe(90);
        // 870 total − 90 first leg − 605 on the ground = 175 in the air.
        expect(schedule.leg2?.durationMinutes).toBe(175);
    });

    it('reports no duration when a time is missing', () => {
        const schedule = itinerarySchedule(itinerary({
            leg1: { origin: 'SNN', destination: 'AGP', departureTime: '08:50', arrivalTime: null },
        }), '2026-09-06');

        expect(schedule.leg1.durationMinutes).toBeNull();
    });

    it('rolls a red-eye arrival onto the next day', () => {
        const schedule = itinerarySchedule(itinerary({
            leg1: { origin: 'SNN', destination: 'AGP', departureTime: '23:10', arrivalTime: '02:35' },
            totalJourneyMinutes: 205,
        }), '2026-09-06');

        expect(schedule.leg1.arrival).toEqual({ clock: '02:35', date: '2026-09-07', dayOffset: 1 });
    });

    it('puts an overnight self-transfer\'s second leg on the following morning', () => {
        // SNN 19:00 → STN 20:30, 10h05 on the ground, STN 06:35 → AGP 10:30 the next day.
        const schedule = itinerarySchedule(itinerary({
            type: 'SELF_TRANSFER',
            hub: 'STN',
            leg1: { origin: 'SNN', destination: 'STN', departureTime: '19:00', arrivalTime: '20:30' },
            leg2: { origin: 'STN', destination: 'AGP', departureTime: '06:35', arrivalTime: '10:30' },
            layoverMinutes: 605,
            totalJourneyMinutes: 870,
        }), '2026-09-06');

        expect(schedule.leg1.departure?.date).toBe('2026-09-06');
        expect(schedule.leg2?.departure).toEqual({ clock: '06:35', date: '2026-09-07', dayOffset: 1 });
        expect(schedule.leg2?.arrival).toEqual({ clock: '09:30', date: '2026-09-07', dayOffset: 1 });
    });

    it('keeps a same-day self-transfer on one date', () => {
        const schedule = itinerarySchedule(itinerary({
            type: 'SELF_TRANSFER',
            hub: 'MAD',
            leg1: { origin: 'SNN', destination: 'MAD', departureTime: '11:50', arrivalTime: '15:05' },
            leg2: { origin: 'MAD', destination: 'AGP', departureTime: '19:05', arrivalTime: '20:20' },
            layoverMinutes: 240,
            totalJourneyMinutes: 450,
        }), '2026-09-06');

        expect(schedule.leg2?.departure).toEqual({ clock: '19:05', date: '2026-09-06', dayOffset: 0 });
        expect(schedule.leg2?.arrival).toEqual({ clock: '19:20', date: '2026-09-06', dayOffset: 0 });
    });

    it('falls back to the clock when the journey total is missing', () => {
        const schedule = itinerarySchedule(itinerary({
            type: 'SELF_TRANSFER',
            hub: 'STN',
            leg1: { origin: 'SNN', destination: 'STN', departureTime: '19:00', arrivalTime: '20:30' },
            leg2: { origin: 'STN', destination: 'AGP', departureTime: '06:35', arrivalTime: '10:30' },
            layoverMinutes: 605,
            totalJourneyMinutes: Number.NaN,
        }), '2026-09-06');

        expect(schedule.leg2?.arrival).toEqual({ clock: '10:30', date: '2026-09-07', dayOffset: 1 });
    });

    it('reports nothing rather than guessing when a time is absent', () => {
        const schedule = itinerarySchedule(itinerary({
            leg1: { origin: 'SNN', destination: 'AGP', departureTime: null, arrivalTime: null },
        }), '2026-09-06');

        expect(schedule.leg1.departure).toBeNull();
        expect(schedule.leg1.arrival).toBeNull();
    });
});

describe('timezone-aware legs from the backend', () => {
    // Shannon 08:25 → Alicante 12:10 is 2h45 in the air; Spain is an hour ahead,
    // so the clocks claim 3h45. The backend sends the real figure and its date.
    const crossZone = itinerary({
        type: 'SELF_TRANSFER',
        hub: 'ALC',
        destination: 'IBZ',
        leg1: {
            origin: 'SNN', destination: 'ALC', departureTime: '08:25', arrivalTime: '12:10',
            date: '2026-09-07', durationMinutes: 165,
        },
        leg2: {
            origin: 'ALC', destination: 'IBZ', departureTime: '14:15', arrivalTime: '15:15',
            date: '2026-09-07', durationMinutes: 60,
        },
        layoverMinutes: 125,
        totalJourneyMinutes: 350,
    });

    it('takes the real duration over the clock difference', () => {
        const schedule = itinerarySchedule(crossZone, '2026-09-07');

        expect(schedule.leg1.durationMinutes).toBe(165);
        expect(schedule.leg2?.durationMinutes).toBe(60);
        // The parts still add up to the whole: 165 + 125 layover + 60 = 350.
        expect(165 + crossZone.layoverMinutes + 60).toBe(crossZone.totalJourneyMinutes);
    });

    it('shows each leg\'s clock times exactly as flown, in its own zone', () => {
        const schedule = itinerarySchedule(crossZone, '2026-09-07');

        expect(schedule.leg1.departure?.clock).toBe('08:25');
        expect(schedule.leg1.arrival?.clock).toBe('12:10');
        expect(schedule.leg2?.departure?.clock).toBe('14:15');
        // Derived arithmetically this came out as 14:15 — a zero-minute flight.
        expect(schedule.leg2?.arrival?.clock).toBe('15:15');
    });

    it('dates each leg from the backend rather than deriving it', () => {
        const overnightAcrossZones = itinerary({
            ...crossZone,
            leg2: {
                origin: 'ALC', destination: 'IBZ', departureTime: '06:05', arrivalTime: '07:05',
                date: '2026-09-08', durationMinutes: 60,
            },
        });

        const schedule = itinerarySchedule(overnightAcrossZones, '2026-09-07');

        expect(schedule.leg2?.departure).toEqual({ clock: '06:05', date: '2026-09-08', dayOffset: 1 });
    });
});

describe('formatLegDate', () => {
    it('reads as a short weekday and date', () => {
        expect(formatLegDate('2026-09-06')).toBe('Sun 6 Sep');
    });
});
