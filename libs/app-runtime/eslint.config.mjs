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
    // ADR-0070 결정 1 규칙 1 — 스토어의 수동성.
    //
    // `session/store/**` stores and notifies. It must not reach sideways into the socket, data or
    // HTTP layers, nor into its sibling folders (auth · hooks · scope) — the direction runs the other
    // way, and opening the reverse would make the store a participant in the flows it is supposed to
    // merely record. `scope` is in the ban list even though the ADR text names only five folders:
    // scope subscribes to the store, so the reverse edge would be a cycle by the same reasoning.
    //
    // `configure.ts` is the one exemption: it is the deliberate env seam that injects the relay
    // endpoint resolvers, which is what keeps `relayStore` itself free of the dependency.
    // ---------------------------------------------------------------------------------------------
    {
        files: ['src/session/store/**/*.ts'],
        ignores: ['src/session/store/configure.ts'],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    patterns: [
                        {
                            group: [
                                '**/socket/**',
                                '**/data/**',
                                '**/http/**',
                                '../auth',
                                '../auth/*',
                                '../hooks',
                                '../hooks/*',
                                '../scope',
                                '../scope/*',
                            ],
                            message: 'session/store는 수동적이다 — 저장과 통지만 한다 (ADR-0070 결정 1 규칙 1).',
                        },
                        {
                            group: ['@chatic/web-config', '@chatic/web-core'],
                            message:
                                'env·레거시 표면 직접 import 금지 — 부팅이 주입한 값을 받아라. 주입 지점은 session/store/configure.ts (ADR-0070 결정 1 규칙 2).',
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
    // `src/http/refreshAbsence.test.ts`가 지킨다.
    //
    // 부재 검사가 더 강하다. 옛 규칙은 경로 문자열(`**/session/auth/api`)에 묶여 있어서 심볼이
    // `http/auth/refresh`로 옮겨가자 아무것도 매치하지 않은 채 **조용히** 죽었다 — 위반 파일이
    // lint를 통과했다. 부재 검사에는 그 실패 양식이 없다.
    // ---------------------------------------------------------------------------------------------
    {
        ignores: ['**/out-tsc'],
    },
];
