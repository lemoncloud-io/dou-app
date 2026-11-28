module.exports = {
    testEnvironment: 'node',
    watchman: false,
    testPathIgnorePatterns: ['/node_modules/', '<rootDir>/ui/'],
    modulePathIgnorePatterns: ['<rootDir>/ui/'],
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
