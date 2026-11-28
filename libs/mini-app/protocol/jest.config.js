module.exports = {
    displayName: 'mini-app-protocol',
    testEnvironment: 'node',
    watchman: false,
    moduleNameMapper: {
        '^@chatic/mini-app-(protocol|host)$': '<rootDir>/../$1/src/index.ts',
        '^@chatic/(.*)$': '<rootDir>/../../$1/src/index.ts',
    },
    transform: {
        '^.+\\.[tj]sx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
    },
};
