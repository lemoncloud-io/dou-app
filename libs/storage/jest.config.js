module.exports = {
    testPathIgnorePatterns: ['/node_modules/', '<rootDir>/memory/', '<rootDir>/file/'],
    modulePathIgnorePatterns: ['<rootDir>/memory/', '<rootDir>/file/'],
    testEnvironment: '<rootDir>/../../tools/jest/jsdom-environment.js',
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
