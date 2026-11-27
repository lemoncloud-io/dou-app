module.exports = {
    testEnvironment: '<rootDir>/../../tools/jest/jsdom-environment.js',
    setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts'],
    transformIgnorePatterns: ['node_modules/(?!(@chatic|@lemoncloud)/)'],
    moduleNameMapper: {
        '^@chatic/ui-kit/(.*)$': '<rootDir>/../ui-kit/src/$1',
        '^@chatic/design-system-assets$': '<rootDir>/../design-system/assets/src/index.ts',
        '^@chatic/design-system-assets/(.*)$': '<rootDir>/../design-system/assets/src/$1/index.ts',
        '^@chatic/(.*)$': '<rootDir>/../$1/src/index.ts',
        '\\.(css|less|scss)$': '<rootDir>/src/__mocks__/styleMock.js',
        '\\.(png|jpe?g|gif|svg|webp)$': '<rootDir>/src/__mocks__/fileMock.js',
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
