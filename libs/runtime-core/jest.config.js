module.exports = {
    // No jsdom: this package may not reach for `document` or `window`, and running its tests where
    // those do not exist keeps them honest. It is not a full check — Node itself has `fetch` and
    // `navigator` — which is the compiler's job (`tsconfig.lib.json` has neither DOM nor Node types).
    // A test whose fixtures play a page (an address, web storage, a hidden document) says so with a
    // `@jest-environment jsdom` docblock of its own.
    testEnvironment: 'node',
    // jsdom (the docblock above) has no TextEncoder, which the socket lib touches at import time.
    setupFiles: ['<rootDir>/jest.setup.ts'],
    transformIgnorePatterns: ['node_modules/(?!(@chatic|@lemoncloud)/)'],
    moduleNameMapper: {
        // Before the generic rule, which would read `config/react` as a lib named `config/react`.
        '^@chatic/config/(.*)$': '<rootDir>/../config/src/$1/index.ts',
        // Tests only: a test that mocks a module of a core package names that file, so the mock
        // replaces it for every importer — that package's own modules included. Production code
        // imports the barrels alone; eslint keeps it that way.
        '^@chatic/session/(.*)$': '<rootDir>/../session/src/$1',
        '^@chatic/transport/(.*)$': '<rootDir>/../transport/src/$1',
        '^@chatic/sync/(.*)$': '<rootDir>/../sync/src/$1',
        '^@chatic/auth/(.*)$': '<rootDir>/../auth/src/$1',
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
