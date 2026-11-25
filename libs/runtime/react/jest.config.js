module.exports = {
    testEnvironment: '<rootDir>/../../../tools/jest/jsdom-environment.js',
    transformIgnorePatterns: ['node_modules/(?!(@chatic|@lemoncloud|uuid)/)'],
    moduleNameMapper: {
        '^@chatic/ui-kit/(.*)$': '<rootDir>/../../ui-kit/src/$1',
        '^@chatic/assets$': '<rootDir>/__mocks__/assetsMock.js',
        '^@chatic/config/(.*)$': '<rootDir>/../../config/src/$1/index.ts',
        '^@chatic/session/(.*)$': '<rootDir>/../../session/src/$1',
        '^@chatic/transport/(.*)$': '<rootDir>/../../transport/src/$1',
        '^@chatic/runtime-core/(.*)$': '<rootDir>/../../runtime-core/src/$1',
        '^@chatic/runtime-client/(.*)$': '<rootDir>/../../runtime-client/src/$1',
        '^@chatic/sync/(.*)$': '<rootDir>/../../sync/src/$1',
        '^@chatic/auth/(.*)$': '<rootDir>/../../auth/src/$1',
        '^@chatic/runtime/(.*)$': '<rootDir>/../src/$1',
        '^@chatic/runtime$': '<rootDir>/../src/index.ts',
        '^@chatic/ports$': '<rootDir>/../../contracts/ports/src/index.ts',
        '^@chatic/(.*)$': '<rootDir>/../../$1/src/index.ts',
        '\\.(css|less|scss)$': '<rootDir>/../../web-ui-kit/src/__mocks__/styleMock.js',
        '\\.(png|jpe?g|gif|svg|webp)$': '<rootDir>/../../web-ui-kit/src/__mocks__/fileMock.js',
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
