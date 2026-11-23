module.exports = {
    testEnvironment: '<rootDir>/../../tools/jest/jsdom-environment.js',
    moduleNameMapper: {
        '^@chatic/(.*)$': '<rootDir>/../../libs/$1/src/index.ts',
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
