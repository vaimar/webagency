/**
 * Train ways in on /spots/:slug — docs/specs/sncf-rail-ways-in.md.
 *
 * ── SCOPE OF THIS FILE ───────────────────────────────────────────────────────
 * Criteria 32, 33, 34, 35 and 44. Every assertion here is a request count, a
 * settled copy string, or a regression check — never a journey summary or a leg
 * line, so rev 5's journey and alighting rewrite cannot move them.
 *
 * Criterion 36 is deliberately absent: it asserts V1's journey summaries and leg
 * lines at 400 px, which belongs with the component half.
 *
 * The `/rail` stubs below carry NO journeys on purpose. A NO_JOURNEY response
 * still renders the heading, date line, station line and attribution (8.3), so
 * the date lines criteria 33 and 34 need are provable with zero journey strings
 * in this file. Criterion 33's chained response keeps its origin present but
 * empty, because an AFTER_FLIGHT date line reads `origins[0].stationName`.
 */

// This file is a MODULE, not a global script. Cypress specs that declare
// top-level helpers are otherwise merged into one global scope by tsc, where
// this file's `named`/`openTab`/`stubSpotPage` collide with the identically
// named helpers in spot-trip-total.cy.ts — and tsc then reports the errors
// against THAT file, which criterion 35 requires to pass unmodified. The empty
// export keeps every declaration below scoped to this spec.
export {};

const FR_SLUG = 'nice-wake-park';
const ES_SLUG = 'ibiza-wake-park';

const SAMPLE_DATE_LINE = 'Sample date Sat 3 Oct, departures from 08:00. Not your travel date.';
const BVA_DATE_LINE = 'After your flight lands at BVA at 09:40 on Sat 3 Oct: '
  + 'trains from 12:45, allowing 3h to reach a Paris station.';
// A single U+2026, not three periods. An exact-string match fails on the wrong one.
const LOADING_LINE = 'Looking up train times…';
const UNAVAILABLE_LINE = 'Train times are unavailable right now. Try again later.';

// ─── Accessible names, without a Testing Library dependency ─────────────────

const normalise = (text: string | null | undefined): string => (text ?? '').replace(/\s+/g, ' ').trim();

/** aria-labelledby, then aria-label, then text: enough of the accname algorithm for this page. */
const accessibleName = (element: Element): string => {
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    return normalise(labelledBy.split(/\s+/)
      .map((id) => element.ownerDocument.getElementById(id)?.textContent ?? '')
      .join(' '));
  }
  const label = element.getAttribute('aria-label');
  if (label) return normalise(label);
  return normalise(element.textContent);
};

const named = (name: string) => (_index: number, element: HTMLElement): boolean => accessibleName(element) === name;

const railRegion = () => cy.get('section, [role="region"]').filter(named('By train'));
const noRailRegion = () => cy.get('section, [role="region"]').filter(named('By train')).should('have.length', 0);
const activePanel = () => cy.get('[role="tabpanel"]');
const openTab = (label: string) => cy.contains('[role="tab"]', label).click();
const card = () => cy.get('section, [role="region"]').filter(named('Rough trip cost'));
const cardButton = (name: string) => card().find('button').filter(named(name));
const fareRow = (airline: string) => activePanel().contains('.sdp-flight', airline);

/** How many buttons in `$scope` carry this accessible name. Synchronous, for a retrying `should`. */
const countButtonsNamed = ($scope: JQuery<HTMLElement>, name: string): number => (
  $scope.find('button').filter((_, button) => accessibleName(button) === name).length
);

// ─── Fixtures ────────────────────────────────────────────────────────────────

interface AccessWay {
  mode: string;
  hub: string;
  lastMile: string;
  fare: null;
}

interface SpotOptions {
  slug: string;
  country: string | null;
  label: string;
  arrivalAirport?: string;
  access?: AccessWay[];
}

