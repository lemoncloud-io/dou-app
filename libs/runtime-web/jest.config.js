module.exports = {
    // jsdom: these are a page's readers, so they are tested against a page's globals.
    testEnvironment: 'jsdom',
    // `@chatic/data` pulls the socket lib in, which touches TextEncoder at import time.
    setupFiles: ['<rootDir>/jest.setup.ts'],
    transformIgnorePatterns: ['node_modules/(?!(@chatic|@lemoncloud)/)'],
    moduleNameMapper: {
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
