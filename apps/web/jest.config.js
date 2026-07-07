module.exports = {
    testEnvironment: 'jsdom',
    transformIgnorePatterns: ['node_modules/(?!(@chatic|@lemoncloud)/)'],
    moduleNameMapper: {
        // Mirrors the `@chatic/lib/utils` path alias in tsconfig.base.json (ui-kit utils).
        '^@chatic/lib/utils$': '<rootDir>/../../libs/ui-kit/src/utils/index.ts',
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
