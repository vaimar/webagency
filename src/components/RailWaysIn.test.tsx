/**
 * T2, component half — docs/specs/sncf-rail-ways-in.md criteria 24–31 and 46.
 *
 * Every string here is quoted from section 8.3, which is authoritative: where a
 * criterion's prose and 8.3 disagree, 8.3 wins. That rule exists because the
 * alighting note was once specified twice in different words, and exact-string
 * tests cannot survive that.
 *
 * Two shapes of assertion are deliberate:
 *   · Negative assertions are always PAIRED with a positive sibling that proves
 *     the mechanism fires at all. A test that something is absent passes just as
 *     happily when the whole feature is broken.
 *   · Criterion 46's "read from the wire" is probed by MUTATING the fixture's
 *     `durationMinutes`/`changes` to values `legs[]` could not produce. If the
 *     component ever derives them instead, the assertion fails.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RailWaysIn from './RailWaysIn';
import type { RailWaysInResponse } from '../services/railWaysIn';
import {
    arnageOption,
    cdgOrigin,
    chainedResponse,
    leMansOption,
    parisOrigin,
    railEnvelope,
    singleOptionJourney,
    v1Response,
    v2Response,
} from '../services/railWaysIn.fixtures';

const loaded = (data: RailWaysInResponse) => render(<RailWaysIn state={{ kind: 'loaded', data }} />);

const region = () => screen.getByRole('region', { name: 'By train' });
const regionText = (): string => (region().textContent ?? '').replace(/\s+/g, ' ');

/** Runs `check` with the process clock in `zone`, then restores it. */
const inTimeZone = (zone: string, check: () => void): void => {
    const original = process.env.TZ;
    process.env.TZ = zone;
    try {
        check();
    } finally {
        if (original === undefined) delete process.env.TZ;
        else process.env.TZ = original;
    }
};

/** Index of `needle` in the region's text, asserting it is present. */
const indexOf = (needle: string): number => {
    const at = regionText().indexOf(needle);
    expect(at, `"${needle}" is in the block`).toBeGreaterThan(-1);
    return at;
};

const SAMPLE_DATE_LINE = 'Sample date Sat 3 Oct, departures from 08:00. Not your travel date.';
const STATION_LINE = 'To Arnage, 2 km from the spot in a straight line.';
const PRICE_NOTE = 'SNCF gives no fares, so trains are not in any total.';
const ATTRIBUTION = 'Train times from SNCF.';
const ALIGHTING_NOTE = 'Getting off earlier can leave you farther from the spot. '
    + 'Onward travel from any of these stations is not included.';
const LE_MANS_OPTION = 'Off at Le Mans 10:30 · 1h42 · Direct · 7.2 km to the spot';
const ARNAGE_OPTION = 'Stay to Arnage 13:25 · 4h37 · 1 change · 2 km to the spot';

describe('C24: V1 renders its block in order', () => {
    it('C24: sample date, station, price note, both origins, attribution', () => {
        loaded(v1Response());

        expect(regionText()).toContain(SAMPLE_DATE_LINE);
        // 2 km, not 2.0 km: one form everywhere (8.3 rule 4).
        expect(regionText()).toContain(STATION_LINE);
        expect(within(region()).getByText('Manual check')).toBeInTheDocument();
        expect(regionText()).toContain(PRICE_NOTE);
        expect(regionText()).toContain('From Paris Charles de Gaulle (CDG)');
        expect(regionText()).toContain('Station inside Terminal 2.');
        expect(regionText()).toContain('From Paris');
        expect(regionText()).toContain('No train from here on this date.');
        expect(regionText()).toContain(ATTRIBUTION);
    });

    it('C24: in that order', () => {
        loaded(v1Response());

        const order = [
            SAMPLE_DATE_LINE,
            STATION_LINE,
            PRICE_NOTE,
            'From Paris Charles de Gaulle (CDG)',
            ATTRIBUTION,
        ].map(indexOf);

        expect(order, 'block elements in document order').toEqual([...order].sort((a, b) => a - b));
    });
});

describe('C25: V1s journey', () => {
    it('C25: summary names the end station, then both legs and the change', () => {
        loaded(v1Response());

        // Naming Arnage stops a 4h37 headline reading as the Le Mans option.
        expect(regionText()).toContain('08:48 → Arnage 13:25 · 4h37 · 1 change');
        expect(regionText()).toContain('TGV INOUI 5210 · Aéroport Charles de Gaulle 2 TGV 08:48 → Le Mans 10:30');
        expect(regionText()).toContain('Change at Le Mans, 2h50');
        expect(regionText()).toContain('Aléop P30 857065 · Le Mans 13:20 → Arnage 13:25');
    });

    it('C25: carries none of the strings the capture disproved', () => {
        loaded(v1Response());
        const text = regionText();

        expect(text, 'no TER-branded leg exists on this route').not.toMatch(/\bTER\b/);
        expect(text, 'a 170-minute wait reads as 2h50').not.toContain('170 min');
        expect(text, '08:49 came from the Le Mans probe, not this route').not.toContain('08:49');
        expect(text, 'the commune suffix never reaches the rider').not.toMatch(/\((Le Mans|Tremblay-en-France)\)/);
    });

    it('C25: renders the same strings in New York', () => {
        inTimeZone('America/New_York', () => {
            loaded(v1Response());
            expect(regionText()).toContain('08:48 → Arnage 13:25 · 4h37 · 1 change');
            expect(regionText()).toContain('Change at Le Mans, 2h50');
        });
    });
});

