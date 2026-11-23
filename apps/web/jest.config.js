module.exports = {
    testEnvironment: '<rootDir>/../../tools/jest/jsdom-environment.js',
    setupFiles: ['<rootDir>/jest.setup.ts'],
    // `uuid` ships ESM-only; the session hooks in `@chatic/runtime`
    // pull it in via `useDynamicDeviceId`, so it must be transformed rather than required as CJS.
    transformIgnorePatterns: ['node_modules/(?!(@chatic|@lemoncloud|uuid)/)'],
    moduleNameMapper: {
        // Mirrors the `@chatic/ui-kit/*` alias so ui-kit subpath imports (e.g. components/ui/use-toast)
        // resolve to real files instead of the greedy `libs/$1/src/index.ts` fallback below.
        '^@chatic/ui-kit/(.*)$': '<rootDir>/../../libs/ui-kit/src/$1',
        // `assets` lives at the repo ROOT, so the greedy fallback below would resolve it to a
        // non-existent `libs/assets/`. Stubbed: tests never assert on image bytes.
        '^@chatic/assets$': '<rootDir>/__mocks__/assetsMock.js',
        '/utils/buildEnv$': '<rootDir>/__mocks__/buildEnvMock.js',
        // Subpath entries MUST come first. The generic `^@chatic/(.*)$` rule below captures
        // `config/react` into $1 and resolves to `libs/config/react/src/index.ts`, which does not
        // exist — the real entry is `libs/config/src/react/index.ts` (see libs/config/jest.config.js,
        // which hit the same trap).
        '^@chatic/config/(.*)$': '<rootDir>/../../libs/config/src/$1/index.ts',
        // Same trap: `shared/phone` is a subpath entry kept out of the root barrel (libphonenumber's metadata).
        '^@chatic/shared/phone$': '<rootDir>/../../libs/shared/src/phone/index.ts',
        // Same trap: the runtime's test fake is a subpath entry kept out of its barrel.
        '^@chatic/runtime/testing$': '<rootDir>/../../libs/runtime/src/testing/index.ts',
        '^@chatic/(.*)$': '<rootDir>/../../libs/$1/src/index.ts',
        // web-ui-kit re-exports SVG/image assets from its barrel; stub them (and styles) so tests
        // importing @chatic/web-ui-kit don't choke on static asset imports.
        '\\.(css|less|scss)$': '<rootDir>/../../libs/web-ui-kit/src/__mocks__/styleMock.js',
        '\\.(png|jpe?g|gif|svg|webp)$': '<rootDir>/../../libs/web-ui-kit/src/__mocks__/fileMock.js',
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
