import baseConfig from '../../eslint.config.mjs';

export default [
    ...baseConfig,
    {
        files: ['**/*.ts'],
        rules: {},
    },
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
                            group: [
                                '@chatic/sync',
                                '@chatic/sync/*',
                                '@chatic/auth',
                                '@chatic/auth/*',
                                '@chatic/runtime',
                            ],
                            message: 'This package sits below sync, auth and @chatic/runtime — it may not import them.',
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
                            group: [
                                '@chatic/sync',
                                '@chatic/sync/*',
                                '@chatic/auth',
                                '@chatic/auth/*',
                                '@chatic/runtime',
                            ],
                            message: 'This package sits below sync, auth and @chatic/runtime — it may not import them.',
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
