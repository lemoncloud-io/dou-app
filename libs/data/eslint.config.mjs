import baseConfig, { noBridgesImport } from '../../eslint.config.mjs';

export default [
    ...baseConfig,
    {
        files: ['**/*.ts'],
        // Override or add rules here
        rules: {},
    },
    // No `@chatic/bridges` in this package — the root config holds the pattern and says why.
    noBridgesImport,
    {
        ignores: ['**/out-tsc'],
    },
];
