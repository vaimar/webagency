import {
    assessCarriage,
    BAG_OVERHEAD_CM,
    bestCarrierForMode,
    BoardSpec,
    CARRIER_RULES,
    effectiveLengthCm,
    findCarrierRule,
    ruleCoverage,
    TYPICAL_BOARD_CM,
} from './boardRules';

const commonBoard: BoardSpec = { lengthCm: TYPICAL_BOARD_CM.common, bagged: true };  // 140 + bag

describe('the board itself', () => {
    it('counts the bag, because the carrier measures the bag', () => {
        expect(effectiveLengthCm({ lengthCm: 140, bagged: true })).toBe(140 + BAG_OVERHEAD_CM);
        expect(effectiveLengthCm({ lengthCm: 140, bagged: false })).toBe(140);
    });
});

describe('the TGV problem — the question that started this', () => {
    it('tells the rider with a board that he is over the limit, and by how much', () => {
        const sncf = findCarrierRule('SNCF (TGV INOUI / Intercités)')!;
        const verdict = assessCarriage(sncf, commonBoard);

        expect(verdict.verdict).toBe('OVER_LIMIT');
        expect(verdict.message).toContain('150 cm');   // 140 board + 10 bag
        expect(verdict.message).toContain('20 cm over');
        expect(verdict.message).toContain('130 cm');
        // The consequence, not just the rule.
        expect(verdict.message).toMatch(/50-150/);
        expect(verdict.confirmBeforeBooking).toBe(true);
    });

    // Worth stating plainly, because it is the finding: SNCF caps special
    // baggage at 130 cm and the SHORTEST typical adult board is 134 cm bare.
    // No adult wakeboard fits, bagged or not. Only a child's board does.
    it('rules out even the shortest adult board, bagged or bare', () => {
        const sncf = findCarrierRule('SNCF (TGV INOUI / Intercités)')!;

        expect(assessCarriage(sncf, { lengthCm: TYPICAL_BOARD_CM.short, bagged: false }).verdict)
            .toBe('OVER_LIMIT');
        expect(assessCarriage(sncf, { lengthCm: TYPICAL_BOARD_CM.long, bagged: true }).verdict)
            .toBe('OVER_LIMIT');

        // A junior board is the only thing that clears it.
        expect(assessCarriage(sncf, { lengthCm: 125, bagged: false }).verdict).toBe('FINE');
    });

    it('never reports a cost of zero for a leg it could not assess', () => {
        const db = findCarrierRule('Deutsche Bahn')!;
        const verdict = assessCarriage(db, commonBoard);

        expect(verdict.verdict).toBe('UNKNOWN');
        expect(verdict.costEur).toBeNull();
        expect(verdict.costEur).not.toBe(0);
    });
});

describe('flying with a board', () => {
    it('prices Ryanair per board per leg, and names the airport penalty', () => {
        const ryanair = findCarrierRule('Ryanair')!;
        const verdict = assessCarriage(ryanair, commonBoard);

        expect(verdict.verdict).toBe('MUST_BOOK');
        expect(verdict.costEur).toBe(60);
        expect(verdict.message).toContain('€70');
        expect(verdict.message).toMatch(/each way/);
    });

    it('flags a lead as needing confirmation, since we did not read the carrier page', () => {
        const verdict = assessCarriage(findCarrierRule('Ryanair')!, commonBoard);
        expect(verdict.confirmBeforeBooking).toBe(true);
        expect(verdict.rule.provenance.kind).toBe('third_party');
        expect(verdict.rule.provenance.note).toMatch(/treat as a lead/i);
    });
});

describe('the car', () => {
    it('is the only mode with no conditions at all', () => {
        const verdict = assessCarriage(findCarrierRule('Your own car')!, { lengthCm: 150, bagged: true });

        expect(verdict.verdict).toBe('FINE');
        expect(verdict.costEur).toBe(0);
        expect(verdict.confirmBeforeBooking).toBe(false);
        expect(verdict.rule.provenance.kind).toBe('physical_fact');
    });
});

describe('choosing a carrier', () => {
    it('picks the cheapest workable option for a mode', () => {
        expect(bestCarrierForMode('car', commonBoard)?.verdict).toBe('FINE');
        expect(bestCarrierForMode('plane', commonBoard)?.rule.carrier).toBe('Ryanair');
    });

    it('surfaces the problem rather than returning nothing when none work', () => {
        // Trains: SNCF is over-limit for this board, the rest are unresearched.
        const best = bestCarrierForMode('train', commonBoard);
        expect(best).not.toBeNull();
        expect(['OVER_LIMIT', 'UNKNOWN']).toContain(best!.verdict);
    });
});

describe('research backlog', () => {
    it('reports honestly how little is actually researched', () => {
        const coverage = ruleCoverage();

        expect(coverage.total).toBe(CARRIER_RULES.length);
        // Car, Ryanair, SNCF.
        expect(coverage.researched).toBe(3);
        expect(coverage.researched).toBeLessThan(coverage.total);
    });

    it('has every unresearched rule fail to unknown rather than to yes', () => {
        for (const rule of CARRIER_RULES.filter((r) => r.allowed === null)) {
            expect(assessCarriage(rule, commonBoard).verdict).toBe('UNKNOWN');
            expect(assessCarriage(rule, commonBoard).confirmBeforeBooking).toBe(true);
        }
    });
});
