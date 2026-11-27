module.exports = {
    displayName: 'storage-memory',
    testEnvironment: 'node',
    watchman: false,
    transform: {
        '^.+\\.[tj]sx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
    },
};
