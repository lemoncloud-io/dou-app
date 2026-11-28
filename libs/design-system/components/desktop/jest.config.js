module.exports = {
    testEnvironment: '<rootDir>/../../../../tools/jest/jsdom-environment.js',
    setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts'],
    transformIgnorePatterns: ['node_modules/(?!(@chatic|@lemoncloud)/)'],
    moduleNameMapper: {
        '^@chatic/ui-kit/(.*)$': '<rootDir>/../../../../libs/ui-kit/src/$1',
        '^@chatic/(.*)$': '<rootDir>/../../../../libs/$1/src/index.ts',
    },
    transform: {
        '^.+\\.[tj]sx?$': [
            'ts-jest',
            {
                tsconfig: '<rootDir>/tsconfig.spec.json',
                astTransformers: { before: ['<rootDir>/../../../../tools/jest/import-meta-transformer.js'] },
            },
        ],
    },
};
