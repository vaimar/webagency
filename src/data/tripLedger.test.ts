import {
    ALPS_IBIZA_2026,
    LEDGER_STORAGE_KEY,
    LedgerOverrides,
    TripLedgerModel,
    clearDocument,
    computeTotals,
    createSegment,
    effectiveLine,
    lineGroupAmount,
    loadDocument,
    saveDocument,
} from './tripLedger';

const tinyModel: TripLedgerModel = {
    id: 't',
    title: 't',
    partyLabel: '2 adults',
    payingTravellers: 4,
    excluded: [],
    phases: [
        {
            id: 'p',
            title: 'p',
            segments: [
                {
                    id: 's',
                    when: 'now',
                    title: 's',
                    kind: 'drive',
                    lines: [
                        { id: 'a', label: 'exact group', amount: 100, status: 'EXACT' },
                        { id: 'b', label: 'estimated group', amount: 40, status: 'ESTIMATED' },
                        { id: 'c', label: 'per person fare', amount: 25, status: 'ESTIMATED', perPerson: true },
                        { id: 'd', label: 'unknown', amount: null, status: 'CHECK' },
                    ],
                },
            ],
        },
    ],
};

describe('tripLedger totals', () => {
    it('sums exact and estimated separately, multiplies per-person lines, counts unknowns', () => {
        const totals = computeTotals(tinyModel, {});
        expect(totals.exact).toBe(100);
        expect(totals.estimated).toBe(40 + 25 * 4);
        expect(totals.knownTotal).toBe(240);
        expect(totals.unknownCount).toBe(1);
    });

    it('applies user overrides: a filled-in CHECK line becomes an exact cost', () => {
        const overrides: LedgerOverrides = { d: { amount: 300, status: 'EXACT' } };
        const totals = computeTotals(tinyModel, overrides);
        expect(totals.exact).toBe(400);
        expect(totals.unknownCount).toBe(0);
    });

    it('per-person amounts resolve against the paying-traveller count', () => {
        expect(lineGroupAmount({ id: 'x', label: 'x', amount: 10, status: 'EXACT', perPerson: true }, 4)).toBe(40);
        expect(lineGroupAmount({ id: 'x', label: 'x', amount: 10, status: 'EXACT' }, 4)).toBe(10);
        expect(lineGroupAmount({ id: 'x', label: 'x', amount: null, status: 'CHECK' }, 4)).toBeNull();
    });

    it('a line-level pax beats the party default and is overridable without losing the amount', () => {
        // Seeded pax: only 3 fly Shannon → Paris.
        expect(lineGroupAmount({ id: 'x', label: 'x', amount: 10, status: 'EXACT', perPerson: true, pax: 3 }, 4)).toBe(30);
        // A pax override merges with an earlier amount override instead of replacing it.
        const overrides: LedgerOverrides = { c: { amount: 30, status: 'EXACT', pax: 2 } };
        const line = effectiveLine(tinyModel.phases[0].segments[0].lines[2], overrides);
        expect(lineGroupAmount(line, 4)).toBe(60);
        const totals = computeTotals(tinyModel, overrides);
        expect(totals.exact).toBe(100 + 60);
    });

    it('seed itinerary: parking is the only exact non-zero cost and all fares start unknown', () => {
        const totals = computeTotals(ALPS_IBIZA_2026, {});
        expect(totals.exact).toBe(198); // SNN parking; Paris family nights are €0
        expect(totals.unknownCount).toBe(8); // 4 flights, car, Annecy, chalet, Ibiza stay
        // The outbound Paris flight is booked for 3, not the party default of 4.
        const outbound = ALPS_IBIZA_2026.phases[0].segments
            .flatMap((segment) => segment.lines)
            .find((line) => line.id === 'flight-snn-paris');
        expect(outbound?.pax).toBe(3);
    });
});

describe('trip builder', () => {
    it('a new drive stop auto-estimates fuel and tolls from distance', () => {
        const segment = createSegment({ kind: 'drive', title: 'Lyon detour', when: 'Wed 5 Aug', km: 200 }, 'test');
        expect(segment.lines).toHaveLength(2);
        expect(segment.lines[0]).toMatchObject({ amount: 26, status: 'ESTIMATED' }); // 200 × €0.13
        expect(segment.lines[1]).toMatchObject({ amount: 17, status: 'ESTIMATED' }); // 200 × €0.085
    });

    it('short drives get no toll line; flights get a per-person fare with booking links', () => {
        const shortDrive = createSegment({ kind: 'drive', title: 'Local hop', when: 'TBD', km: 30 }, 'test');
        expect(shortDrive.lines).toHaveLength(1);

        const flight = createSegment({ kind: 'fly', title: 'Fly to Barcelona', when: 'Tue 4 Aug', origin: 'gva', destination: 'bcn', date: '2026-08-04' }, 'test');
        expect(flight.lines[0]).toMatchObject({
            perPerson: true,
            status: 'CHECK',
            booking: { origin: 'GVA', destination: 'BCN', date: '2026-08-04' },
        });
    });

    it('the document persists whole and migrates legacy overrides on first load', () => {
        clearDocument();
        // Legacy v1 override: a chalet price the user had already entered.
        window.localStorage.setItem(LEDGER_STORAGE_KEY, JSON.stringify({ 'stay-chalet': { amount: 900, status: 'EXACT' } }));
        const migrated = loadDocument(ALPS_IBIZA_2026);
        const chalet = migrated.phases.flatMap((p) => p.segments).flatMap((s) => s.lines).find((l) => l.id === 'stay-chalet');
        expect(chalet).toMatchObject({ amount: 900, status: 'EXACT' });

        // Structural edits round-trip through storage.
        migrated.phases[0].segments.push(createSegment({ kind: 'stay', title: 'Extra night', when: 'TBD' }, 'roundtrip'));
        saveDocument(migrated);
        const reloaded = loadDocument(ALPS_IBIZA_2026);
        expect(reloaded.phases[0].segments.some((s) => s.id === 'custom-roundtrip')).toBe(true);
        clearDocument();
    });
});
