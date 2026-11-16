import baseConfig from '../../eslint.config.mjs';

export default [
    ...baseConfig,
    {
        files: ['**/*.ts'],
        rules: {},
    },
    {
        ignores: ['**/out-tsc'],
    },
];
