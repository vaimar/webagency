import { resolveDestinationHint, resolveDestinationHintByAirport } from './destinationDirectory';

describe('resolveDestinationHintByAirport', () => {
    it('resolves a city IATA code to its city-centre coordinates', () => {
        const madrid = resolveDestinationHintByAirport('MAD');
        expect(madrid?.label).toBe('Madrid');
        expect(madrid?.cityLat).toBeCloseTo(40.4168, 3);
        expect(madrid?.cityLon).toBeCloseTo(-3.7038, 3);
    });

    it('is case- and whitespace-insensitive', () => {
        expect(resolveDestinationHintByAirport(' bcn ')?.label).toBe('Barcelona');
    });

    it('prefers the city over a venue sharing the same airport', () => {
        // MRS serves Marseille and EXO 84; DUS Dusseldorf and Langenfeld;
        // VNO Vilnius and 313 Cable Park; GVA Geneva and Les Houches.
        expect(resolveDestinationHintByAirport('MRS')?.label).toBe('Marseille');
        expect(resolveDestinationHintByAirport('DUS')?.label).toBe('Dusseldorf');
        expect(resolveDestinationHintByAirport('VNO')?.label).toBe('Vilnius');
        expect(resolveDestinationHintByAirport('GVA')?.label).toBe('Geneva');
    });

    it('returns every resolved hint with usable coordinates', () => {
        for (const code of ['NCE', 'DUB', 'BCN', 'MAD', 'LIS', 'FCO', 'MRS', 'TLS', 'DUS', 'VNO']) {
            const hint = resolveDestinationHintByAirport(code);
            expect(hint?.cityLat).toBeDefined();
            expect(hint?.cityLon).toBeDefined();
        }
    });

    it('yields nothing for an unknown or blank code, so callers fall back', () => {
        expect(resolveDestinationHintByAirport('ZZZ')).toBeUndefined();
        expect(resolveDestinationHintByAirport('')).toBeUndefined();
    });

    it('does not match an IATA code via the keyword path (the original gap)', () => {
        // 'MAD'.includes('madrid') is false — this is why the airport lookup exists.
        expect(resolveDestinationHint('MAD')).toBeUndefined();
        expect(resolveDestinationHint('BCN')).toBeUndefined();
        // City names still resolve through the keyword path.
        expect(resolveDestinationHint('Madrid')?.label).toBe('Madrid');
    });
});