describe('C46: both alighting options render', () => {
    it('C46: heading, then the earlier farther station, then the destination', () => {
        loaded(v1Response());

        const order = ['Where to get off:', LE_MANS_OPTION, ARNAGE_OPTION].map(indexOf);
        expect(order, 'alighting block in order').toEqual([...order].sort((a, b) => a - b));
    });

    it('C46: each option reads its own duration and changes from the wire', () => {
        // Values legs[] could not produce: if the component derived them from
        // the journey it would render 1h42/Direct here regardless.
        const mutated = v1Response();
        mutated.origins[0].journeys[0].alightingOptions = [
            { ...leMansOption(), durationMinutes: 200, changes: 3 },
            arnageOption(),
        ];
        loaded(mutated);

        expect(regionText()).toContain('Off at Le Mans 10:30 · 3h20 · 3 changes · 7.2 km to the spot');
        expect(regionText()).not.toContain(LE_MANS_OPTION);
    });

    it('C46: the note appears once when there is a choice', () => {
        loaded(v1Response());

        expect(regionText()).toContain(ALIGHTING_NOTE);
        expect(within(region()).getAllByText(ALIGHTING_NOTE)).toHaveLength(1);
    });

    it('C46: and is absent, with no heading, when there is only one option', () => {
        // The paired positive is the test above: together they prove the
        // condition is real rather than the note simply never rendering.
        const single = v1Response();
        single.origins[0].journeys = [singleOptionJourney()];
        loaded(single);

        const oneOption = regionText();

        expect(oneOption, 'its single destination line still renders').toContain(ARNAGE_OPTION);
        expect(oneOption, 'nothing to get off early FOR').not.toContain('Where to get off:');
        expect(oneOption).not.toContain(ALIGHTING_NOTE);
    });

    it('C46: no copy assumes a particular number of options', () => {
        loaded(v1Response());

        expect(regionText()).not.toContain('either station');
        expect(regionText()).not.toContain('neither leg');
    });

    it('C46: distances keep one form — 2 km and 7.2 km', () => {
        loaded(v1Response());

        expect(regionText()).toContain('7.2 km to the spot');
        expect(regionText()).toContain('2 km to the spot');
        expect(regionText()).not.toContain('2.0 km');
    });

    it('C46: renders the same option strings in New York', () => {
        inTimeZone('America/New_York', () => {
            loaded(v1Response());
            expect(regionText()).toContain(LE_MANS_OPTION);
            expect(regionText()).toContain(ARNAGE_OPTION);
        });
    });
});

describe('C26: the fare link', () => {
    it('C26: V1 has exactly one, opening SNCF Connect in a new tab', () => {
        loaded(v1Response());

        const links = within(region()).getAllByRole('link', { name: 'Check fares on SNCF Connect' });
        expect(links, 'V1 holds one captured journey, so one link').toHaveLength(1);
        expect(links[0]).toHaveAttribute('href', 'https://www.sncf-connect.com/');
        expect(links[0]).toHaveAttribute('target', '_blank');
        expect(links[0]).toHaveAttribute('rel', 'noopener noreferrer');
    });
});

describe('C27: nothing forbidden reaches the block', () => {
    const vectors: Array<[string, RailWaysInResponse]> = [
        ['V1', v1Response()],
        ['V2', v2Response()],
        ['NO_JOURNEY', railEnvelope({ status: 'NO_JOURNEY' })],
        ['TIMETABLE_NOT_PUBLISHED', railEnvelope({ status: 'TIMETABLE_NOT_PUBLISHED' })],
        ['NO_STATION_NEARBY', railEnvelope({ status: 'NO_STATION_NEARBY', station: null })],
        ['PROVIDER_UNAVAILABLE', railEnvelope({ status: 'PROVIDER_UNAVAILABLE' })],
        ['QUOTA_EXHAUSTED', railEnvelope({ status: 'QUOTA_EXHAUSTED' })],
    ];

    it.each(vectors)('C27: %s shows no price and no fetchedAt', (_name, data) => {
        loaded(data);
        const text = regionText();

        expect(text).not.toMatch(/€|EUR/);
        expect(text).not.toMatch(/\b0\.0\b/);
        // fetchedAt is 2026-09-15T09:12:00Z and is deliberately never rendered.
        expect(text).not.toContain('09:12');
        expect(text).not.toContain('15 Sep');
        expect(text).not.toMatch(/updated|checked/i);
    });
});

