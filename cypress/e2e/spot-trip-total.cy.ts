/**
 * Combined trip total on /spots/:slug — criteria 24–32 of
 * docs/specs/combined-trip-total.md (rev 4.1). Every `it` starts with its criterion.
 *
 * The backend is fully stubbed on top of the catch-alls in mockSpotsFixture()
 * (/api/** → 404, /actuator/** → UP). The fixtures in cypress/fixtures/trip-total/
 * reproduce vector V1: Ryanair DUB → NCE at €49.99 with an audited all-in of
 * €74.99 (its realWorldEntryPrice is deliberately a different €68.99, so the
 * teaser's `honest` figure proves which field it reads), and Hôtel Le Lac at
 * €149.89 a night. External map hosts are stubbed so the run needs no network.
 */

const SLUG = 'nice-wake-park';
const V1_AIRLINE = 'Ryanair';
const OTHER_AIRLINE = 'Aer Lingus';
const V1_STAY = 'Hôtel Le Lac';
const OTHER_STAY = 'Villa Mar';
const UNPRICED_STAY = 'Camping du Lac';
const EXCLUDED = [
  'Flight home',
  'Getting from NCE to the spot',
  'Riding (see the tariff above)',
  'Food and gear hire',
];

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

const card = () => cy.get('section, [role="region"]').filter(named('Rough trip cost'));
const cardButton = (name: string) => card().find('button').filter(named(name));
const stepper = (name: 'Nights' | 'Travellers') => card().find('[role="group"], fieldset').filter(named(name));
const activePanel = () => cy.get('[role="tabpanel"]');
const openTab = (label: string) => cy.contains('[role="tab"]', label).click();

/** Elements whose own text is exactly `text`, e.g. a lone "€49.99" amount. */
const exactly = (text: string) => (_index: number, element: HTMLElement): boolean => (
  element.children.length === 0 && normalise(element.textContent) === text
);

const fareRow = (airline: string) => activePanel().contains('.sdp-flight', airline);
const stayRow = (name: string) => activePanel().contains('.spot-stay', name);
/** The pick toggle is the row's only aria-pressed button, whichever label it carries. */
const pickToggle = (row: Cypress.Chainable<JQuery<HTMLElement>>) => row.find('button[aria-pressed]');

/** How many buttons in `$scope` carry this accessible name. Synchronous, for use inside a retrying `should`. */
const countButtonsNamed = ($scope: JQuery<HTMLElement>, name: string): number => (
  $scope.find('button').filter((_, button) => accessibleName(button) === name).length
);

/** Retrying absence check: `.find('button')` would wait for a button that is never meant to exist. */
const expectNoPickButtons = (scope: Cypress.Chainable<JQuery<HTMLElement>>) => {
  scope.should(($scope) => {
    expect($scope.find('button[aria-pressed]'), 'aria-pressed pick toggles').to.have.length(0);
    expect(countButtonsNamed($scope, 'Add to trip cost'), 'Add to trip cost buttons').to.eq(0);
    expect(countButtonsNamed($scope, 'In trip cost'), 'In trip cost buttons').to.eq(0);
  });
};

const expectPickToggle = (row: Cypress.Chainable<JQuery<HTMLElement>>, picked: boolean) => {
  pickToggle(row)
    .should('have.length', 1)
    .and('have.attr', 'aria-pressed', String(picked))
    .and(($button) => {
      expect(accessibleName($button[0])).to.eq(picked ? 'In trip cost' : 'Add to trip cost');
    });
};

// ─── Backend stubs ───────────────────────────────────────────────────────────

let backendRequests = 0;

