describe('home.smoke', () => {
  it('renders shell + primary nav', () => {
    cy.mockOfflineBackend();
    cy.visit('/');

    cy.get('.app-shell').should('exist');
    cy.get('.site-header').should('be.visible');
    cy.get('.brand-mark').should('contain.text', 'TravelHub');

    // Primary nav (desktop header and/or mobile bottom) — not Hack flights.
    cy.contains('.site-nav__link, .mobile-bottom-nav__item', 'Home').should('exist');
    cy.contains('.site-nav__link, .mobile-bottom-nav__item', 'Spots').should('exist');
    cy.contains('.site-nav__link, .mobile-bottom-nav__item', 'Ski map').should('exist');
    cy.get('.site-nav, .mobile-bottom-nav').should('not.contain.text', 'Hack flights');
  });

  it('shows service banner with Try again when API is down', () => {
    cy.mockOfflineBackend();
    // Profile 401 would clear the outage flag (4xx = "listening"). Force a
    // transport failure here so two failed same-origin calls trip unreachable.
    cy.intercept('GET', '**/api/accounts/profile', { forceNetworkError: true });

    cy.visit('/');

    cy.get('.service-banner', { timeout: 20_000 }).should('be.visible');
    cy.get('.service-banner').should('not.contain.text', 'Failed to fetch');
    cy.contains('.service-banner__retry', 'Try again').should('be.visible');
  });
});
