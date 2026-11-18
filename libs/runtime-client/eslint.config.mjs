import baseConfig, { noBridgesImport } from '../../eslint.config.mjs';

export default [
    ...baseConfig,
    // No `@chatic/bridges` in this package — the root config holds the pattern and says why. What the
    // page's host profile answers is handed in by app-runtime.
    noBridgesImport,
    // ---------------------------------------------------------------------------------------------
    // The core packages' barrels are open to this package: it is the side of the React surface that
    // calls them. The root config closes `@chatic/session`, `-transport`, `-sync`, `-auth` and
    // `-runtime-core` to everything else; these two blocks set the same rule again for this package's
    // files — they replace the root's list, so each ban kept has to be repeated. Production code takes
    // the barrels only. Tests may also name a file, so that a mock replaces it for every importer, the
    // owning package's own modules included, and to reach the fakes runtime-core keeps outside its
    // barrel (`@chatic/runtime-core/testing/*`).
    // ---------------------------------------------------------------------------------------------
    {
        files: ['**/*.ts'],
        ignores: ['**/*.test.ts', '**/*.spec.ts'],
        rules: {
            '@typescript-eslint/no-restricted-imports': [
                'error',
                {
                    patterns: [
                        {
                            group: ['@chatic/data/*'],
                            message:
                                'Import from the `@chatic/data` barrel. Paths inside it are closed — see libs/data/README.md.',
                        },
                        ...['session', 'transport', 'sync', 'auth', 'runtime-core'].map(name => ({
                            group: [`@chatic/${name}/*`],
                            message: `Import @chatic/${name} through its barrel. Deep paths are for test mocks only.`,
                        })),
                    ],
                },
            ],
        },
    },
    {
        files: ['**/*.test.ts', '**/*.spec.ts'],
        rules: {
            '@typescript-eslint/no-restricted-imports': [
                'error',
                {
                    patterns: [
                        {
                            group: ['@chatic/data/*'],
                            message:
                                'Import from the `@chatic/data` barrel. Paths inside it are closed — see libs/data/README.md.',
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
