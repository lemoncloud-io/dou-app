module.exports = {
    testEnvironment: '<rootDir>/../../tools/jest/jsdom-environment.js',
    transformIgnorePatterns: ['node_modules/(?!(@chatic|@lemoncloud|uuid)/)'],
    moduleNameMapper: {
        '^@chatic/config/(.*)$': '<rootDir>/../config/src/$1/index.ts',
        '^@chatic/runtime/(.*)$': '<rootDir>/../runtime/src/$1',
        '^@chatic/data-(model|api|local|repositories)$': '<rootDir>/../data/$1/src/index.ts',
        '^@chatic/db-(indexeddb|bridge|memory)$': '<rootDir>/../db/$1/src/index.ts',
        '^@chatic/storage-(compose|memory|web-local|web-session|vault-bridge)$': '<rootDir>/../storage/$1/src/index.ts',
        '^@chatic/host-web-browser$': '<rootDir>/../host/web/browser/src/index.ts',
        '^@chatic/bridge-(client|host)$': '<rootDir>/../bridge/$1/src/index.ts',
        '^@chatic/(.*)$': '<rootDir>/../$1/src/index.ts',
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
