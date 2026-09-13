module.exports = {
    testEnvironment: 'jsdom',
    transformIgnorePatterns: ['node_modules/(?!(@chatic|@lemoncloud)/)'],
    moduleNameMapper: {
        // Subpath entries MUST come before the generic rule below, which would otherwise capture
        // `config/react` into $1 and resolve it to `libs/config/react/src/index.ts` — a path that does
        // not exist. Mirrors apps/web/jest.config.js (same trap, same fix).
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
