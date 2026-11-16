import baseConfig from '../../eslint.config.mjs';

export default [
    ...baseConfig,
    // ---------------------------------------------------------------------------------------------
    // `@chatic/session` is open to this package, through its barrel: the web cache's tab store carries
    // a tab's invited clouds across from IndexedDB once, and needs the session's delegator and clouds
    // to do it. The root config closes it to everything else; this block sets the same rule again for
    // this package's files, which opens that one barrel and keeps every other closure — it replaces the
    // root's list, so each has to be repeated here.
    // ---------------------------------------------------------------------------------------------
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
