import baseConfig from '../../eslint.config.mjs';

export default [
    ...baseConfig,
    {
        files: ['**/*.ts'],
        rules: {},
    },
    {
        files: ['src/store/**/*.ts'],
        ignores: ['src/store/configure.ts'],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    patterns: [
                        {
                            group: ['../scope', '../scope/*', '@chatic/runtime'],
                            message: 'The store is passive — it stores and notifies, and knows nothing above it.',
                        },
                        {
                            group: ['@chatic/config'],
                            message:
                                'Do not read settings here — take what boot injected. The seam is store/configure.ts.',
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
