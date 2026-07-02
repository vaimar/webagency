import {
    estimateAirportTransfer,
    formatTransferLabel,
    getArrivalHour,
} from './transferEstimate';

// ─── Haversine accuracy ───────────────────────────────────────────────────────

describe('estimateAirportTransfer — distance accuracy', () => {
    it('IBZ: short island hop (~8 km road) — should be well under €20', () => {
        const result = estimateAirportTransfer('IBZ');
        expect(result).not.toBeNull();
        // Ibiza airport is ~6 km straight-line from the port
        expect(result!.distanceKm).toBeGreaterThan(5);
        expect(result!.distanceKm).toBeLessThan(15);
    });

    it('BVA: Paris Beauvais — should be a very long and expensive trip', () => {
        const result = estimateAirportTransfer('BVA');
        expect(result).not.toBeNull();
        // Beauvais to Paris is ~87 km straight-line
        expect(result!.distanceKm).toBeGreaterThan(80);
        expect(result!.distanceKm).toBeLessThan(130);
    });

    it('STN: Stansted → London — should exceed €100', () => {
        const result = estimateAirportTransfer('STN');
        expect(result).not.toBeNull();
        // ~57 km straight-line × 1.3 road × £2.81/km = expensive
        expect(result!.estimatedFare).toBeGreaterThan(100);
    });

    it('DUB: Dublin airport — typical short city hop', () => {
        const result = estimateAirportTransfer('DUB');
        expect(result).not.toBeNull();
        expect(result!.distanceKm).toBeGreaterThan(5);
        expect(result!.distanceKm).toBeLessThan(20);
    });

    it('BCN: Barcelona El Prat — moderate urban distance', () => {
        const result = estimateAirportTransfer('BCN');
        expect(result).not.toBeNull();
        expect(result!.distanceKm).toBeGreaterThan(10);
        expect(result!.distanceKm).toBeLessThan(30);
    });

    it('CPH: Copenhagen — well-connected with metro, short trip', () => {
        const result = estimateAirportTransfer('CPH');
        expect(result).not.toBeNull();
        expect(result!.distanceKm).toBeGreaterThan(5);
        expect(result!.distanceKm).toBeLessThan(20);
    });
});

// ─── Core pricing logic ───────────────────────────────────────────────────────

describe('estimateAirportTransfer — fare calculation', () => {
    it('IBZ daytime: should be around €13 (8 km Spanish rate)', () => {
        // Spain: flag fall €3.95, ratePerKm €1.05, ~8.2 km road
        const result = estimateAirportTransfer('IBZ', 14); // 14:00 = daytime
        expect(result).not.toBeNull();
        expect(result!.estimatedFare).toBeGreaterThanOrEqual(10);
        expect(result!.estimatedFare).toBeLessThanOrEqual(20);
        expect(result!.currency).toBe('EUR');
        expect(result!.isNightRate).toBe(false);
    });

    it('IBZ at 22:05 (night arrival): should be higher than daytime by nightMultiplier', () => {
        const day = estimateAirportTransfer('IBZ', 14);
        const night = estimateAirportTransfer('IBZ', 22);
        expect(day).not.toBeNull();
        expect(night).not.toBeNull();
        expect(night!.estimatedFare).toBeGreaterThan(day!.estimatedFare);
        expect(night!.isNightRate).toBe(true);
    });

    it('BVA: taxi to Paris should cost over €100 daytime', () => {
        const result = estimateAirportTransfer('BVA', 10);
        expect(result).not.toBeNull();
        expect(result!.estimatedFare).toBeGreaterThan(100);
        expect(result!.isNightRate).toBe(false);
    });

    it('STN: taxi to London is always expensive — even daytime', () => {
        const result = estimateAirportTransfer('STN', 10);
        expect(result).not.toBeNull();
        // At £2.81/km × ~63 km road + flag fall, should be well above €100
        expect(result!.estimatedFare).toBeGreaterThan(100);
    });

    it('MRS: Marseille airport is a known penalty route — should be €30+', () => {
        const result = estimateAirportTransfer('MRS', 10);
        expect(result).not.toBeNull();
        expect(result!.estimatedFare).toBeGreaterThan(30);
    });

    it('SOF: Sofia is very cheap — under €15 daytime', () => {
        const result = estimateAirportTransfer('SOF', 10);
        expect(result).not.toBeNull();
        expect(result!.estimatedFare).toBeLessThan(15);
    });

    it('fare is always a positive integer (Math.ceil applied)', () => {
        const codes = ['DUB', 'BCN', 'IBZ', 'BVA', 'STN', 'LIS', 'ATH', 'BER', 'PRG'];
        codes.forEach((code) => {
            const result = estimateAirportTransfer(code);
            expect(result).not.toBeNull();
            expect(result!.estimatedFare).toBeGreaterThan(0);
            expect(Number.isInteger(result!.estimatedFare)).toBe(true);
        });
    });
});

// ─── Night rate boundary conditions ──────────────────────────────────────────

describe('estimateAirportTransfer — night rate detection', () => {
    const testCases: Array<{ hour: number; expectedNight: boolean }> = [
        { hour: 0,  expectedNight: true  },
        { hour: 1,  expectedNight: true  },
        { hour: 5,  expectedNight: true  },
        { hour: 6,  expectedNight: false }, // night ends at 06:00
        { hour: 7,  expectedNight: false },
        { hour: 12, expectedNight: false },
        { hour: 21, expectedNight: false },
        { hour: 22, expectedNight: true  }, // night starts at 22:00
        { hour: 23, expectedNight: true  },
    ];

    testCases.forEach(({ hour, expectedNight }) => {
        it(`hour ${hour.toString().padStart(2, '0')}:00 → isNightRate = ${expectedNight}`, () => {
            const result = estimateAirportTransfer('DUB', hour);
            expect(result).not.toBeNull();
            expect(result!.isNightRate).toBe(expectedNight);
        });
    });

    it('no arrivalHour provided → daytime rate applied (safe default)', () => {
        const result = estimateAirportTransfer('DUB');
        expect(result).not.toBeNull();
        expect(result!.isNightRate).toBe(false);
    });
});

