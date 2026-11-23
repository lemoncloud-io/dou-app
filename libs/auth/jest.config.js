module.exports = {
    testEnvironment: '<rootDir>/../../tools/jest/jsdom-environment.js',
    // `uuid` ships ESM-only and is reached through the libs below, so it is transformed too.
    transformIgnorePatterns: ['node_modules/(?!(@chatic|@lemoncloud|uuid)/)'],
    // The `@chatic/session` stores read `storage` from the `@chatic/shared` barrel, which carries
    // React components and their assets and styles. These entries are the ones
    // libs/runtime/jest.config.js uses for the same reach.
    moduleNameMapper: {
        '^@chatic/ui-kit/(.*)$': '<rootDir>/../ui-kit/src/$1',
        '^@chatic/assets$': '<rootDir>/__mocks__/assetsMock.js',
        // Before the generic rule, which would read `config/react` as a lib named `config/react`.
        '^@chatic/config/(.*)$': '<rootDir>/../config/src/$1/index.ts',
        // Tests only: a test that mocks a module names that file, so the mock reaches the owning
        // package's own importers too. Production code imports the barrels.
        '^@chatic/session/(.*)$': '<rootDir>/../session/src/$1',
        '^@chatic/transport/(.*)$': '<rootDir>/../transport/src/$1',
        '^@chatic/(.*)$': '<rootDir>/../$1/src/index.ts',
        '\\.(css|less|scss)$': '<rootDir>/../web-ui-kit/src/__mocks__/styleMock.js',
        '\\.(png|jpe?g|gif|svg|webp)$': '<rootDir>/../web-ui-kit/src/__mocks__/fileMock.js',
    },
    transform: {
        '^.+\\.[tj]sx?$': [
            'ts-jest',
            {
                tsconfig: '<rootDir>/tsconfig.spec.json',
                astTransformers: { before: ['<rootDir>/../../tools/jest/import-meta-transformer.js'] },
            },
        ],
    },
};
