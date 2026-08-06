module.exports = {
    testEnvironment: 'jsdom',
    setupFiles: ['<rootDir>/jest.setup.ts'],
    transformIgnorePatterns: ['node_modules/(?!(@chatic|@lemoncloud)/)'],
    moduleNameMapper: {
        // Mirrors the `@chatic/lib/utils` path alias in tsconfig.base.json (ui-kit utils).
        '^@chatic/lib/utils$': '<rootDir>/../../libs/ui-kit/src/utils/index.ts',
        // Mirrors the `@chatic/ui-kit/*` alias so ui-kit subpath imports (e.g. components/ui/use-toast)
        // resolve to real files instead of the greedy `libs/$1/src/index.ts` fallback below.
        '^@chatic/ui-kit/(.*)$': '<rootDir>/../../libs/ui-kit/src/$1',
        // `assets` needs BOTH corrections: it lives at the repo ROOT (not under libs/, so the greedy
        // fallback below would resolve it to a non-existent `libs/assets/`), and the real module builds
        // URLs with `import.meta.url`, which the CommonJS test transform cannot parse. Stub it — tests
        // never assert on image bytes. Without this, every barrel reaching it (ui/layouts ->
        // PrivateLayout -> @chatic/assets) fails to load, which is what pushed call sites onto
        // barrel-bypassing direct paths.
        '^@chatic/assets$': '<rootDir>/__mocks__/assetsMock.js',
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
            },
        ],
    },
};
