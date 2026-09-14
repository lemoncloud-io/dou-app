module.exports = {
    // The no-globals gate: passing in an environment that has no `navigator` is itself the evidence
    // that nothing reads one (libs/auth-sign/README.md, "How to verify"). Do not switch to jsdom.
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
