/**
 * Single place that reads build/deploy configuration.
 *
 * Vite exposes variables on `import.meta.env`, not `process.env`, and there is
 * no `process` global in the browser bundle at all. Tests, however, run in Node
 * under Vitest and set `process.env` directly, so both sources are consulted:
 * `import.meta.env` wins, `process.env` is the fallback.
 *
 * The `REACT_APP_` prefix is kept deliberately (see `envPrefix` in
 * vite.config.ts) — those names are already configured in Netlify and Railway,
 * and renaming them would break a deploy that nothing in this repo can verify.
 */

type EnvBag = Record<string, string | undefined>;

const viteEnv = import.meta.env as unknown as EnvBag;

const processEnv = (): EnvBag => (
    typeof process !== 'undefined' && process.env ? (process.env as EnvBag) : {}
);

export const readEnv = (key: string): string | undefined => viteEnv[key] ?? processEnv()[key];

/** True under `vite build` / `vite preview`, false in dev and in tests. */
export const isProduction = (): boolean => (
    import.meta.env.PROD === true && processEnv().NODE_ENV !== 'test'
);

/** True when running under Vitest (or any Node runner with NODE_ENV=test). */
export const isTest = (): boolean => (
    import.meta.env.MODE === 'test' || processEnv().NODE_ENV === 'test'
);
