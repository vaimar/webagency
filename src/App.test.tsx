import { render, screen, within } from '@testing-library/react';
import App from './App';

/**
 * Smoke test for the app shell: the landing route renders and primary
 * navigation is present.
 *
 * The assertions here had gone stale — they looked for landing copy and a
 * "planner" nav link that were removed some time ago. Nobody noticed because
 * the suite could not load at all in jsdom, so it never got as far as failing.
 * They now match what the app actually renders.
 */
test('renders the landing page and primary navigation', () => {
  render(<App />);
  const primaryNav = screen.getByRole('navigation', { name: /primary navigation/i });

  expect(screen.getByText(/find the park\. know what riding it actually costs\./i)).toBeInTheDocument();

  // Primary nav is Home, the front door (Spots), and the ski map. Hack Flights
  // is deliberately absent: the beta ships as spot discovery because the fare
  // provider cannot state which dates its prices apply to, and promoting a
  // route tool to primary navigation implies a pricing promise the data cannot
  // support. Restore it here only when fare coverage carries a travel window.
  expect(within(primaryNav).getByRole('link', { name: /home/i })).toBeInTheDocument();
  expect(within(primaryNav).getByRole('link', { name: /spots/i })).toBeInTheDocument();
  expect(within(primaryNav).getByRole('link', { name: /ski map/i })).toBeInTheDocument();
  expect(within(primaryNav).queryByRole('link', { name: /hack flights/i })).not.toBeInTheDocument();
  expect(within(primaryNav).getAllByRole('link')).toHaveLength(3);

  // Demoted, not removed. The footer is what guarantees it stays reachable.
  expect(within(primaryNav).queryByRole('link', { name: /door-to-trip/i })).not.toBeInTheDocument();

  const footer = document.querySelector('.site-footer')!;
  const footerHrefs = [...footer.querySelectorAll('a')].map((a) => a.getAttribute('href'));
  ['/explore', '/stay-guide', '/island-hop', '/trip-ledger', '/ski-map', '/ski-windows', '/hack-flights']
    .forEach((href) => expect(footerHrefs).toContain(href));

  // Account state deliberately sits outside the nav landmark — it is status,
  // not navigation. It renders twice: once in the header, once in the mobile bar.
  expect(within(primaryNav).queryByRole('link', { name: /sign in/i })).not.toBeInTheDocument();
  expect(screen.getAllByRole('link', { name: /sign in/i }).length).toBeGreaterThan(0);
});

/**
 * The launch position, pinned.
 *
 * The catalogue audit measured zero flight-led trip-ready records from Dublin:
 * the fare provider ignores its `date` parameter, so no door-to-door total can
 * be stood behind. Copy that promises one would reproduce, in our own
 * marketing, exactly the gap between headline and reality this product exists
 * to expose. These assertions fail if that promise creeps back in.
 */
test('does not promise a door-to-door trip cost it cannot verify', () => {
  render(<App />);

  const body = document.body.textContent ?? '';

  // Phrase-matching alone proved too narrow: the first version of this test
  // passed while the hero panel still promised "the fare, the cabin bag, the
  // airport transfer and a single audited total" — the same claim, reworded.
  // These patterns cover the claim, not one phrasing of it.
  expect(body).not.toMatch(/what the trip really costs/i);
  expect(body).not.toMatch(/door.to.door/i);
  expect(body).not.toMatch(/single audited total/i);
  expect(body).not.toMatch(/price a flight/i);
  expect(body).not.toMatch(/extras included/i);

  // The boundary has to be stated, not merely implied by omission.
  expect(screen.getByText(/beta · spot discovery/i)).toBeInTheDocument();
  expect(body).toMatch(/pricing the flight to the park is still in development/i);
});

test('does not show the service banner while the backend is answering', () => {
  render(<App />);

  // setupTests stubs fetch with 200s, so nothing has failed and the shell
  // should stay quiet.
  expect(screen.queryByText(/live travel data is unavailable/i)).not.toBeInTheDocument();
});
