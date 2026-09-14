describe('spots.fixture', () => {
  beforeEach(() => {
    cy.mockSpotsFixture();
  });

  it('renders at least one destinationLabel from the fixture', () => {
    cy.visit('/spots');

    cy.wait('@spotsFixture');
    cy.contains('EXO 38 Wakepark', { timeout: 15_000 }).should('be.visible');
    cy.get('.spot-gallery__name, .spot-row__name, body').should('contain.text', 'EXO 38 Wakepark');
  });
});
