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
        files: ['src/**/*.ts', 'src/**/*.tsx'],
        ignores: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'src/**/*.spec.ts', 'src/**/*.spec.tsx'],
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
                        {
                            group: ['@chatic/session/*'],
                            message: 'Import @chatic/session through its barrel. Deep paths are for test mocks only.',
                        },
                        {
                            group: ['@chatic/transport/*'],
                            message: 'Import @chatic/transport through its barrel. Deep paths are for test mocks only.',
                        },
                        {
                            group: ['@chatic/sync/*'],
                            message: 'Import @chatic/sync through its barrel. Deep paths are for test mocks only.',
                        },
                        {
                            group: ['@chatic/auth/*'],
                            message: 'Import @chatic/auth through its barrel. Deep paths are for test mocks only.',
                        },
                        {
                            group: [
                                '@chatic/runtime',
                                '@chatic/runtime/*',
                                '@chatic/runtime-core',
                                '@chatic/runtime-core/*',
                                '@chatic/runtime-client',
                                '@chatic/runtime-client/*',
                            ],
                            message:
                                'Inside @chatic/runtime, import another folder relatively. @chatic/runtime-core and @chatic/runtime-client only re-export this package — see libs/runtime/README.md.',
                        },
                    ],
                },
            ],
        },
    },
    {
        files: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'src/**/*.spec.ts', 'src/**/*.spec.tsx'],
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
                    ],
                },
            ],
        },
    },
    {
        ignores: ['**/out-tsc', 'react/**'],
    },
];
