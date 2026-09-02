// jest-dom adds custom matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, vi } from 'vitest';
import { TextDecoder, TextEncoder } from 'node:util';

// jsdom ships neither TextEncoder nor TextDecoder, but maplibre-gl reaches for
// them at import time. Without these, every suite that transitively imports a
// map — including App.test.tsx, the only test covering the router — fails to run
// at all with "TextDecoder is not defined".
if (typeof global.TextEncoder === 'undefined') (global as any).TextEncoder = TextEncoder;
if (typeof global.TextDecoder === 'undefined') (global as any).TextDecoder = TextDecoder;

// Same story: maplibre spins its worker up from a blob URL at import time, and
// jsdom implements neither side of the object-URL API. Nothing under test draws
// a real map, so these only need to exist, not to work.
if (typeof window !== 'undefined' && typeof window.URL.createObjectURL !== 'function') {
  window.URL.createObjectURL = () => 'blob:jsdom-stub';
  window.URL.revokeObjectURL = () => undefined;
}

// Node 25 ships its own `localStorage`/`sessionStorage` globals (the
// --localstorage-file experiment). They land on globalThis before the jsdom
// environment installs its own, and without the flag they are inert objects
// with no setItem/getItem at all — so anything that touches storage explodes
// with "setItem is not a function". Swap in a working in-memory Storage
// whenever the ambient one is unusable; on Node 22/24 jsdom's own survives and
// this is a no-op.
const installStorage = (key: 'localStorage' | 'sessionStorage'): void => {
  const existing = (window as unknown as Record<string, unknown>)[key] as Storage | undefined;
  if (existing && typeof existing.setItem === 'function') return;

  const entries = new Map<string, string>();
  const storage: Storage = {
    get length() { return entries.size; },
    key: (index: number) => [...entries.keys()][index] ?? null,
    getItem: (name: string) => (entries.has(name) ? entries.get(name)! : null),
    setItem: (name: string, value: string) => { entries.set(String(name), String(value)); },
    removeItem: (name: string) => { entries.delete(String(name)); },
    clear: () => { entries.clear(); },
  };

  Object.defineProperty(window, key, { configurable: true, writable: true, value: storage });
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: storage });
};

installStorage('localStorage');
installStorage('sessionStorage');

const createMockResponse = (
  body: unknown,
  init: { status?: number; statusText?: string; headers?: Record<string, string> } = {},
): Response => {
  const status = init.status ?? 200;
  const headers = init.headers ?? {};

  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: init.statusText ?? '',
    headers: {
      get: (name: string) => {
        const match = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase());
        return match ? match[1] : null;
      },
    },
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  } as unknown as Response;
};

beforeEach(() => {
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();

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
  vi.clearAllMocks();
});
