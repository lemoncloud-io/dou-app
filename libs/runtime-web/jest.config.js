module.exports = {
    testEnvironment: '<rootDir>/../../tools/jest/jsdom-environment.js',
    transformIgnorePatterns: ['node_modules/(?!(@chatic|@lemoncloud|uuid)/)'],
    moduleNameMapper: {
        '^@chatic/config/(.*)$': '<rootDir>/../config/src/$1/index.ts',
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
