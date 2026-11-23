module.exports = {
    testEnvironment: 'node',
    moduleNameMapper: {
        '^@chatic/chatic-apps-sdk$': '<rootDir>/../chatic-apps-sdk/src/index.ts',
        '^@chatic/chatic-apps-sdk/(.*)$': '<rootDir>/../chatic-apps-sdk/src/$1.ts',
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