const stubSpotPage = ({ scheduleOnly = false } = {}) => {
  cy.mockSpotsFixture();

  cy.intercept({ hostname: 'tiles.openfreemap.org' }, { statusCode: 404, body: '' });
  cy.intercept({ hostname: 's3.amazonaws.com' }, { statusCode: 404, body: '' });

  cy.intercept({ method: 'GET', pathname: '/api/destinations/spots' }, { fixture: 'trip-total/spots.json' }).as('spots');
  cy.intercept({ method: 'GET', pathname: `/api/spots/${SLUG}` }, { fixture: 'trip-total/spot-detail.json' }).as('detail');
  cy.intercept({ method: 'GET', pathname: `/api/spots/${SLUG}/arrival` }, { fixture: 'trip-total/arrival.json' }).as('arrival');
  cy.intercept({ method: 'GET', pathname: '/api/spots/pois' }, { body: [] }).as('pois');
  cy.intercept(
    { method: 'GET', pathname: '/api/flights' },
    scheduleOnly ? { body: [] } : { fixture: 'trip-total/flights.json' },
  ).as('flights');
  cy.intercept({ method: 'GET', pathname: '/api/trips/hacker-routes' }, { fixture: 'trip-total/hacker-routes.json' }).as('hackerRoutes');
  cy.intercept({ method: 'GET', pathname: '/api/hotels/search/bbox' }, { body: [] }).as('bbox');
  cy.intercept({ method: 'GET', pathname: '/api/hotels/curated' }, { fixture: 'trip-total/curated.json' }).as('curated');

  // Counts every same-origin backend call before the stubs answer it (criterion 30).
  backendRequests = 0;
  const origin = Cypress.config('baseUrl') ?? 'http://localhost:3000';
  cy.intercept({ url: new RegExp(`^${origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/(api|actuator)/`), middleware: true }, () => {
    backendRequests += 1;
  });
};

const visitSpot = (slug = SLUG) => {
  cy.visit(`/spots/${slug}`);
  cy.wait('@spots');
};

const waitForStays = () => cy.wait('@curated');

// ─── Page actions ────────────────────────────────────────────────────────────

const pickFare = (airline: string) => {
  openTab('Flights');
  cy.wait('@flights');
  pickToggle(fareRow(airline)).click();
};

const pickStay = (name: string) => {
  openTab('Hotels');
  pickToggle(stayRow(name)).click();
};

/** V1 as the spec states it: the Ryanair fare, Hôtel Le Lac, 3 nights, 2 travellers. */
const pickV1 = () => {
  pickFare(V1_AIRLINE);
  pickStay(V1_STAY);
  cardButton('One more night').click();
  cardButton('One more traveller').click();
  stepper('Nights').find('output, [role="status"]').should('have.text', '3');
  stepper('Travellers').find('output, [role="status"]').should('have.text', '2');
};

