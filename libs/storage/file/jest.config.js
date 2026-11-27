module.exports = {
    displayName: 'storage-file',
    testEnvironment: 'node',
    watchman: false,
    moduleNameMapper: {
        '^@chatic/ports$': '<rootDir>/../../contracts/ports/src/index.ts',
        '^@chatic/(.*)$': '<rootDir>/../../$1/src/index.ts',
    },
    transform: {
        '^.+\\.[tj]sx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
    },
};
