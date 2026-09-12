import { missingFrom, parseSeason, parseSpotLine, toRideSpot } from './spotEntry';

describe('one dictated line becomes a spot', () => {
    it('reads the Wake Paradise line', () => {
        const entry = parseSpotLine(
            'Wake Paradise | Spay, France | cable | 36 | restaurant, shop, parking | Apr-Oct | https://youtu.be/example',
        )!;

        expect(entry.name).toBe('Wake Paradise');
        expect(entry.locality).toBe('Spay');
        expect(entry.country).toBe('France');
        expect(entry.surface).toBe('cable');
        expect(entry.sessionEur).toBe(36);
        expect(entry.amenities).toEqual(['restaurant', 'shop', 'parking']);
        expect(entry.season).toEqual({ from: '04-01', to: '10-31' });
        expect(entry.videos).toEqual(['https://youtu.be/example']);
    });

    it('accepts just a name and leaves the rest unknown', () => {
        const entry = parseSpotLine('Some New Spot')!;

        expect(entry.name).toBe('Some New Spot');
        expect(entry.surface).toBeUndefined();
        expect(entry.amenities).toEqual([]);
        expect(missingFrom(entry)).toContain('surface (cable / boat / sea)');
    });

    it('understands French and English wording', () => {
        expect(parseSpotLine('X | Y | téléski nautique | 30')!.surface).toBe('cable');
        expect(parseSpotLine('X | Y | boat | 30')!.surface).toBe('boat');
        expect(parseSeason('toute l\'année')).toBe('year_round');
        expect(parseSeason('May to September')).toEqual({ from: '05-01', to: '09-30' });
    });

    it('copes with a price written loosely', () => {
        expect(parseSpotLine('X | Y | cable | 36€ for 2h')!.sessionEur).toBe(36);
        expect(parseSpotLine('X | Y | cable | 25,50 euros')!.sessionEur).toBe(25.50);
    });

    it('says what is still missing rather than guessing', () => {
        const entry = parseSpotLine('Half Known | Spay, France | cable')!;
        const gaps = missingFrom(entry);

        expect(gaps).toContain('session price');
        expect(gaps).toContain('season');
        expect(gaps).toContain('a video');
        expect(gaps).not.toContain('surface (cable / boat / sea)');
    });
});

describe('becoming a catalogue row', () => {
    const entry = parseSpotLine(
        'Wake Paradise | Spay, France | cable | 36 | restaurant, school, parking | Apr-Oct',
    )!;
    const spot = toRideSpot(entry, { arrivalAirport: 'CDG', reportedOn: '2026-09-12', climateBand: 'temperate' });

    it('records what was said as reported, not researched', () => {
        expect(spot.surface.value).toBe('cable');
        expect(spot.surface.sourceKind).toBe('user_report');
        expect(spot.surface.verifiedBy).toBe('human');
        expect(spot.operating.value).toBe(true);
    });

    it('infers beginner-friendly from a school on site, and only then', () => {
        expect(spot.beginnerFriendly.value).toBe(true);

        const noSchool = toRideSpot(
            parseSpotLine('X | Y | cable | 30 | restaurant, parking')!,
            { arrivalAirport: 'CDG', reportedOn: '2026-09-12' },
        );
        expect(noSchool.beginnerFriendly.status).toBe('UNVERIFIED');
    });

    it('leaves anything unsaid unverified rather than filling it in', () => {
        const sparse = toRideSpot(parseSpotLine('Bare Spot')!, { arrivalAirport: 'CDG', reportedOn: '2026-09-12' });

        expect(sparse.surface.status).toBe('UNVERIFIED');
        expect(sparse.openingSeason.status).toBe('UNVERIFIED');
        expect(sparse.sessionPrice.status).toBe('UNVERIFIED');
        expect(sparse.surface.value).toBeNull();
    });
});