const spotRow = ({ slug, country, label, arrivalAirport = 'NCE', access = [] }: SpotOptions) => ({
  slug,
  destinationLabel: label,
  arrivalAirport,
  activity: 'wakeboarding',
  country,
  towType: 'FULL_CABLE',
  modes: ['FLY', 'DRIVE'],
  imageUrl: null,
  imageCredit: null,
  imageLicense: null,
  curationLevel: 'VENUE_READY',
  cityLatitude: 43.7102,
  cityLongitude: 7.262,
  airportLatitude: 43.6584,
  airportLongitude: 7.2159,
  bboxLonMin: null,
  bboxLatMin: null,
  bboxLonMax: null,
  bboxLatMax: null,
  aliases: null,
  access,
});

const arnage = () => ({
  id: 'stop_area:SNCF:87396549',
  name: 'Arnage',
  distanceKm: 2.0,
  latitude: 47.928541,
  longitude: 0.189882,
});

/** Sample mode, no journeys: renders the heading, sample date line, station line and attribution. */
const railSample = (slug: string) => ({
  slug,
  status: 'NO_JOURNEY',
  provider: 'SNCF',
  date: '2026-10-03',
  dateBasis: 'SAMPLE',
  departAfter: '08:00',
  chain: null,
  station: arnage(),
  origins: [],
  priceState: 'MANUAL_CHECK',
  bookingUrl: 'https://www.sncf-connect.com/',
  fetchedAt: '2026-09-15T09:12:00Z',
});

/**
 * Chained to a BVA landing. The PARIS origin is present but carries no
 * journeys: the AFTER_FLIGHT date line reads `origins[0].stationName`, and a
 * CITY origin's null stationName is what produces "a Paris station" (8.3).
 */
const railChainedBva = (slug: string) => ({
  ...railSample(slug),
  dateBasis: 'AFTER_FLIGHT',
  departAfter: '12:45',
  chain: {
    airport: 'BVA',
    arrivalTime: '2026-10-03T09:40:00+02:00',
    routed: true,
    bufferMinutes: 180,
  },
  origins: [
    {
      kind: 'CITY',
      code: 'PARIS',
      label: 'Paris',
      stationName: null,
      note: 'Any Paris station. Getting into Paris is not included.',
      status: 'NO_JOURNEY',
      journeys: [],
    },
  ],
});

const bvaFare = ({ withArrivalDate = true } = {}) => ({
  origin: 'DUB',
  destination: 'BVA',
  departureDate: '2026-10-03T06:15:00',
  arrivalDate: withArrivalDate ? '2026-10-03T09:40:00' : null,
  price: 39.99,
  currency: 'EUR',
  airline: 'Ryanair',
  flightNumber: 'FR 22',
  priceLabel: 'Current',
  priceDisclaimer: null,
  realWorldEntryPrice: 59.99,
  antiCauchemar: {
    ticketPrice: 39.99,
    airportShuttleEstimate: 5,
    cabinBagEstimate: 14,
    realCost: 58.99,
    realWorldEntryPrice: 59.99,
    auditedTotalCost: 64.99,
    manualCheckRequired: false,
    currency: 'EUR',
  },
});

const arrivalWithStation = () => ({
  airports: [
    {
      iata: 'NCE',
      name: "Nice Côte d'Azur",
      municipality: 'Nice',
      country: 'FR',
      distanceKm: 11.8,
      latitude: 43.6584,
      longitude: 7.2159,
    },
  ],
  station: { name: 'Nice-Ville', distanceKm: 3.4, latitude: 43.7045, longitude: 7.2619 },
  stationPending: false,
  drivingDirectionsUrl: null,
  websiteUrl: null,
});

// ─── Backend stubs ───────────────────────────────────────────────────────────

/** Every `/rail` URL the page asked for, in order, recorded before any stub answers. */
let railRequests: string[] = [];

const chainedRequests = () => railRequests.filter((url) => url.includes('?'));
const sampleRequests = () => railRequests.filter((url) => !url.includes('?'));

interface StubOptions extends SpotOptions {
  flights?: unknown[];
  arrival?: unknown;
  /** Override the sample `/rail` body (default: railSample, which carries no journeys). */
  railBody?: unknown;
  /** Delay applied to the chained `/rail` response, for criterion 34's loading state. */
  chainedDelayMs?: number;
  /** Fail the sample `/rail` request at the network level, for criterion 34's error state. */
  failSample?: boolean;
}

