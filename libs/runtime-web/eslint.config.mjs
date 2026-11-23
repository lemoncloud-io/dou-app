import baseConfig from '../../eslint.config.mjs';

export default [
    ...baseConfig,
    {
        files: ['**/*.ts'],
        rules: {
            '@typescript-eslint/no-restricted-imports': [
                'error',
                {
                    paths: ['auth', 'sync', 'transport'].map(name => ({
                        name: `@chatic/${name}`,
                        message: `@chatic/${name} is for the runtime modules; an adapter fills ports and reads none of it.`,
                    })),
                    patterns: [
                        {
                            group: ['@chatic/data/*'],
                            message:
                                'Import from the `@chatic/data` barrel. Paths inside it are closed — see libs/data/README.md.',
                        },
                        ...['session', 'transport', 'sync', 'auth'].map(name => ({
                            group: [`@chatic/${name}/*`],
                            message: `Import @chatic/${name} through its barrel.`,
                        })),
                    ],
                },
            ],
        },
    },
    {
        ignores: ['**/out-tsc'],
    },
];
