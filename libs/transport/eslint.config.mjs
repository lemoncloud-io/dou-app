import baseConfig from '../../eslint.config.mjs';

export default [
    ...baseConfig,
    {
        files: ['**/*.ts'],
        // Override or add rules here
        rules: {},
    },
    // ---------------------------------------------------------------------------------------------
    // `@chatic/session` is open to this package, through its barrel.
    //
    // The root config closes it to everything else; these two blocks set the same rule again for
    // this package's files, keeping the root's `@chatic/data/*` ban. Tests may also name a session
    // file as `@chatic/session/<path>`, so that mocking it reaches the session package's own importers.
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
                            group: ['@chatic/sync', '@chatic/sync/*', '@chatic/app-runtime'],
                            message: 'This package sits below sync and app-runtime — it may not import them.',
                        },
                        {
                            group: ['@chatic/transport', '@chatic/transport/*'],
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
                            group: ['@chatic/sync', '@chatic/sync/*', '@chatic/app-runtime'],
                            message: 'This package sits below sync and app-runtime — it may not import them.',
                        },
                        {
                            group: ['@chatic/transport', '@chatic/transport/*'],
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
