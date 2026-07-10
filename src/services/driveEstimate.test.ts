import { estimateDrive, originCityForAirport } from './driveEstimate';

describe('originCityForAirport', () => {
    it('maps origin airports to their home region', () => {
        expect(originCityForAirport('SNN')).toBe('Limerick');
        expect(originCityForAirport('dub')).toBe('Dublin');
        expect(originCityForAirport('ORK')).toBe('Cork');
        expect(originCityForAirport('XXX')).toBeNull();
        expect(originCityForAirport(null)).toBeNull();
    });
});

describe('estimateDrive', () => {
    it('prices the Limerick → Dublin fly-drive with real tolls, fuel and parking', () => {
        const drive = estimateDrive({ originCity: 'Limerick, Ireland', departureAirport: 'DUB', nights: 3 })!;

        expect(drive.departureAirport).toBe('DUB');
        expect(drive.distanceKm).toBe(200);
        // Fuel: 200 km × 2 (return) × 7L/100km × €1.75/L = €49.00
        expect(drive.fuelEur).toBeCloseTo(49);
        // Tolls: (€2.30 M7 + €3.80 M50) × 2 return = €12.20
        expect(drive.tollsEur).toBeCloseTo(12.2);
        expect(drive.tolls.map((t) => t.amountEur)).toEqual([2.30, 3.80]);
        // Parking: 3 nights × €10/day = €30
        expect(drive.parkingEur).toBe(30);
        expect(drive.totalEur).toBeCloseTo(91.2);
        // Added time: 150 min one way × 2 = 300 min return.
        expect(drive.addedMinutesRoundTrip).toBe(300);
    });

    it('is far cheaper driving to the local Shannon airport (no tolls, short hop)', () => {
        const drive = estimateDrive({ originCity: 'Limerick', departureAirport: 'SNN', nights: 3 })!;

        expect(drive.tolls).toHaveLength(0);
        expect(drive.tollsEur).toBe(0);
        expect(drive.distanceKm).toBe(25);
        expect(drive.totalEur).toBeLessThan(40);
    });

    it('scales parking with the number of nights', () => {
        const one = estimateDrive({ originCity: 'Limerick', departureAirport: 'DUB', nights: 1 })!;
        const five = estimateDrive({ originCity: 'Limerick', departureAirport: 'DUB', nights: 5 })!;
        expect(five.parkingEur - one.parkingEur).toBe(40); // 4 extra nights × €10
        expect(five.totalEur).toBeGreaterThan(one.totalEur);
    });

    it('treats Shannon-based travellers as the Limerick region', () => {
        expect(estimateDrive({ originCity: 'Shannon', departureAirport: 'DUB', nights: 2 })).not.toBeNull();
    });

    it('returns null (never fabricates) for routes it has no data for', () => {
        expect(estimateDrive({ originCity: 'Paris', departureAirport: 'DUB', nights: 3 })).toBeNull();
        expect(estimateDrive({ originCity: 'Limerick', departureAirport: 'BCN', nights: 3 })).toBeNull();
        expect(estimateDrive({ originCity: '', departureAirport: '', nights: 3 })).toBeNull();
    });

    it('defaults to 1 night on a bad nights value', () => {
        const drive = estimateDrive({ originCity: 'Limerick', departureAirport: 'DUB', nights: 0 })!;
        expect(drive.nights).toBe(1);
        expect(drive.parkingEur).toBe(10);
    });

    // ── Zero-Night Clamp ──────────────────────────────────────────────────────
    it('clamps zero, negative and NaN nights to 1 so parking never zeroes out', () => {
        expect(estimateDrive({ originCity: 'Limerick', departureAirport: 'DUB', nights: 0 })!.parkingEur).toBe(10);
        expect(estimateDrive({ originCity: 'Limerick', departureAirport: 'DUB', nights: -4 })!.nights).toBe(1);
        expect(estimateDrive({ originCity: 'Limerick', departureAirport: 'DUB', nights: NaN })!.parkingEur).toBe(10);
    });

    // ── Open-Jaw Check ────────────────────────────────────────────────────────
    it('flags split-airport logistics when the return airport differs from the parked airport', () => {
        const flyDrive = estimateDrive({ originCity: 'Limerick', departureAirport: 'DUB', nights: 3, returnAirport: 'SNN' })!;
        expect(flyDrive.splitAirport).toBe(true);
        expect(flyDrive.departureAirport).toBe('DUB');
        expect(flyDrive.returnAirport).toBe('SNN');
    });

    it('is a normal round trip (no split) when return equals departure or is omitted', () => {
        expect(estimateDrive({ originCity: 'Limerick', departureAirport: 'DUB', nights: 3 })!.splitAirport).toBe(false);
        expect(estimateDrive({ originCity: 'Limerick', departureAirport: 'DUB', nights: 3, returnAirport: 'dub' })!.splitAirport).toBe(false);
        expect(estimateDrive({ originCity: 'Limerick', departureAirport: 'SNN', nights: 3, returnAirport: 'SNN' })!.splitAirport).toBe(false);
    });

    // ── No Floating-Point Errors ──────────────────────────────────────────────
    it('keeps every currency figure at strict 2-dp precision (no IEEE-754 leaks)', () => {
        const drive = estimateDrive({ originCity: 'Limerick', departureAirport: 'DUB', nights: 3 })!;
        for (const value of [drive.fuelEur, drive.tollsEur, drive.parkingEur, drive.totalEur]) {
            expect(Number.isFinite(value)).toBe(true);
            // No value carries more than 2 decimal places.
            expect(Number(value.toFixed(2))).toBe(value);
        }
        // The compiled sum is exact, not 91.2000000000001.
        expect(drive.totalEur).toBe(91.2);
    });
});
