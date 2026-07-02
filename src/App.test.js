import { render, screen, within } from '@testing-library/react';
import App from './App';

test('renders the refreshed landing page and primary navigation', () => {
  render(<App />);
  const primaryNav = screen.getByRole('navigation', { name: /primary navigation/i });

  expect(screen.getByText(/see the real route, the real stay, and the real trip total in one place/i)).toBeInTheDocument();
  expect(within(primaryNav).getByRole('link', { name: /home/i })).toBeInTheDocument();
  expect(within(primaryNav).getByRole('link', { name: /door-to-trip/i })).toBeInTheDocument();
  expect(within(primaryNav).getByRole('link', { name: /planner/i })).toBeInTheDocument();
  expect(within(primaryNav).queryByRole('link', { name: /assistant/i })).not.toBeInTheDocument();
  expect(within(primaryNav).getByRole('link', { name: /sign in/i })).toBeInTheDocument();
});
