import js from '@eslint/js';
import globals from 'globals';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

/**
 * Replaces CRA's built-in `react-app` ESLint config, which disappeared with
 * react-scripts. `npm run build` no longer lints as a side effect, so `npm run
 * lint` is a separate CI gate.
 */
// The jsx-a11y rules CRA's `react-app` config actually ran, at the severity it
// ran them. The plugin's own `recommended` set is considerably wider and lights
// up ~50 more pre-existing spots; adopting it is a worthwhile follow-up, but it
// is not part of swapping the build tool, and the extra noise would bury the
// findings that were being gated before.
const craAccessibilityRules = {
    plugins: { 'jsx-a11y': jsxA11y },
    rules: {
        'jsx-a11y/alt-text': 'warn',
        'jsx-a11y/anchor-has-content': 'warn',
        'jsx-a11y/anchor-is-valid': ['warn', { aspects: ['noHref', 'invalidHref'] }],
        'jsx-a11y/aria-activedescendant-has-tabindex': 'warn',
        'jsx-a11y/aria-props': 'warn',
        'jsx-a11y/aria-proptypes': 'warn',
        'jsx-a11y/aria-role': ['warn', { ignoreNonDOM: true }],
        'jsx-a11y/aria-unsupported-elements': 'warn',
        'jsx-a11y/heading-has-content': 'warn',
        'jsx-a11y/iframe-has-title': 'warn',
        'jsx-a11y/img-redundant-alt': 'warn',
        'jsx-a11y/no-access-key': 'warn',
        'jsx-a11y/no-autofocus': ['warn', { ignoreNonDOM: true }],
        'jsx-a11y/no-distracting-elements': 'warn',
        'jsx-a11y/no-redundant-roles': 'warn',
        'jsx-a11y/role-has-required-aria-props': 'warn',
        'jsx-a11y/role-supports-aria-props': 'warn',
        'jsx-a11y/scope': 'warn',
    },
};

export default tseslint.config(
    { ignores: ['build/**', 'coverage/**', 'node_modules/**', '.netlify/**'] },

    js.configs.recommended,
    ...tseslint.configs.recommended,
    craAccessibilityRules,
    reactHooks.configs.flat['recommended-latest'],

    {
        files: ['**/*.{ts,tsx,js,jsx,mjs}'],
        languageOptions: {
            ecmaVersion: 2022,
            globals: { ...globals.browser, ...globals.es2021 },
        },
        plugins: { 'react-refresh': reactRefresh },
        rules: {
            'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
            // react-hooks v7 ships the React Compiler rules, which CRA's config
            // never ran. They flag 33 pre-existing spots across the app — real
            // enough to keep visible, but working through them is a refactor of
            // its own, not part of swapping the build tool. Warn for now;
            // rules-of-hooks and exhaustive-deps stay errors, and both are clean.
            'react-hooks/set-state-in-effect': 'warn',
            'react-hooks/refs': 'warn',
            // The codebase leans on `any` in a few test doubles and third-party
            // boundaries; flagging every one would drown the signal.
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unused-vars': ['error', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
                caughtErrorsIgnorePattern: '^_',
            }],
        },
    },

    {
        files: ['src/**/*.{test,spec}.{ts,tsx,js,jsx}', 'src/setupTests.ts'],
        languageOptions: { globals: { ...globals.node, ...globals.browser } },
    },

    {
        files: ['scripts/**/*.mjs', 'netlify/**/*.js', 'vite.config.ts', 'eslint.config.js', 'security-headers.js'],
        languageOptions: { globals: globals.node },
    },
);
