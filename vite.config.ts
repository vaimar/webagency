import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
// Plain JS, shared with the header-sync scripts so the policy has one home.
import { previewSecurityHeaders } from './security-headers.js';

// The Spring Boot backend the dev server proxies to. This replaces the CRA
// `proxy` field in package.json, which Vite does not read.
const BACKEND_ORIGIN = 'http://localhost:9090';

export default defineConfig({
    plugins: [react()],

    // Deploy config in three places (netlify.toml, nginx.conf, Dockerfile) is
    // written against CRA's layout, so keep it: `build/` as the output root and
    // `static/` as the hashed-asset directory. Both have long-lived
    // `Cache-Control: immutable` rules pinned to those paths.
    build: {
        outDir: 'build',
        assetsDir: 'static',
        sourcemap: true,
    },

    // The deployed environments (Netlify, Railway) already have REACT_APP_*
    // variables configured. Accepting that prefix alongside Vite's own means
    // the migration does not require renaming anything in a deploy dashboard.
    envPrefix: ['REACT_APP_', 'VITE_'],

    // `npm run preview` serves build/ with the *production* header policy, so a
    // CSP violation shows up locally instead of on the public domain.
    preview: {
        port: 3002,
        headers: previewSecurityHeaders(),
        // In production Netlify's edge function makes /api and /actuator
        // same-origin. Mirroring that here is what lets the post-deploy smoke
        // test run against a local build and mean something.
        proxy: {
            '/api': { target: BACKEND_ORIGIN, changeOrigin: true },
            '/actuator': { target: BACKEND_ORIGIN, changeOrigin: true },
        },
    },

    server: {
        port: 3000,
        proxy: {
            '/api': { target: BACKEND_ORIGIN, changeOrigin: true },
            '/actuator': { target: BACKEND_ORIGIN, changeOrigin: true },
        },
    },

    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: ['./src/setupTests.ts'],
        css: false,
        include: ['src/**/*.{test,spec}.{js,jsx,ts,tsx}'],
        // maplibre-gl and the FontAwesome icon packs are large enough that the
        // default 5s timeout trips on a cold transform of the first suite.
        testTimeout: 15_000,
    },
});
