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
    // ---------------------------------------------------------------------------------------------
    // `@chatic/session` and `@chatic/transport` are open to this package, through their barrels.
    //
    // The root config closes both packages to everything else; these two blocks set the same rule
    // again for this package's files, keeping the root's `@chatic/data/*` ban. Production code takes
    // the barrels only. Tests may also name a file as `@chatic/<package>/<path>`. The reason is the
    // mock: a test that mocks a module must name that file, or the package's internal imports keep
    // the real one. A test then imports the same file's other symbols by the same path.
    // ---------------------------------------------------------------------------------------------
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
    // ---------------------------------------------------------------------------------------------
    // ADR-0070 결정 2 불변조건 1·2 — refresh 실행은 `ClientSocketAuth` 단독 소유.
    //
    // 여기 있던 `no-restricted-imports` 규칙은 사라졌다. 지킬 심볼이 없기 때문이다: refresh
    // 엔드포인트를 치는 코드가 이 패키지에 하나도 남지 않았고, 그 사실 자체를
    // `src/refreshAbsence.test.ts`가 지킨다.
    //
    // 부재 검사가 더 강하다. 옛 규칙은 경로 문자열(`**/session/auth/api`)에 묶여 있어서 심볼이
    // `http/auth/refresh`로 옮겨가자 아무것도 매치하지 않은 채 **조용히** 죽었다 — 위반 파일이
    // lint를 통과했다. 부재 검사에는 그 실패 양식이 없다.
    // ---------------------------------------------------------------------------------------------
    {
        ignores: ['**/out-tsc'],
    },
];
