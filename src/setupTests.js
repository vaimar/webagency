// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

const createMockResponse = (body, init = {}) => ({
  ok: (init.status ?? 200) >= 200 && (init.status ?? 200) < 300,
  status: init.status ?? 200,
  statusText: init.statusText ?? '',
  headers: {
	get: (name) => {
	  const headers = init.headers ?? {};
	  const match = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase());
	  return match ? match[1] : null;
	},
  },
  json: async () => body,
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
});

beforeEach(() => {
  global.fetch = jest.fn(async (input) => {
	const url = typeof input === 'string' ? input : input.url;

	if (url.includes('/api/accounts/profile') || url.includes('/api/accounts/preferences')) {
	  return createMockResponse({}, {
		status: 403,
		statusText: 'Forbidden',
		headers: { 'Content-Type': 'application/json' },
	  });
	}

	return createMockResponse({}, {
	  status: 200,
	  statusText: 'OK',
	  headers: { 'Content-Type': 'application/json' },
	});
  });
});

afterEach(() => {
  jest.clearAllMocks();
});

