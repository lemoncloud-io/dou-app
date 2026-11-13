module.exports = {
    // No jsdom: this package runs in React Native's JS process, not a page. The React Native modules
    // it reads are replaced by each test's own `jest.mock` factory, so no React Native preset (and no
    // native module) is loaded.
    testEnvironment: 'node',
    transformIgnorePatterns: ['node_modules/(?!(@chatic|@lemoncloud)/)'],
    moduleNameMapper: {
        '^@chatic/config/(.*)$': '<rootDir>/../config/src/$1/index.ts',
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
