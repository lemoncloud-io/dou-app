import nx from '@nx/eslint-plugin';

import baseConfig, { webStorageBanAfterReact } from '../../eslint.config.mjs';

export default [
    ...baseConfig,
    ...nx.configs['flat/react'],
    webStorageBanAfterReact,
    {
        files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
        rules: {},
    },
    {
        files: ['src/app/subWebView/**', 'src/app/features/subWebView/**', 'src/app/services/subWebView/**'],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    patterns: [
                        {
                            regex: '(^|/)webview(/(?!hooks/appEventContract$).*)?$',
                            message: 'The sub WebView must not reach into the main WebView.',
                        },
                    ],
                },
            ],
        },
    },
    {
        files: ['src/app/webview/**'],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    patterns: [
                        {
                            group: [
                                '**/subWebView',
                                '**/subWebView/**',
                                '!**/services/subWebView',
                                '!**/services/subWebView/**',
                            ],
                            message: 'The main WebView reaches the sub WebView only through services/subWebView.',
                        },
                    ],
                },
            ],
        },
    },
    {
        ignores: ['public', '.cache', 'node_modules', '**/out-tsc'],
    },
];
