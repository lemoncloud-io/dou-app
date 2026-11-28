import baseConfig from '../../eslint.config.mjs';

export default [
    ...baseConfig,
    {
        files: ['**/*.ts'],
        rules: {
            '@typescript-eslint/no-restricted-imports': [
                'error',
                {
                    paths: [
                        ...['auth', 'sync', 'transport'].map(name => ({
                            name: `@chatic/${name}`,
                            message: `@chatic/${name} is for the runtime modules; an adapter fills ports and reads none of it.`,
                        })),
                        ...['@chatic/bridges', '@chatic/bridge-client', '@chatic/bridge-host'].map(name => ({
                            name,
                            allowTypeImports: true,
                            message:
                                'runtime-web is browser-only: it never talks to a shell. Shell delegation lives in @chatic/runtime-hybrid-web.',
                        })),
                        {
                            name: '@chatic/runtime-hybrid-web',
                            message: 'runtime-hybrid-web is built on runtime-web, never the other way round.',
                        },
                    ],
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
