module.exports = {
    testEnvironment: 'jsdom',
    // `@chatic/data` pulls the socket lib in, which touches TextEncoder at import time.
    setupFiles: ['<rootDir>/jest.setup.ts'],
    // `uuid` ships ESM-only and is reached through the libs below, so it is transformed too.
    transformIgnorePatterns: ['node_modules/(?!(@chatic|@lemoncloud|uuid)/)'],
    // The `@chatic/session` stores read `storage` from the `@chatic/shared` barrel, which carries
    // React components and their assets and styles. These entries are the ones
    // libs/app-runtime/jest.config.js uses for the same reach.
    moduleNameMapper: {
        '^@chatic/lib/utils$': '<rootDir>/../ui-kit/src/utils/index.ts',
        '^@chatic/ui-kit/(.*)$': '<rootDir>/../ui-kit/src/$1',
        '^@chatic/assets$': '<rootDir>/__mocks__/assetsMock.js',
        // Before the generic rule, which would read `config/react` as a lib named `config/react`.
        '^@chatic/config/(.*)$': '<rootDir>/../config/src/$1/index.ts',
        // Tests only: a test that mocks a store file names that file, so the mock reaches the
        // session package's own importers too. Production code imports the barrel.
        '^@chatic/session/(.*)$': '<rootDir>/../session/src/$1',
        '^@chatic/(.*)$': '<rootDir>/../$1/src/index.ts',
        '\\.(css|less|scss)$': '<rootDir>/../web-ui-kit/src/__mocks__/styleMock.js',
        '\\.(png|jpe?g|gif|svg|webp)$': '<rootDir>/../web-ui-kit/src/__mocks__/fileMock.js',
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