// ─── Public transport alternatives ───────────────────────────────────────────

describe('estimateAirportTransfer — public transport data', () => {
    it('DUB has an Aircoach / Dublin Bus alternative', () => {
        const result = estimateAirportTransfer('DUB');
        expect(result?.publicTransport).toBeDefined();
        expect(result!.publicTransport!.mode).toMatch(/Aircoach/i);
        expect(result!.publicTransport!.costEur).toBeGreaterThan(0);
        expect(result!.publicTransport!.durationMins).toBeGreaterThan(0);
    });

    it('BCN has a metro/aerobus option', () => {
        const result = estimateAirportTransfer('BCN');
        expect(result?.publicTransport).toBeDefined();
        expect(result!.publicTransport!.costEur).toBeLessThan(result!.estimatedFare);
    });

    it('STN has a Stansted Express alternative cheaper than taxi', () => {
        const result = estimateAirportTransfer('STN');
        expect(result?.publicTransport).toBeDefined();
        expect(result!.publicTransport!.costEur).toBeLessThan(result!.estimatedFare);
    });

    it('BVA has a bus-to-Paris alternative cheaper than taxi', () => {
        const result = estimateAirportTransfer('BVA');
        expect(result?.publicTransport).toBeDefined();
        expect(result!.publicTransport!.costEur).toBeLessThan(result!.estimatedFare);
    });

    it('IBZ (island) has no public transport data — taxi only', () => {
        const result = estimateAirportTransfer('IBZ');
        expect(result?.publicTransport).toBeUndefined();
    });
});

// ─── Unknown / edge case inputs ───────────────────────────────────────────────

describe('estimateAirportTransfer — edge cases', () => {
    it('returns null for an unknown airport code', () => {
        expect(estimateAirportTransfer('ZZZ')).toBeNull();
    });

    it('returns null for an empty string', () => {
        expect(estimateAirportTransfer('')).toBeNull();
    });

    it('is case-insensitive — "ibz" and "IBZ" return the same result', () => {
        const lower = estimateAirportTransfer('ibz');
        const upper = estimateAirportTransfer('IBZ');
        expect(lower).not.toBeNull();
        expect(lower!.estimatedFare).toBe(upper!.estimatedFare);
        expect(lower!.distanceKm).toBe(upper!.distanceKm);
    });

    it('confidence is "calculated" for known airports', () => {
        const result = estimateAirportTransfer('DUB');
        expect(result!.confidence).toBe('calculated');
    });
});

// ─── formatTransferLabel ─────────────────────────────────────────────────────

describe('formatTransferLabel', () => {
    it('returns "~€13" format for a daytime estimate', () => {
        const result = estimateAirportTransfer('IBZ', 14)!;
        const label = formatTransferLabel(result);
        expect(label).toMatch(/^~€\d+$/);
    });

    it('appends "(night rate)" when isNightRate is true', () => {
        const result = estimateAirportTransfer('IBZ', 22)!;
        const label = formatTransferLabel(result);
        expect(label).toContain('night rate');
    });

    it('does not append "(night rate)" for daytime', () => {
        const result = estimateAirportTransfer('DUB', 10)!;
        const label = formatTransferLabel(result);
        expect(label).not.toContain('night rate');
    });
});

// ─── getArrivalHour ───────────────────────────────────────────────────────────

describe('getArrivalHour', () => {
    it('extracts the hour from a full ISO datetime string', () => {
        expect(getArrivalHour('2026-05-19T22:05:00')).toBe(22);
        expect(getArrivalHour('2026-05-19T10:30:00')).toBe(10);
        expect(getArrivalHour('2026-05-19T00:00:00')).toBe(0);
    });

    it('returns undefined for undefined input', () => {
        expect(getArrivalHour(undefined)).toBeUndefined();
    });

    it('returns undefined for an unparseable string', () => {
        expect(getArrivalHour('not-a-date')).toBeUndefined();
    });

    it('returns undefined for an empty string', () => {
        expect(getArrivalHour('')).toBeUndefined();
    });
});

// ─── Anti-Cauchemar penalty airport integration ───────────────────────────────

describe('Anti-Cauchemar penalty airports', () => {
    // The three "trap" airports flagged in AGENTS.md
    it('BVA (Paris Beauvais) — taxi fare is a real trap (>€100)', () => {
        const result = estimateAirportTransfer('BVA', 10);
        expect(result!.estimatedFare).toBeGreaterThan(100);
    });

    it('MRS (Marseille) — significant transfer cost (>€30)', () => {
        const result = estimateAirportTransfer('MRS', 10);
        expect(result!.estimatedFare).toBeGreaterThan(30);
    });

    it('STN (Stansted) — London taxi trap (>€100)', () => {
        const result = estimateAirportTransfer('STN', 10);
        expect(result!.estimatedFare).toBeGreaterThan(100);
    });

    it('BVA penalty airports: public transport is always cheaper than taxi', () => {
        ['BVA', 'STN', 'MRS'].forEach((code) => {
            const result = estimateAirportTransfer(code, 10);
            expect(result?.publicTransport).toBeDefined();
            expect(result!.publicTransport!.costEur).toBeLessThan(result!.estimatedFare);
        });
    });
});

