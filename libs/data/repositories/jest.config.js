module.exports = {
    testEnvironment: '<rootDir>/../../../tools/jest/jsdom-environment.js',
    transformIgnorePatterns: ['node_modules/(?!(@chatic|@lemoncloud)/)'],
    moduleNameMapper: {
        '^@chatic/data-local/testing$': '<rootDir>/../local/src/testing/index.ts',
        '^@chatic/data-(model|api|local|repositories)$': '<rootDir>/../$1/src/index.ts',
        '^@chatic/(.*)$': '<rootDir>/../../$1/src/index.ts',
    },

    transform: {
        '^.+\\.[tj]sx?$': [
            'ts-jest',
            {
                tsconfig: '<rootDir>/tsconfig.spec.json',
                astTransformers: { before: ['<rootDir>/../../../tools/jest/import-meta-transformer.js'] },
            },
        ],
    },
};
