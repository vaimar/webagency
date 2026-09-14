describe('profile.anon', () => {
  beforeEach(() => {
    cy.mockOfflineBackend();
  });

  it('shows anonymous profile copy and €100/day defaults', () => {
    cy.visit('/profile');

    cy.contains(/Anonymous/i, { timeout: 15_000 }).should('be.visible');
    cy.contains('€100/day').should('be.visible');
    cy.contains(/sign in/i).should('exist');
  });
});
