module.exports = {
    testEnvironment: 'jsdom',
    transformIgnorePatterns: ['node_modules/(?!(@chatic|@lemoncloud)/)'],
    moduleNameMapper: {
        // Subpath entries MUST come before the generic rule below, which would otherwise capture
        // `config/react` into $1 and resolve it to `libs/config/react/src/index.ts` — a path that does
        // not exist. The real entry is `libs/config/src/react/index.ts` (apps/web/jest.config.js hit
        // the same trap).
        '^@chatic/config/react$': '<rootDir>/../config/src/react/index.ts',
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
