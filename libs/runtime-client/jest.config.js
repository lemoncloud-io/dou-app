module.exports = {
    // No jsdom: this package may not reach for `document` or `window` — what only a page knows is
    // handed in by @chatic/runtime — and running its tests where those do not exist keeps that honest.
    testEnvironment: 'node',
    setupFiles: ['<rootDir>/jest.setup.ts'],
    // `uuid` ships ESM-only; the session's device id makes one, so it must be transformed rather than
    // passed through as CommonJS.
    transformIgnorePatterns: ['node_modules/(?!(@chatic|@lemoncloud|uuid)/)'],
    moduleNameMapper: {
        // Before the generic rule, which would read `config/react` as a lib named `config/react`.
        '^@chatic/config/(.*)$': '<rootDir>/../config/src/$1/index.ts',
        // Tests only: a test that mocks a module of a core package names that file, so the mock
        // replaces it for every importer — that package's own modules included — and reaches the
        // fakes runtime-core keeps outside its barrel (`testing/`). Production code imports the
        // barrels alone; eslint keeps it that way.
        '^@chatic/session/(.*)$': '<rootDir>/../session/src/$1',
        '^@chatic/transport/(.*)$': '<rootDir>/../transport/src/$1',
        '^@chatic/runtime-core/(.*)$': '<rootDir>/../runtime-core/src/$1',
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
