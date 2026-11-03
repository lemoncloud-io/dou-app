import nx from '@nx/eslint-plugin';

import baseConfig from '../../eslint.config.mjs';

export default [
    ...baseConfig,
    ...nx.configs['flat/react'],
    {
        files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
        // Override or add rules here
        rules: {},
    },
    // The main WebView and the sub WebView never import each other; they meet only in
    // `services/subWebView`. A shortcut either way would hand the sub page something of the main
    // WebView's (its injected globals, its handlers) or tie the main WebView to the sub one's screen.
    {
        files: ['src/app/subWebView/**', 'src/app/features/subWebView/**', 'src/app/services/subWebView/**'],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    patterns: [
                        {
                            // Any path through `webview/` but `webview/hooks/appEventContract`, the test
                            // support every event's colocated test shares; it has no runtime. A regex,
                            // since a group cannot re-include a file under a directory it excludes.
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
