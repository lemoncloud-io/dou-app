module.exports = {
    testEnvironment: 'jsdom',
    setupFiles: ['<rootDir>/jest.setup.ts'],
    // `uuid` ships ESM-only; the migrated `useDynamicDeviceId` pulls it in, so it must be transformed
    // rather than passed through as CommonJS.
    transformIgnorePatterns: ['node_modules/(?!(@chatic|@lemoncloud|uuid)/)'],
    moduleNameMapper: {
        // Mirrors the `@chatic/ui-kit/*` path alias so subpath imports resolve to real files instead
        // of the greedy `libs/$1/src/index.ts` fallback below.
        '^@chatic/lib/utils$': '<rootDir>/../ui-kit/src/utils/index.ts',
        '^@chatic/ui-kit/(.*)$': '<rootDir>/../ui-kit/src/$1',
        // `@chatic/assets` lives at the repo ROOT (not libs/) and resolves image URLs with
        // `import.meta.url` — the greedy fallback would miss it and the transform cannot parse it.
        '^@chatic/assets$': '<rootDir>/__mocks__/assetsMock.js',
        // Before the generic rule: it would capture `config/react` and resolve a path that does not
        // exist (`libs/config/react/src`). Same rule as libs/shared/jest.config.js.
        '^@chatic/config/(.*)$': '<rootDir>/../config/src/$1/index.ts',
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
