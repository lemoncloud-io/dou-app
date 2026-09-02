module.exports = {
    // 전역 무접근 게이트 — navigator가 없는 환경에서 green인 것 자체가 전역 읽기 부재의 증명
    // (libs/auth-sign/docs/architecture.md §검증 방법). jsdom을 쓰지 않는다.
    testEnvironment: 'node',
    transformIgnorePatterns: ['node_modules/(?!(@chatic|@lemoncloud)/)'],
    moduleNameMapper: {
        '^@chatic/(.*)$': '<rootDir>/../$1/src/index.ts',
    },
    transform: {
        '^.+\\.[tj]sx?$': [
            'ts-jest',
            {
                tsconfig: '<rootDir>/tsconfig.spec.json',
            },
        ],
    },
};