const stubSpotPage = (options: StubOptions) => {
  const { slug, flights = [], arrival, railBody, chainedDelayMs, failSample = false } = options;

  cy.mockSpotsFixture();

  cy.intercept({ hostname: 'tiles.openfreemap.org' }, { statusCode: 404, body: '' });
  cy.intercept({ hostname: 's3.amazonaws.com' }, { statusCode: 404, body: '' });

  railRequests = [];
  cy.intercept({ url: /\/api\/spots\/[^/]+\/rail/, middleware: true }, (req) => {
    railRequests.push(req.url);
  });

  cy.intercept({ method: 'GET', pathname: '/api/destinations/spots' }, { body: [spotRow(options)] }).as('spots');
  cy.intercept({ method: 'GET', pathname: `/api/spots/${slug}` }, { fixture: 'trip-total/spot-detail.json' }).as('detail');
  cy.intercept(
    { method: 'GET', pathname: `/api/spots/${slug}/arrival` },
    arrival ? { body: arrival } : { fixture: 'trip-total/arrival.json' },
  ).as('arrival');

  // Order matters, and the general route MUST be registered first. Cypress
  // matches last-registered-wins, and the sample route carries no `query`
  // constraint, so it also matches the chained URL — registering it last would
  // let it swallow every chained request and `@railChained` would never fire.
  cy.intercept(
    { method: 'GET', pathname: `/api/spots/${slug}/rail` },
    failSample ? { forceNetworkError: true } : { body: railBody ?? railSample(slug) },
  ).as('rail');
  cy.intercept(
    { method: 'GET', pathname: `/api/spots/${slug}/rail`, query: { arrivalAirport: 'BVA' } },
    chainedDelayMs
      ? { body: railChainedBva(slug), delay: chainedDelayMs }
      : { body: railChainedBva(slug) },
  ).as('railChained');

  cy.intercept({ method: 'GET', pathname: '/api/spots/pois' }, { body: [] }).as('pois');
  cy.intercept({ method: 'GET', pathname: '/api/flights' }, { body: flights }).as('flights');
  cy.intercept({ method: 'GET', pathname: '/api/trips/hacker-routes' }, { body: [] }).as('hackerRoutes');
  cy.intercept({ method: 'GET', pathname: '/api/hotels/search/bbox' }, { body: [] }).as('bbox');
  cy.intercept({ method: 'GET', pathname: '/api/hotels/curated' }, { body: [] }).as('curated');
};

/** Visits the spot and waits for it to RESOLVE — criterion 32 times the request to that, not to first paint. */
const visitResolvedSpot = (slug: string, label: string) => {
  cy.visit(`/spots/${slug}`);
  cy.wait('@spots');
  cy.contains(label).should('be.visible');
};

/** Lets any request the page was about to send actually leave before we count. */
const settle = () => cy.wait(750);

/** Counts /rail requests immediately around one action. */
const expectNoRailRequest = (label: string, act: () => void) => {
  let before = 0;
  cy.then(() => { before = railRequests.length; });
  act();
  settle();
  cy.then(() => {
    expect(railRequests.length - before, `/rail requests sent by "${label}"`).to.eq(0);
  });
};

/**
 * V1 with actual journey content, for criterion 36 (no horizontal scroll at
 * 400px). The other stubs in this file deliberately carry NO journeys because
 * the request-shape criteria don't need them. This one needs the summary, leg
 * lines, alighting block and fare link to be present.
 */
