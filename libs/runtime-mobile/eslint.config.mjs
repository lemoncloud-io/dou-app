import baseConfig from '../../eslint.config.mjs';

export default [
    ...baseConfig,
    // ---------------------------------------------------------------------------------------------
    // `@chatic/runtime-core` is open to this package: it is the native adapter, and building the
    // runtime from the native ports is what it is for. The root config closes runtime-core to every
    // package; this block sets the same rule again for this package's files, which opens that one
    // barrel and keeps every other closure — it replaces the root's list, so each has to be repeated
    // here.
    // ---------------------------------------------------------------------------------------------
    {
        files: ['**/*.ts'],
        rules: {
            '@typescript-eslint/no-restricted-imports': [
                'error',
                {
                    paths: ['session', 'auth', 'sync', 'transport'].map(name => ({
                        name: `@chatic/${name}`,
                        message: `@chatic/${name} is for the runtime modules; an adapter fills ports and reads none of it.`,
                    })),
                    patterns: [
                        {
                            group: ['@chatic/data/*'],
                            message:
                                'Import from the `@chatic/data` barrel. Paths inside it are closed — see libs/data/README.md.',
                        },
                        {
                            group: ['@chatic/runtime-core/*'],
                            message: 'Import @chatic/runtime-core through its barrel.',
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
