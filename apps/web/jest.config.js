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