const railV1 = (slug: string) => ({
  slug,
  status: 'OK',
  provider: 'SNCF',
  date: '2026-10-03',
  dateBasis: 'SAMPLE',
  departAfter: '08:00',
  chain: null,
  station: arnage(),
  origins: [
    {
      kind: 'AIRPORT',
      code: 'CDG',
      label: 'Paris Charles de Gaulle',
      stationName: 'Aéroport CDG 2 TGV',
      note: 'Station inside Terminal 2.',
      status: 'OK',
      journeys: [
        {
          departure: '2026-10-03T08:48:00+02:00',
          arrival: '2026-10-03T13:25:00+02:00',
          durationMinutes: 277,
          changes: 1,
          fare: null,
          legs: [
            {
              mode: 'TGV INOUI',
              line: null,
              trainNumber: '5210',
              from: 'Aéroport Charles de Gaulle 2 TGV',
              to: 'Le Mans',
              departure: '2026-10-03T08:48:00+02:00',
              arrival: '2026-10-03T10:30:00+02:00',
            },
            {
              mode: 'Aléop',
              line: 'P30',
              trainNumber: '857065',
              from: 'Le Mans',
              to: 'Arnage',
              departure: '2026-10-03T13:20:00+02:00',
              arrival: '2026-10-03T13:25:00+02:00',
            },
          ],
          alightingOptions: [
            {
              stationId: 'stop_area:SNCF:87396002',
              stationName: 'Le Mans',
              arrivalTime: '2026-10-03T10:30:00+02:00',
              distanceKm: 7.2,
              durationMinutes: 102,
              changes: 0,
              final: false,
            },
            {
              stationId: 'stop_area:SNCF:87396549',
              stationName: 'Arnage',
              arrivalTime: '2026-10-03T13:25:00+02:00',
              distanceKm: 2.0,
              durationMinutes: 277,
              changes: 1,
              final: true,
            },
          ],
        },
      ],
    },
    {
      kind: 'CITY',
      code: 'PARIS',
      label: 'Paris',
      stationName: null,
      note: 'Any Paris station. Getting into Paris is not included.',
      status: 'NO_JOURNEY',
      journeys: [],
    },
  ],
  priceState: 'MANUAL_CHECK',
  bookingUrl: 'https://www.sncf-connect.com/',
  fetchedAt: '2026-09-15T09:12:00Z',
});

