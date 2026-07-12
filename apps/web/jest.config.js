module.exports = {
    testEnvironment: 'jsdom',
    transformIgnorePatterns: ['node_modules/(?!(@chatic|@lemoncloud)/)'],
    moduleNameMapper: {
        // Mirrors the `@chatic/lib/utils` path alias in tsconfig.base.json (ui-kit utils).
        '^@chatic/lib/utils$': '<rootDir>/../../libs/ui-kit/src/utils/index.ts',
        // Mirrors the `@chatic/ui-kit/*` alias so ui-kit subpath imports (e.g. components/ui/use-toast)
        // resolve to real files instead of the greedy `libs/$1/src/index.ts` fallback below.
        '^@chatic/ui-kit/(.*)$': '<rootDir>/../../libs/ui-kit/src/$1',
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
