import baseConfig from '../../eslint.config.mjs';

export default [
    ...baseConfig,
    {
        files: ['**/*.ts'],
        // Override or add rules here
        rules: {},
    },
    // ---------------------------------------------------------------------------------------------
    // `@chatic/session` and `@chatic/transport` are open to this package, through their barrels.
    //
    // The root config closes them to everything else; these two blocks set the same rule again for
    // this package's files, keeping the root's `@chatic/data/*` ban. Tests may also name a file as
    // `@chatic/<package>/<path>`, so that mocking it reaches that package's own importers.
    // ---------------------------------------------------------------------------------------------
    {
        files: ['src/**/*.ts'],
        ignores: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
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
                        {
                            group: ['@chatic/session/*'],
                            message: 'Import @chatic/session through its barrel. Deep paths are for test mocks only.',
                        },
                        {
                            group: ['@chatic/transport/*'],
                            message: 'Import @chatic/transport through its barrel. Deep paths are for test mocks only.',
                        },
                        {
                            group: ['@chatic/auth', '@chatic/auth/*', '@chatic/app-runtime'],
                            message: 'Auth sits beside this package and app-runtime above it — import neither.',
                        },
                        {
                            group: ['@chatic/sync', '@chatic/sync/*'],
                            message:
                                'Inside this package, import by relative path — its own barrel would close a cycle.',
                        },
                    ],
                },
            ],
        },
    },
    {
        files: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
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
                        {
                            group: ['@chatic/auth', '@chatic/auth/*', '@chatic/app-runtime'],
                            message: 'Auth sits beside this package and app-runtime above it — import neither.',
                        },
                        {
                            group: ['@chatic/sync', '@chatic/sync/*'],
                            message:
                                'Inside this package, import by relative path — its own barrel would close a cycle.',
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
