module.exports = {
    // No jsdom: this package may not reach for `document` or `window`, and running its tests where
    // those do not exist keeps them honest. It is not a full check — Node itself has `fetch` and
    // `navigator` — which is the compiler's job (`tsconfig.lib.json` has neither DOM nor Node types).
    testEnvironment: 'node',
    transformIgnorePatterns: ['node_modules/(?!(@chatic|@lemoncloud)/)'],
    moduleNameMapper: {
        // Before the generic rule, which would read `config/react` as a lib named `config/react`.
        '^@chatic/config/(.*)$': '<rootDir>/../config/src/$1/index.ts',
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
