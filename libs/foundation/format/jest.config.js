module.exports = {
    displayName: 'format',
    testEnvironment: '<rootDir>/../../../tools/jest/jsdom-environment.js',
    watchman: false,
    moduleNameMapper: {
        '^@chatic/config/(.*)$': '<rootDir>/../../config/src/$1/index.ts',
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
