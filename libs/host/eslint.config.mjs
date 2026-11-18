import baseConfig from '../../eslint.config.mjs';

export default [
    ...baseConfig,
    // ---------------------------------------------------------------------------------------------
    // `@chatic/runtime-client/host` is open to this package: it is a transition shim that re-exports the
    // host ports' contracts and holder from there. The root config closes runtime-client to everything
    // else; this block sets the same rule again for this package's files — it replaces the root's list,
    // so each ban kept has to be repeated.
    // ---------------------------------------------------------------------------------------------
    {
        files: ['**/*.ts'],
        rules: {
            '@typescript-eslint/no-restricted-imports': [
                'error',
                {
                    paths: ['session', 'auth', 'sync', 'transport', 'runtime-core'].map(name => ({
                        name: `@chatic/${name}`,
                        message: `@chatic/${name} is for the runtime modules; this shim re-exports the host ports only.`,
                    })),
                    patterns: [
                        {
                            group: ['@chatic/data/*'],
                            message:
                                'Import from the `@chatic/data` barrel. Paths inside it are closed — see libs/data/README.md.',
                        },
                        // `@chatic/runtime-client/host` is the one deep path open here: the holder and the
                        // contracts without the engine behind the barrel.
                        ...['session', 'transport', 'sync', 'auth', 'runtime-core'].map(name => ({
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