describe('spot-rail-ways-in', () => {
  describe('C32: the sample request is sent once, for a French spot only', () => {
    it('C32: sends exactly one /rail with no query string, and no more across tab switches', () => {
      stubSpotPage({ slug: FR_SLUG, country: 'FR', label: 'Nice Wake Park' });
      visitResolvedSpot(FR_SLUG, 'Nice Wake Park');

      cy.wait('@rail');
      settle();
      cy.then(() => {
        expect(railRequests, '/rail requests after the spot resolved').to.have.length(1);
        expect(railRequests[0], 'the sample request carries no query string').to.not.contain('?');
      });

      // The result is page state, so revisiting the tab must not refetch it.
      ['Hotels', 'Restaurants', 'Flights', 'Getting there'].forEach((tab) => openTab(tab));
      settle();
      cy.then(() => {
        expect(railRequests, '/rail requests after visiting every tab with no pick').to.have.length(1);
      });
    });

    it('C32: sends none for a Spanish spot, and renders no By train region', () => {
      stubSpotPage({ slug: ES_SLUG, country: 'ES', label: 'Ibiza Wake Park' });
      visitResolvedSpot(ES_SLUG, 'Ibiza Wake Park');
      settle();

      cy.then(() => {
        expect(railRequests, '/rail requests for a non-French spot').to.have.length(0);
      });
      noRailRegion();
    });
  });

  describe('C44: the country gate is case-insensitive', () => {
    it('C44: a lowercase "fr" spot is France — one request, and the region renders', () => {
      // The backend accepts 'fr', so an exact-case gate here would silently drop
      // rail for a valid spot and send nothing at all.
      stubSpotPage({ slug: FR_SLUG, country: 'fr', label: 'Nice Wake Park' });
      visitResolvedSpot(FR_SLUG, 'Nice Wake Park');

      cy.wait('@rail');
      settle();
      cy.then(() => {
        expect(railRequests, '/rail requests for a country:"fr" spot').to.have.length(1);
        expect(railRequests[0], 'the sample request carries no query string').to.not.contain('?');
      });

      railRegion().should('have.length', 1);
    });

    it('C44: a lowercase "es" spot is not France — the gate is not simply "always send"', () => {
      stubSpotPage({ slug: ES_SLUG, country: 'es', label: 'Ibiza Wake Park' });
      visitResolvedSpot(ES_SLUG, 'Ibiza Wake Park');
      settle();

      cy.then(() => {
        expect(railRequests, '/rail requests for a country:"es" spot').to.have.length(0);
      });
      noRailRegion();
    });
  });

  describe('C33: chaining the trains to a picked flight', () => {
    const stubChainable = (overrides: Partial<StubOptions> = {}) => stubSpotPage({
      slug: FR_SLUG,
      country: 'FR',
      label: 'Nice Wake Park',
      arrivalAirport: 'BVA',
      flights: [bvaFare()],
      ...overrides,
    });

    it('C33: picking sends nothing, arriving on Getting there sends exactly one chained request', () => {
      stubChainable();
      visitResolvedSpot(FR_SLUG, 'Nice Wake Park');
      cy.wait('@rail');

      // 33.1 — the pick itself must send nothing (combined-trip-total C30 holds).
      openTab('Flights');
      cy.wait('@flights');
      expectNoRailRequest('Add to trip cost', () => {
        fareRow('Ryanair').find('button[aria-pressed]').click();
      });

      // 33.2 — arriving on Getting there sends the chained request, once.
      openTab('Getting there');
      cy.wait('@railChained');
      settle();
      cy.then(() => {
        expect(chainedRequests(), 'chained /rail requests').to.have.length(1);
        expect(chainedRequests()[0]).to.contain(
          '/rail?arrivalAirport=BVA&arrivalTime=2026-10-03T09%3A40%3A00',
        );
      });
      railRegion().should('contain.text', BVA_DATE_LINE);

      // 33.3 — a held answer is reused, not refetched.
      openTab('Hotels');
      openTab('Getting there');
      settle();
      cy.then(() => {
        expect(chainedRequests(), 'chained /rail requests after a tab round trip').to.have.length(1);
      });

      // 33.4 — un-picking sends nothing and falls back to the sample answer.
      expectNoRailRequest('Remove flight from trip cost', () => {
        cardButton('Remove flight from trip cost').click();
      });
      railRegion().should('contain.text', SAMPLE_DATE_LINE)
        .and('not.contain.text', BVA_DATE_LINE);
    });

    it('C33: a fare with no arrivalDate cannot be chained, so nothing is sent', () => {
      stubChainable({ flights: [bvaFare({ withArrivalDate: false })] });
      visitResolvedSpot(FR_SLUG, 'Nice Wake Park');
      cy.wait('@rail');

      openTab('Flights');
      cy.wait('@flights');
      fareRow('Ryanair').find('button[aria-pressed]').click();

      openTab('Getting there');
      settle();
      cy.then(() => {
        expect(chainedRequests(), 'chained /rail requests without an arrivalDate').to.have.length(0);
        expect(sampleRequests(), 'the sample request still stands').to.have.length(1);
      });
      railRegion().should('contain.text', SAMPLE_DATE_LINE);
    });
  });

  describe('C34: loading and error', () => {
    it('C34: shows the loading line while the chained request is in flight', () => {
      stubSpotPage({
        slug: FR_SLUG,
        country: 'FR',
        label: 'Nice Wake Park',
        arrivalAirport: 'BVA',
        flights: [bvaFare()],
        chainedDelayMs: 2000,
      });
      visitResolvedSpot(FR_SLUG, 'Nice Wake Park');
      cy.wait('@rail');

      openTab('Flights');
      cy.wait('@flights');
      fareRow('Ryanair').find('button[aria-pressed]').click();
      openTab('Getting there');

      railRegion().should('contain.text', LOADING_LINE);
      // …and it is replaced by the chained answer, not left hanging.
      railRegion().should('contain.text', BVA_DATE_LINE);
      railRegion().should('not.contain.text', LOADING_LINE);
    });

    it('C34: a failed request renders the unavailable copy, and the rest of Getting there survives', () => {
      stubSpotPage({ slug: FR_SLUG, country: 'FR', label: 'Nice Wake Park', failSample: true });
      visitResolvedSpot(FR_SLUG, 'Nice Wake Park');

      railRegion().should('contain.text', UNAVAILABLE_LINE);
      // The block failing must not take the panel with it.
      activePanel().should('contain.text', 'NCE');
    });
  });

  describe('C35: existing behaviour is unchanged', () => {
    it('C35: a curated TRAIN way still renders its hub, hint and unpriced note', () => {
      stubSpotPage({
        slug: FR_SLUG,
        country: 'FR',
        label: 'Nice Wake Park',
        access: [{ mode: 'TRAIN', hub: 'Le Mans (TGV)', lastMile: '~25 min drive', fare: null }],
      });
      visitResolvedSpot(FR_SLUG, 'Nice Wake Park');

      activePanel().should('contain.text', 'Le Mans (TGV)')
        .and('contain.text', '~25 min drive')
        .and('contain.text', 'curated, no live price');
    });

    it('C35: the OSM nearest-station row still renders for a spot with no curated ways', () => {
      stubSpotPage({
        slug: FR_SLUG,
        country: 'FR',
        label: 'Nice Wake Park',
        access: [],
        arrival: arrivalWithStation(),
      });
      visitResolvedSpot(FR_SLUG, 'Nice Wake Park');
      cy.wait('@arrival');

      activePanel().should('contain.text', 'Nice-Ville')
        .and('contain.text', 'nearest station — ');
    });

    it('C35: the By train region carries no pick button', () => {
      stubSpotPage({ slug: FR_SLUG, country: 'FR', label: 'Nice Wake Park' });
      visitResolvedSpot(FR_SLUG, 'Nice Wake Park');
      cy.wait('@rail');

      railRegion().should(($region) => {
        expect(countButtonsNamed($region, 'Add to trip cost'), 'Add to trip cost buttons').to.eq(0);
        expect(countButtonsNamed($region, 'In trip cost'), 'In trip cost buttons').to.eq(0);
        expect($region.find('button[aria-pressed]'), 'pick toggles').to.have.length(0);
      });
    });
  });

  describe('C36: no horizontal overflow at 400px viewport width', () => {
    /**
     * The V1 response has actual journey content (summary, leg lines, alighting
     * options, fare link). At 400px the rendered rail block must not cause
     * horizontal scrolling.
     */

    it('C36: at 400px the rail block scrollWidth does not exceed clientWidth', () => {
      cy.viewport(400, 800);

      stubSpotPage({
        slug: FR_SLUG,
        country: 'FR',
        label: 'Nice Wake Park',
        railBody: railV1(FR_SLUG),
      });
      visitResolvedSpot(FR_SLUG, 'Nice Wake Park');
      cy.wait('@rail');

      // The journey content must be visible (proves V1 rendered).
      railRegion().should('contain.text', 'TGV INOUI');
      railRegion().should('contain.text', 'Le Mans');

      // The rail container itself must not overflow.
      railRegion().should(($region) => {
        const el = $region[0];
        expect(el.scrollWidth, 'rail region scrollWidth <= clientWidth')
          .to.be.at.most(el.clientWidth);
      });

      // The document root must not have horizontal scroll caused by the rail block.
      cy.document().should((doc) => {
        expect(doc.documentElement.scrollWidth, 'document scrollWidth <= clientWidth')
          .to.be.at.most(doc.documentElement.clientWidth);
      });
    });

    it('C36: at 1280px the rail block also has no horizontal overflow', () => {
      cy.viewport(1280, 800);

      stubSpotPage({
        slug: FR_SLUG,
        country: 'FR',
        label: 'Nice Wake Park',
        railBody: railV1(FR_SLUG),
      });
      visitResolvedSpot(FR_SLUG, 'Nice Wake Park');
      cy.wait('@rail');

      railRegion().should('contain.text', 'TGV INOUI');

      railRegion().should(($region) => {
        const el = $region[0];
        expect(el.scrollWidth, 'rail region scrollWidth <= clientWidth')
          .to.be.at.most(el.clientWidth);
      });

      cy.document().should((doc) => {
        expect(doc.documentElement.scrollWidth, 'document scrollWidth <= clientWidth')
          .to.be.at.most(doc.documentElement.clientWidth);
      });
    });
  });
});
