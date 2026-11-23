module.exports = {
    testEnvironment: 'jsdom',
    setupFiles: ['<rootDir>/jest.setup.ts'],
    transformIgnorePatterns: ['node_modules/(?!(@chatic|@lemoncloud|uuid)/)'],
    moduleNameMapper: {
        '^@chatic/ui-kit/(.*)$': '<rootDir>/../ui-kit/src/$1',
        '^@chatic/assets$': '<rootDir>/__mocks__/assetsMock.js',
        '^@chatic/config/(.*)$': '<rootDir>/../config/src/$1/index.ts',
        '^@chatic/session/(.*)$': '<rootDir>/../session/src/$1',
        '^@chatic/(.*)$': '<rootDir>/../$1/src/index.ts',
        '\\.(css|less|scss)$': '<rootDir>/../web-ui-kit/src/__mocks__/styleMock.js',
        '\\.(png|jpe?g|gif|svg|webp)$': '<rootDir>/../web-ui-kit/src/__mocks__/fileMock.js',
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
