import { render, screen, within } from '@testing-library/react';
import App from './App';

test('renders the refreshed landing page and primary navigation', () => {
  render(<App />);
  const primaryNav = screen.getByRole('navigation', { name: /primary navigation/i });

  expect(screen.getByText(/find flights, plan trips, and discover your next adventure/i)).toBeInTheDocument();
  expect(within(primaryNav).getByRole('link', { name: /home/i })).toBeInTheDocument();
  expect(within(primaryNav).getByRole('link', { name: /flights/i })).toBeInTheDocument();
  expect(within(primaryNav).getByRole('link', { name: /trip planner/i })).toBeInTheDocument();
  expect(within(primaryNav).getByRole('link', { name: /ai assistant/i })).toBeInTheDocument();
});