describe('C28: status copy', () => {
    it('C28: NO_JOURNEY names the station and the date, with no badge or link', () => {
        loaded(railEnvelope({ status: 'NO_JOURNEY' }));

        expect(regionText()).toContain('SNCF found no train to Arnage on Sat 3 Oct.');
        expect(within(region()).queryByText('Manual check')).toBeNull();
        expect(within(region()).queryByRole('link', { name: 'Check fares on SNCF Connect' })).toBeNull();
    });

    it('C28: TIMETABLE_NOT_PUBLISHED', () => {
        loaded(railEnvelope({ status: 'TIMETABLE_NOT_PUBLISHED' }));
        expect(regionText()).toContain('SNCF has not published train times for Sat 3 Oct yet.');
    });

    it('C28: NO_STATION_NEARBY says so and drops the station line', () => {
        loaded(railEnvelope({ status: 'NO_STATION_NEARBY', station: null }));

        expect(regionText()).toContain('No train station within 30 km of this spot.');
        expect(regionText()).not.toContain('from the spot in a straight line');
    });

    it('C28: PROVIDER_UNAVAILABLE', () => {
        loaded(railEnvelope({ status: 'PROVIDER_UNAVAILABLE' }));
        expect(regionText()).toContain('Train times are unavailable right now. Try again later.');
    });

    it('C28: a failed request renders the same as PROVIDER_UNAVAILABLE', () => {
        render(<RailWaysIn state={{ kind: 'error' }} />);
        expect(regionText()).toContain('Train times are unavailable right now. Try again later.');
    });

    it('C28: QUOTA_EXHAUSTED', () => {
        loaded(railEnvelope({ status: 'QUOTA_EXHAUSTED' }));
        expect(regionText()).toContain('Train times are paused for today. Try again tomorrow.');
    });

    it('C28: loading, with a single U+2026', () => {
        render(<RailWaysIn state={{ kind: 'loading' }} />);

        expect(regionText()).toContain('Looking up train times…');
        expect(regionText()).not.toContain('...');
    });
});

describe('C29: the silent statuses render nothing', () => {
    it.each(['NOT_FRANCE', 'NO_COORDINATES', 'NOT_CONFIGURED'] as const)(
        'C29: %s renders no region at all',
        (status) => {
            render(<RailWaysIn state={{
                kind: 'loaded',
                data: railEnvelope({ status, date: null, dateBasis: null, departAfter: null, station: null }),
            }} />);

            expect(screen.queryByRole('region', { name: 'By train' })).toBeNull();
        },
    );

    it('C29: but a non-silent status does render one', () => {
        // The paired positive: without this, the three assertions above would
        // pass just as happily if the component rendered nothing ever.
        loaded(railEnvelope({ status: 'NO_JOURNEY' }));
        expect(screen.queryByRole('region', { name: 'By train' })).not.toBeNull();
    });
});

describe('C30: an origin can fail inside an OK response', () => {
    it('C30: TIMETABLE_NOT_PUBLISHED and PROVIDER_UNAVAILABLE each get their line', () => {
        const data = v1Response();
        data.origins = [
            cdgOrigin(),
            { ...parisOrigin(), status: 'TIMETABLE_NOT_PUBLISHED' },
            { ...parisOrigin(), code: 'LYS', kind: 'AIRPORT', label: 'Lyon Saint-Exupéry', status: 'PROVIDER_UNAVAILABLE' },
        ];
        loaded(data);

        expect(regionText()).toContain('Times for this date are not published yet.');
        expect(regionText()).toContain('Could not load trains from here right now.');
        // The OK origin still renders its journey, so the response is not "all failed".
        expect(regionText()).toContain('08:48 → Arnage 13:25');
    });

    it('C30: QUOTA_EXHAUSTED shares the PROVIDER_UNAVAILABLE line', () => {
        const data = v1Response();
        data.origins = [cdgOrigin(), { ...parisOrigin(), status: 'QUOTA_EXHAUSTED' }];
        loaded(data);

        expect(regionText()).toContain('Could not load trains from here right now.');
    });
});

