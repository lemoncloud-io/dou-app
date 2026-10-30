import baseConfig from '../../eslint.config.mjs';

export default [
    ...baseConfig,
    {
        files: ['**/*.ts'],
        // Override or add rules here
        rules: {},
    },
    // ---------------------------------------------------------------------------------------------
    // The store is passive: it stores and notifies, nothing else.
    //
    // `store/**` must not reach into `scope/` — scope subscribes to the store, so the reverse edge
    // would be a cycle — nor read settings itself. Endpoints and other settings are injected at boot
    // through `configure.ts`, the one file exempt here, which is what keeps `relayStore` free of the
    // dependency. Nothing in this package may import the runtime that sits above it; the package
    // graph refuses that cycle for every file, and this names it for the store.
    // ---------------------------------------------------------------------------------------------
    {
        files: ['src/store/**/*.ts'],
        ignores: ['src/store/configure.ts'],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    patterns: [
                        {
                            group: ['../scope', '../scope/*', '@chatic/app-runtime'],
                            message: 'The store is passive — it stores and notifies, and knows nothing above it.',
                        },
                        {
                            group: ['@chatic/config'],
                            message:
                                'Do not read settings here — take what boot injected. The seam is store/configure.ts.',
                        },
                    ],
                },
            ],
        },
    },
    {
        ignores: ['**/out-tsc'],
    },
];
