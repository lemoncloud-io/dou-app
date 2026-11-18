module.exports = {
    // jsdom: these are a page's readers, so they are tested against a page's globals.
    testEnvironment: 'jsdom',
    // `@chatic/data` pulls the socket lib in, which touches TextEncoder at import time.
    setupFiles: ['<rootDir>/jest.setup.ts'],
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