describe('C31: chained copy, and the date is sliced rather than parsed', () => {
    it('C31: V2 names the flight, the buffer and the airport station', () => {
        loaded(v2Response());

        expect(regionText()).toContain(
            'After your flight lands at CDG at 09:35 on Sat 3 Oct: '
            + 'trains from 11:15, allowing 1h30 to reach Aéroport CDG 2 TGV.',
        );
        expect(regionText()).not.toContain('Sample date');
    });

    it('C31: a BVA chain reaches "a Paris station"', () => {
        loaded(chainedResponse(
            { airport: 'BVA', arrivalTime: '2026-10-03T09:40:00+02:00', routed: true, bufferMinutes: 180 },
            '2026-10-03', '12:45', parisOrigin(),
        ));

        expect(regionText()).toContain(
            'After your flight lands at BVA at 09:40 on Sat 3 Oct: '
            + 'trains from 12:45, allowing 3h to reach a Paris station.',
        );
    });

    it('C31: an unrouted gateway says so, then falls back to the sample line', () => {
        const data = chainedResponse(
            { airport: 'NTE', arrivalTime: '2026-10-03T09:40:00+02:00', routed: false, bufferMinutes: null },
            '2026-10-03', '08:00', cdgOrigin(),
        );
        loaded(data);

        const order = [
            "Your flight lands at NTE. We don't have train times from there yet, so these are for a sample date.",
            SAMPLE_DATE_LINE,
        ].map(indexOf);
        expect(order).toEqual([...order].sort((a, b) => a - b));
    });

    it('C31: a landing after midnight keeps its Paris date in New York', () => {
        // Sliced it is Sun 4 Oct; parsed, Date.parse renders Sat 3 Oct in New
        // York. This vector discriminates there and is dead in Tokyo.
        inTimeZone('America/New_York', () => {
            loaded(chainedResponse(
                { airport: 'CDG', arrivalTime: '2026-10-04T00:30:00+02:00', routed: true, bufferMinutes: 90 },
                '2026-10-04', '02:00', cdgOrigin(),
            ));

            expect(regionText()).toContain('on Sun 4 Oct');
            expect(regionText()).not.toContain('on Sat 3 Oct');
        });
    });

    it('C31: an evening landing keeps its Paris date in Tokyo', () => {
        // The mirror: parsed, this rolls forward to Sun 4 Oct in Tokyo. Dead in
        // New York, which is why one vector per zone is needed rather than one.
        inTimeZone('Asia/Tokyo', () => {
            loaded(chainedResponse(
                { airport: 'LYS', arrivalTime: '2026-10-03T23:20:00+02:00', routed: true, bufferMinutes: 75 },
                '2026-10-04', '00:45',
                { ...cdgOrigin(), code: 'LYS', label: 'Lyon Saint-Exupéry', stationName: 'Lyon Saint-Exupéry TGV' },
            ));

            expect(regionText()).toContain('on Sat 3 Oct');
            expect(regionText()).not.toContain('on Sun 4 Oct');
        });
    });
});

// ── F0 (criterion 42, component half): the Show on map toggle ───────────────

describe('F0 map trace toggle', () => {
    const withGeometry = (data: RailWaysInResponse): RailWaysInResponse => ({
        ...data,
        origins: data.origins.map((origin) => ({
            ...origin,
            journeys: origin.journeys.map((journey) => ({
                ...journey,
                legs: journey.legs.map((leg) => ({
                    ...leg,
                    geometry: [[2.2, 48.9], [0.189, 47.93]] as [number, number][],
                })),
            })),
        })),
    });

    it('renders no Show on map button without a trace handler, even with geometry', () => {
        loaded(withGeometry(v1Response()));

        expect(screen.queryByRole('button', { name: 'Show on map' })).toBeNull();
    });

    it('renders no button when no leg carries geometry', async () => {
        const onToggleTrace = vi.fn();
        render(<RailWaysIn
            state={{ kind: 'loaded', data: v1Response() }}
            tracedJourneyKey={null}
            onToggleTrace={onToggleTrace}
        />);

        expect(screen.queryByRole('button', { name: 'Show on map' })).toBeNull();
    });

    it('toggles aria-pressed and the label, and reports the journey up', async () => {
        const user = userEvent.setup();
        const onToggleTrace = vi.fn();
        const data = withGeometry(v1Response());
        const journey = data.origins[0].journeys[0];
        const key = `${journey.departure}|${journey.arrival}`;
        const { rerender } = render(<RailWaysIn
            state={{ kind: 'loaded', data }}
            tracedJourneyKey={null}
            onToggleTrace={onToggleTrace}
        />);

        const button = screen.getAllByRole('button', { name: 'Show on map' })[0];
        expect(button).toHaveAttribute('aria-pressed', 'false');

        await user.click(button);
        expect(onToggleTrace).toHaveBeenCalledWith(journey);

        rerender(<RailWaysIn
            state={{ kind: 'loaded', data }}
            tracedJourneyKey={key}
            onToggleTrace={onToggleTrace}
        />);
        const pressed = screen.getByRole('button', { name: 'Hide from map' });
        expect(pressed).toHaveAttribute('aria-pressed', 'true');

        await user.click(pressed);
        expect(onToggleTrace).toHaveBeenLastCalledWith(null);
    });
});