describe('spot-trip-total', () => {
  describe('C24: where the pick button appears', () => {
    it('C24: every fare row in the Flights tab teaser has one', () => {
      stubSpotPage();
      visitSpot();

      openTab('Flights');
      cy.wait('@flights');
      activePanel().should(($panel) => {
        const rows = $panel.find('.sdp-flight');
        expect(rows, 'teaser fare rows').to.have.length(2);
        rows.each((_, row) => {
          expect(countButtonsNamed(Cypress.$(row), 'Add to trip cost'), `Add to trip cost in "${normalise(row.textContent)}"`).to.eq(1);
        });
      });
    });

    it('C24: schedule-only rows have none', () => {
      stubSpotPage({ scheduleOnly: true });
      visitSpot();

      openTab('Flights');
      cy.wait(['@flights', '@hackerRoutes']);
      activePanel().should('contain.text', 'via STN');
      activePanel().find('.sdp-flight').should('have.length', 1);
      expectNoPickButtons(activePanel());
    });

    it('C24: no Getting there row has one (absence only; F11 owns those rows)', () => {
      stubSpotPage();
      visitSpot();

      activePanel().should('contain.text', "Nice Côte d'Azur (NCE)");
      expectNoPickButtons(activePanel());
    });
  });

  it('C25: every Hotels row has one, including the row with no live rate', () => {
    stubSpotPage();
    visitSpot();
    waitForStays();

    openTab('Hotels');
    activePanel().should(($panel) => {
      const rows = $panel.find('.spot-stay');
      expect(rows, 'Hotels rows').to.have.length(3);
      rows.each((_, row) => {
        expect(countButtonsNamed(Cypress.$(row), 'Add to trip cost'), `Add to trip cost in "${normalise(row.textContent)}"`).to.eq(1);
      });
    });
    stayRow(UNPRICED_STAY).should('contain.text', 'no live rate');
  });

  describe('C26: pick buttons', () => {
    it('C26: a second fare replaces the first, and pressing "In trip cost" removes the pick', () => {
      stubSpotPage();
      visitSpot();
      waitForStays();

      // A stay first, so the card has lines and the flight line can go back to "Not chosen yet".
      pickStay(V1_STAY);

      pickFare(V1_AIRLINE);
      expectPickToggle(fareRow(V1_AIRLINE), true);
      expectPickToggle(fareRow(OTHER_AIRLINE), false);
      card().should('contain.text', 'Ryanair DUB → NCE · Sat 3 Oct');

      pickToggle(fareRow(OTHER_AIRLINE)).click();
      expectPickToggle(fareRow(OTHER_AIRLINE), true);
      expectPickToggle(fareRow(V1_AIRLINE), false);
      card().should('contain.text', 'Aer Lingus DUB → NCE · Sun 4 Oct')
        .and('not.contain.text', 'Ryanair DUB → NCE');

      pickToggle(fareRow(OTHER_AIRLINE)).click();
      expectPickToggle(fareRow(OTHER_AIRLINE), false);
      card().should('contain.text', 'Not chosen yet')
        .and('not.contain.text', 'Aer Lingus DUB → NCE');
    });

    it('C26: a second stay replaces the first, and pressing "In trip cost" removes the pick', () => {
      stubSpotPage();
      visitSpot();
      waitForStays();

      pickFare(V1_AIRLINE);

      pickStay(V1_STAY);
      expectPickToggle(stayRow(V1_STAY), true);
      expectPickToggle(stayRow(OTHER_STAY), false);
      expectPickToggle(stayRow(UNPRICED_STAY), false);
      card().should('contain.text', V1_STAY);

      pickToggle(stayRow(OTHER_STAY)).click();
      expectPickToggle(stayRow(OTHER_STAY), true);
      expectPickToggle(stayRow(V1_STAY), false);
      card().should('contain.text', OTHER_STAY).and('not.contain.text', V1_STAY);

      pickToggle(stayRow(OTHER_STAY)).click();
      expectPickToggle(stayRow(OTHER_STAY), false);
      card().should('contain.text', 'Not chosen yet').and('not.contain.text', OTHER_STAY);
    });
  });

  it('C27: the rows and the card show the same figures, to the cent', () => {
    stubSpotPage();
    visitSpot();
    waitForStays();

    pickFare(V1_AIRLINE);
    fareRow(V1_AIRLINE).find('*').filter(exactly('€49.99')).should('have.length', 1);
    // The audited all-in the card uses (74.99), not the fixture's realWorldEntryPrice (68.99).
    fareRow(V1_AIRLINE).should('contain.text', 'honest €74.99').and('not.contain.text', '68.99');

    pickStay(V1_STAY);
    stayRow(V1_STAY).find('*').filter(exactly('€149.89')).should('have.length', 1);

    // Nights default to 2 and travellers to 1: one fewer night gives one of each.
    cardButton('One fewer night').click();
    stepper('Nights').find('output, [role="status"]').should('have.text', '1');
    stepper('Travellers').find('output, [role="status"]').should('have.text', '1');
    card().find('*').filter(exactly('€49.99')).should('have.length', 1);
    card().find('*').filter(exactly('€149.89')).should('have.length', 1);
  });

  it('C28: picks survive tab switches, and the card shows on every tab', () => {
    stubSpotPage();
    visitSpot();
    waitForStays();

    pickV1();

    // Back to Flights: FlightTeaser remounts and refetches, and the pick is still recognised.
    openTab('Flights');
    cy.wait('@flights');
    expectPickToggle(fareRow(V1_AIRLINE), true);

    ['Getting there', 'Hotels', 'Restaurants', 'Flights'].forEach((tab) => {
      openTab(tab);
      card().should('be.visible').and('contain.text', '≈ €549.65');
    });
  });

  it('C29: picks, nights and travellers are not persisted across a reload', () => {
    stubSpotPage();
    visitSpot();
    waitForStays();
    pickV1();
    card().should('contain.text', '≈ €549.65');

    cy.reload();
    cy.wait('@spots');
    card().should('contain.text', 'Pick a flight and a place to stay to see a rough trip cost.')
      .and('not.contain.text', '€');

    waitForStays();
    pickFare(V1_AIRLINE);
    pickStay(V1_STAY);
    stepper('Nights').find('output, [role="status"]').should('have.text', '2');
    stepper('Travellers').find('output, [role="status"]').should('have.text', '1');
  });

  it('C30: no pick, stepper or remove action sends a request to /api/** or /actuator/**', () => {
    stubSpotPage();
    visitSpot();
    waitForStays();
    openTab('Flights');
    cy.wait('@flights');

    /** Counts backend requests immediately around one action, with no tab switch in between. */
    const expectNoBackendRequest = (label: string, act: () => void) => {
      let before = 0;
      cy.then(() => { before = backendRequests; });
      act();
      // Give a request the action might have started time to leave the page.
      cy.wait(750);
      cy.then(() => {
        expect(backendRequests - before, `/api/** and /actuator/** requests sent by "${label}"`).to.eq(0);
      });
    };

    expectNoBackendRequest('Add to trip cost (fare)', () => pickToggle(fareRow(V1_AIRLINE)).click());
    expectNoBackendRequest('In trip cost (un-pick fare)', () => pickToggle(fareRow(V1_AIRLINE)).click());
    expectNoBackendRequest('Add to trip cost (fare again)', () => pickToggle(fareRow(V1_AIRLINE)).click());

    openTab('Hotels');
    expectNoBackendRequest('Add to trip cost (stay)', () => pickToggle(stayRow(V1_STAY)).click());
    expectNoBackendRequest('One more night', () => cardButton('One more night').click());
    expectNoBackendRequest('One fewer night', () => cardButton('One fewer night').click());
    expectNoBackendRequest('One more traveller', () => cardButton('One more traveller').click());
    expectNoBackendRequest('One fewer traveller', () => cardButton('One fewer traveller').click());
    expectNoBackendRequest('Remove flight from trip cost', () => cardButton('Remove flight from trip cost').click());
    expectNoBackendRequest('Remove stay from trip cost', () => cardButton('Remove stay from trip cost').click());
  });

  [
    [400, 800],
    [1280, 800],
  ].forEach(([width, height]) => {
    it(`C31: at ${width}×${height} the exclusions are open, nothing in the card scrolls, and the page does not scroll sideways`, () => {
      cy.viewport(width, height);
      stubSpotPage();
      visitSpot();
      waitForStays();
      pickV1();

      EXCLUDED.forEach((item) => {
        card().contains('li', item)
          .scrollIntoView()
          .should('be.visible')
          .and(($item) => {
            expect($item.closest('details'), `"${item}" inside a <details>`).to.have.length(0);
          });
      });

      card().then(($card) => {
        const root = $card[0];
        const view = root.ownerDocument.defaultView as Window;
        const scrolling = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))]
          .filter((element) => {
            const style = view.getComputedStyle(element);
            const scrollsY = ['auto', 'scroll'].includes(style.overflowY) && element.scrollHeight > element.clientHeight;
            const scrollsX = ['auto', 'scroll'].includes(style.overflowX) && element.scrollWidth > element.clientWidth;
            return scrollsY || scrollsX;
          })
          .map((element) => `<${element.tagName.toLowerCase()} class="${element.className}">`);
        expect(scrolling, 'elements in the card that scroll internally').to.deep.equal([]);
      });

      cy.document().then((doc) => {
        expect(doc.documentElement.scrollWidth, 'page scrollWidth').to.be.at.most(width);
      });
    });
  });

  it('C32: a slug that is not in the spot list renders not-found and no trip cost card', () => {
    stubSpotPage();
    visitSpot('no-such-spot');

    cy.contains('h2', 'Spot not found').should('be.visible');
    cy.get('section, [role="region"]').filter(named('Rough trip cost')).should('have.length', 0);
  });
});
