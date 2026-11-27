module.exports = {
    displayName: 'db-memory',
    testEnvironment: 'node',
    watchman: false,
    transformIgnorePatterns: ['node_modules/(?!(@chatic|@lemoncloud|uuid)/)'],
    moduleNameMapper: {
        '^@chatic/ports$': '<rootDir>/../../contracts/ports/src/index.ts',
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
