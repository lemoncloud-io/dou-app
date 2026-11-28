module.exports = {
    displayName: 'db-sqlite',
    testEnvironment: 'node',
    watchman: false,
    moduleNameMapper: {
        '^@chatic/bridge-messages/testing$': '<rootDir>/../../bridge-messages/src/testing/index.ts',
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
