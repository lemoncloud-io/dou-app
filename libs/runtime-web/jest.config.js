module.exports = {
    // jsdom: these are a page's readers, so they are tested against a page's globals.
    testEnvironment: 'jsdom',
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
