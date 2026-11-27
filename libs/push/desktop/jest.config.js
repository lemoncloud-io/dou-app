module.exports = {
    testEnvironment: 'node',
    watchman: false,
    transform: {
        '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
    },
};
