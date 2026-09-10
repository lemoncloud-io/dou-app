module.exports = {
    testEnvironment: 'jsdom',
    transformIgnorePatterns: ['node_modules/(?!(@chatic|@lemoncloud)/)'],
    moduleNameMapper: {
        // Subpath entries MUST come first. The generic `^@chatic/(.*)$` rule below captures
        // `config/react` into $1 and resolves to `libs/config/react/src/index.ts`, which does not
        // exist — the real entry is `libs/config/src/react/index.ts`.
        '^@chatic/config/(.*)$': '<rootDir>/src/$1/index.ts',
        '^@chatic/(.*)$': '<rootDir>/../$1/src/index.ts',
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
