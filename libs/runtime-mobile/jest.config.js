module.exports = {
    // No jsdom: this package runs in React Native's JS process, not a page. The React Native modules
    // it reads are replaced by each test's own `jest.mock` factory, so no React Native preset (and no
    // native module) is loaded.
    testEnvironment: 'node',
    // `uuid` ships ESM-only; the declaration API this package hands on comes from runtime-client, whose
    // session device id makes one, so it must be transformed rather than passed through as CommonJS.
    transformIgnorePatterns: ['node_modules/(?!(@chatic|@lemoncloud|uuid)/)'],
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
