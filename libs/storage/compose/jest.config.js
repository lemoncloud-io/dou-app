module.exports = {
    displayName: 'storage-compose',
    testEnvironment: 'node',
    watchman: false,
    moduleNameMapper: {
        '^@chatic/storage-(compose|memory|web-local|web-session|vault-bridge)$': '<rootDir>/../$1/src/index.ts',
    },
    transform: {
        '^.+\\.[tj]sx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
    },
};
