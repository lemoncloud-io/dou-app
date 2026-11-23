import baseConfig from '../../eslint.config.mjs';

export default [
    ...baseConfig,
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
                        ...['session', 'transport', 'sync', 'auth'].map(name => ({
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
