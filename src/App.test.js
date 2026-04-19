import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the refreshed landing page and primary navigation', () => {
  render(<App />);
  expect(screen.getByText(/travel planning that feels modern/i)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /overview/i })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /discover fares/i })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /travel planner/i })).toBeInTheDocument();
});
