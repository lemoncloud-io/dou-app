module.exports = {
    testEnvironment: 'jsdom',
    setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts'],
    transformIgnorePatterns: ['node_modules/(?!(@chatic|@lemoncloud)/)'],
    moduleNameMapper: {
        '^@chatic/lib/utils$': '<rootDir>/../ui-kit/src/utils/index.ts',
        '^@chatic/ui-kit/(.*)$': '<rootDir>/../ui-kit/src/$1',
        '^@chatic/(.*)$': '<rootDir>/../$1/src/index.ts',
        '\\.(css|less|scss)$': '<rootDir>/src/__mocks__/styleMock.js',
        '\\.(png|jpe?g|gif|svg|webp)$': '<rootDir>/src/__mocks__/fileMock.js',
    },
    transform: {
        '^.+\\.[tj]sx?$': [
            'ts-jest',
            {
                tsconfig: '<rootDir>/tsconfig.spec.json',
            },
        ],
    },
};
