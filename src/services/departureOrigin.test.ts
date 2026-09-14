import { describe, expect, it, beforeEach } from 'vitest';
import {
    DEFAULT_DEPARTURE,
    loadDepartureOrigin,
    normaliseDeparture,
    saveDepartureOrigin,
} from './departureOrigin';

describe('departureOrigin', () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    it('remembers a chosen city across reads', () => {
        saveDepartureOrigin('Dublin, Ireland');
        expect(loadDepartureOrigin()).toBe('Dublin, Ireland');
    });

    it('falls back to the default when nothing has been chosen', () => {
        expect(loadDepartureOrigin()).toBe(DEFAULT_DEPARTURE);
    });

    it('rejects a value that is no longer on the list', () => {
        // A previous build's city, or a hand-edited key. Returning it would put
        // the select into a state where no option matches its own value.
        window.localStorage.setItem('travelhub.departureOrigin.v1', 'Shannon, Ireland');
        expect(loadDepartureOrigin()).toBe(DEFAULT_DEPARTURE);
    });

    it('never stores a value it would refuse to read back', () => {
        saveDepartureOrigin('Atlantis');
        expect(loadDepartureOrigin()).toBe(DEFAULT_DEPARTURE);
    });

    it('normalises null and undefined rather than throwing', () => {
        expect(normaliseDeparture(null)).toBe(DEFAULT_DEPARTURE);
        expect(normaliseDeparture(undefined)).toBe(DEFAULT_DEPARTURE);
    });
});
