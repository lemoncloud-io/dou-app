module.exports = {
    testPathIgnorePatterns: ['/node_modules/', '<rootDir>/memory/'],
    modulePathIgnorePatterns: ['<rootDir>/memory/'],
    testEnvironment: '<rootDir>/../../tools/jest/jsdom-environment.js',
    transformIgnorePatterns: ['node_modules/(?!(@chatic|@lemoncloud)/)'],
    moduleNameMapper: {
        '^@chatic/bridge-messages/testing$': '<rootDir>/../bridge-messages/src/testing/index.ts',
        '^@chatic/(.*)$': '<rootDir>/../$1/src/index.ts',
    },
    transform: {
        '^.+\\.[tj]sx?$': [
            'ts-jest',
            {
                tsconfig: '<rootDir>/tsconfig.spec.json',
                astTransformers: { before: ['<rootDir>/../../tools/jest/import-meta-transformer.js'] },
            },
        ],
    },
};
