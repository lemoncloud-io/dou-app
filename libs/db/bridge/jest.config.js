module.exports = {
    displayName: 'db-bridge',
    testEnvironment: '<rootDir>/../../../tools/jest/jsdom-environment.js',
    watchman: false,
    transformIgnorePatterns: ['node_modules/(?!(@chatic|@lemoncloud|uuid)/)'],
    moduleNameMapper: {
        '^@chatic/bridge-messages/testing$': '<rootDir>/../../bridge-messages/src/testing/index.ts',
        '^@chatic/data-(model|api|local|repositories)$': '<rootDir>/../../data/$1/src/index.ts',
        '^@chatic/db-(indexeddb|bridge|memory)$': '<rootDir>/../$1/src/index.ts',
        '^@chatic/storage-(compose|memory|web-local|web-session|vault-bridge)$':
            '<rootDir>/../../storage/$1/src/index.ts',
        '^@chatic/bridge-(client|host)$': '<rootDir>/../../bridge/$1/src/index.ts',
        '^@chatic/(.*)$': '<rootDir>/../../$1/src/index.ts',
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
