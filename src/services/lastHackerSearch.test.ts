import {
    RememberedSearch,
    forgetHackerSearch,
    recallHackerSearch,
    rememberHackerSearch,
} from './lastHackerSearch';

const search: RememberedSearch = {
    origin: 'SNN',
    destination: 'AGP',
    departureDate: '2026-09-12',
    returnDate: '2026-09-15',
    isOneWay: false,
};

describe('lastHackerSearch', () => {
    beforeEach(() => window.localStorage.clear());

    it('hands back the search it was given', () => {
        rememberHackerSearch(search);

        expect(recallHackerSearch(new Date('2026-09-05T09:00:00'))).toEqual(search);
    });

    it('still offers a search departing today', () => {
        rememberHackerSearch(search);

        expect(recallHackerSearch(new Date('2026-09-12T23:00:00'))).toEqual(search);
    });

    it('drops a search that has already flown rather than re-running it empty', () => {
        rememberHackerSearch(search);

        expect(recallHackerSearch(new Date('2026-09-13T09:00:00'))).toBeNull();
        // And does not keep offering it back on the next visit.
        expect(window.localStorage.getItem('travelhub.hackerSearch.v1')).toBeNull();
    });

    it('ignores anything that is not shaped like a search', () => {
        window.localStorage.setItem('travelhub.hackerSearch.v1', JSON.stringify({ origin: 'SNN' }));

        expect(recallHackerSearch(new Date('2026-09-05T09:00:00'))).toBeNull();
    });

    it('has nothing to say before a search has been run', () => {
        expect(recallHackerSearch()).toBeNull();

        rememberHackerSearch(search);
        forgetHackerSearch();
        expect(recallHackerSearch(new Date('2026-09-05T09:00:00'))).toBeNull();
    });
});
