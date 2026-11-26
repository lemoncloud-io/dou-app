module.exports = {
    testEnvironment: '<rootDir>/../../../tools/jest/jsdom-environment.js',
    setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts'],
    moduleNameMapper: {
        '\\.(png|jpe?g|gif|svg|webp)$': '<rootDir>/src/__mocks__/fileMock.js',
    },
    transform: {
        '^.+\\.[tj]sx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
    },
};
