module.exports = {
    testEnvironment: 'jsdom',
    setupFiles: ['<rootDir>/jest.setup.ts'],
    // `uuid` ships ESM-only; the migrated `useDynamicDeviceId` pulls it in, so it must be transformed
    // rather than passed through as CommonJS.
    transformIgnorePatterns: ['node_modules/(?!(@chatic|@lemoncloud|uuid)/)'],
    moduleNameMapper: {
        // Mirrors the `@chatic/ui-kit/*` path alias so subpath imports resolve to real files instead
        // of the greedy `libs/$1/src/index.ts` fallback below. Reached through the migrated session
        // hooks (`useServiceUnavailable` renders a fallback screen).
        '^@chatic/lib/utils$': '<rootDir>/../ui-kit/src/utils/index.ts',
        '^@chatic/ui-kit/(.*)$': '<rootDir>/../ui-kit/src/$1',
        // `@chatic/assets` lives at the repo ROOT (not libs/) and resolves image URLs with
        // `import.meta.url` — the greedy fallback would miss it and the transform cannot parse it.
        '^@chatic/assets$': '<rootDir>/__mocks__/assetsMock.js',
        // `@chatic/web-config` is the repo's single `import.meta.env` holder (ADR-0070 결정 6), which
        // ts-jest's CommonJS transform cannot parse. Now that the session hub lives here, nearly every
        // suite reaches it transitively (session → auth/api → httpFactory → HttpManager), so it is
        // stubbed globally rather than per-file. Suites needing specific values still override with
        // their own `jest.mock('@chatic/web-config', …)`. Mirrors apps/web/jest.config.js.
        '^@chatic/web-config$': '<rootDir>/__mocks__/webConfigMock.js',
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
