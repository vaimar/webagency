describe('spots.offline', () => {
  beforeEach(() => {
    cy.mockOfflineBackend();
  });

  it('shows human unavailable copy + Try again, never raw Failed to fetch', () => {
    cy.visit('/spots');

    cy.contains('.spot-finder__load-error-title', 'Spot catalogue is unavailable', {
      timeout: 15_000,
    }).should('be.visible');
    cy.get('.spot-finder__load-error').should('be.visible');
    cy.contains('.spot-finder__load-error-retry', 'Try again').should('be.visible');

    cy.get('body').should('not.contain.text', 'Failed to fetch');
    cy.get('.spot-finder__load-error').should('not.contain.text', 'Failed to fetch');
  });
});
