module.exports = {
    testEnvironment: 'jsdom',
    // The re-exported packages pull the socket lib in, which touches TextEncoder at import time.
    setupFiles: ['<rootDir>/jest.setup.ts'],
    // `uuid` ships ESM-only and runtime-client's session device id makes one, so it must be transformed
    // rather than passed through as CommonJS.
    transformIgnorePatterns: ['node_modules/(?!(@chatic|@lemoncloud|uuid)/)'],
    moduleNameMapper: {
        // Before the generic rule, which would read `config/react` as a lib named `config/react`, and the
        // two `/host` entries this shim re-exports from as libs named `runtime-client/host` and so on.
        '^@chatic/config/(.*)$': '<rootDir>/../config/src/$1/index.ts',
        '^@chatic/runtime-client/host$': '<rootDir>/../runtime-client/src/host/index.ts',
        '^@chatic/runtime-web/host$': '<rootDir>/../runtime-web/src/hostCapabilities/index.ts',
        '^@chatic/(.*)$': '<rootDir>/../../libs/$1/src/index.ts',
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
