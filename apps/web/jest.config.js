module.exports = {
    testEnvironment: '<rootDir>/../../tools/jest/jsdom-environment.js',
    setupFiles: ['<rootDir>/jest.setup.ts'],
    transformIgnorePatterns: ['node_modules/(?!(@chatic|@lemoncloud|uuid)/)'],
    moduleNameMapper: {
        '^@chatic/ui-kit/(.*)$': '<rootDir>/../../libs/ui-kit/src/$1',
        '^@chatic/assets$': '<rootDir>/__mocks__/assetsMock.js',
        '/utils/buildEnv$': '<rootDir>/__mocks__/buildEnvMock.js',
        '^@chatic/config/(.*)$': '<rootDir>/../../libs/config/src/$1/index.ts',
        '^@chatic/shared/phone$': '<rootDir>/../../libs/shared/src/phone/index.ts',
        '^@chatic/runtime/(.*)$': '<rootDir>/../../libs/runtime/src/$1',
        '^@chatic/runtime-react/testing$': '<rootDir>/../../libs/runtime/react/src/testing/index.ts',
        '^@chatic/runtime-react$': '<rootDir>/../../libs/runtime/react/src/index.ts',
        '^@chatic/design-system-assets$': '<rootDir>/../../libs/design-system/assets/src/index.ts',
        '^@chatic/design-system-assets/(.*)$': '<rootDir>/../../libs/design-system/assets/src/$1/index.ts',
        '^@chatic/design-system-(components|patterns|chat)-mobile$':
            '<rootDir>/../../libs/design-system/$1/mobile/src/index.ts',
        '^@chatic/data-(model|api|local|repositories)$': '<rootDir>/../../libs/data/$1/src/index.ts',
        '^@chatic/db-(indexeddb|bridge|memory)$': '<rootDir>/../../libs/db/$1/src/index.ts',
        '^@chatic/storage-(compose|memory|web-local|web-session|vault-bridge)$':
            '<rootDir>/../../libs/storage/$1/src/index.ts',
        '^@chatic/host-web-(browser|mobile-shell)$': '<rootDir>/../../libs/host/web/$1/src/index.ts',
        '^@chatic/subscription-ui$': '<rootDir>/../../libs/subscription/ui/src/index.ts',
        '^@chatic/checkout-web$': '<rootDir>/../../libs/checkout/web/src/index.ts',
        '^@chatic/mini-app-(protocol|host)$': '<rootDir>/../../libs/mini-app/$1/src/index.ts',
        '^@chatic/bridge-(client|host)$': '<rootDir>/../../libs/bridge/$1/src/index.ts',
        '^@chatic/(.*)$': '<rootDir>/../../libs/$1/src/index.ts',
        '\\.(css|less|scss)$': '<rootDir>/../../libs/web-ui-kit/src/__mocks__/styleMock.js',
        '\\.(png|jpe?g|gif|svg|webp)$': '<rootDir>/../../libs/web-ui-kit/src/__mocks__/fileMock.js',
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
