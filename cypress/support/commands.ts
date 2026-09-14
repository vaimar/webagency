/**
 * Stub the backend so Cypress never reaches Railway / localhost:9090.
 *
 * With REACT_APP_API_BASE unset in Vite dev, API_BASE is '' (same-origin
 * /api + /actuator via the Vite proxy). Intercepting those paths is enough.
 *
 * Cypress matches intercepts in reverse registration order (last wins), so
 * register catch-alls first and specific routes after.
 */

const STUB_HEADERS = { 'content-type': 'application/json' };

Cypress.Commands.add('mockOfflineBackend', () => {
  // Catch-alls first (lowest priority).
  cy.intercept('**/actuator/**', {
    statusCode: 503,
    headers: STUB_HEADERS,
    body: { message: 'Service unavailable' },
  }).as('actuatorAny');

  // Network errors count toward the unreachable banner (threshold = 2).
  cy.intercept('**/api/**', { forceNetworkError: true }).as('apiAny');

  // Specific routes win over the catch-alls.
  cy.intercept('GET', '**/actuator/health', {
    statusCode: 503,
    headers: STUB_HEADERS,
    body: { status: 'DOWN' },
  }).as('health');

  cy.intercept('GET', '**/api/accounts/profile', {
    statusCode: 401,
    headers: STUB_HEADERS,
    body: { message: 'Unauthorized' },
  }).as('profile');

  // Spots: HTTP 503 so SpotFinder maps to "unavailable" (not a thrown TypeError
  // that could look like Failed to fetch in some paths).
  cy.intercept('GET', '**/api/destinations/spots*', {
    statusCode: 503,
    headers: STUB_HEADERS,
    body: { message: 'Service unavailable' },
  }).as('spotsDown');
});

Cypress.Commands.add('mockSpotsFixture', () => {
  cy.intercept('**/actuator/**', {
    statusCode: 200,
    headers: STUB_HEADERS,
    body: { status: 'UP' },
  });

  cy.intercept('**/api/**', {
    statusCode: 404,
    headers: STUB_HEADERS,
    body: { message: 'Not stubbed' },
  });

  cy.intercept('GET', '**/actuator/health', {
    statusCode: 200,
    headers: STUB_HEADERS,
    body: { status: 'UP' },
  }).as('healthUp');

  cy.intercept('GET', '**/api/accounts/profile', {
    statusCode: 401,
    headers: STUB_HEADERS,
    body: { message: 'Unauthorized' },
  }).as('profile');

  cy.intercept('GET', '**/api/destinations/spots*', {
    fixture: 'spots-wakeboarding.json',
  }).as('spotsFixture');
});

declare global {
  namespace Cypress {
    interface Chainable {
      mockOfflineBackend(): Chainable<void>;
      mockSpotsFixture(): Chainable<void>;
    }
  }
}

export {};
