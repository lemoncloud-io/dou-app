import baseConfig, { noBridgesImport } from '../../eslint.config.mjs';

export default [
    ...baseConfig,
    // No `@chatic/bridges` in this package — the root config holds the pattern and says why.
    noBridgesImport,
    // ---------------------------------------------------------------------------------------------
    // The core packages' barrels are open to this package: the ports it collects are declared in
    // them. The root config closes `@chatic/session`, `-transport`, `-sync` and `-auth` to everything
    // else; this block sets the same rule again for this package's files, which opens the four
    // barrels and keeps every deep-path ban — this one replaces the root's list, so each has to be
    // repeated here.
    // ---------------------------------------------------------------------------------------------
    {
        files: ['**/*.ts'],
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
