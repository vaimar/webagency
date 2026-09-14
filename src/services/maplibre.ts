/**
 * The one way the app imports MapLibre at runtime.
 *
 * MapLibre 6 ships as ES modules only, and inside a bundler it cannot find its
 * own worker from import.meta.url, so the app has to hand it a worker URL before
 * the first map is created. Vite's `?worker&url` bundles the worker together
 * with the shared chunk it imports. A plain `?url` copies the worker file alone,
 * its first import 404s and no tiles load.
 *
 * Importing MapLibre through this module guarantees the worker is set up
 * wherever a map is built, without pulling MapLibre into the entry chunk.
 * Type-only imports can keep coming straight from 'maplibre-gl'.
 */
import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

setWorkerUrl(workerUrl);

export * from 'maplibre-gl';
