module.exports = {
    displayName: 'dou-cli',
    testEnvironment: 'node',
    watchman: false,
    transformIgnorePatterns: ['node_modules/(?!(@chatic|@lemoncloud|uuid)/)'],
    moduleNameMapper: {
        '^@chatic/config/(.*)$': '<rootDir>/../../libs/config/src/$1/index.ts',
        '^@chatic/session/(.*)$': '<rootDir>/../../libs/session/src/$1',
        '^@chatic/transport/(.*)$': '<rootDir>/../../libs/transport/src/$1',
        '^@chatic/runtime-core/(.*)$': '<rootDir>/../../libs/runtime/src/engine/$1',
        '^@chatic/runtime-client/(.*)$': '<rootDir>/../../libs/runtime/src/api/$1',
        '^@chatic/runtime/(.*)$': '<rootDir>/../../libs/runtime/src/$1',
        '^@chatic/sync/(.*)$': '<rootDir>/../../libs/sync/src/$1',
        '^@chatic/auth/(.*)$': '<rootDir>/../../libs/auth/src/$1',
        '^@chatic/ports$': '<rootDir>/../../libs/contracts/ports/src/index.ts',
        '^@chatic/storage-memory$': '<rootDir>/../../libs/storage/memory/src/index.ts',
        '^@chatic/storage-file$': '<rootDir>/../../libs/storage/file/src/index.ts',
        '^@chatic/db-memory$': '<rootDir>/../../libs/db/memory/src/index.ts',
        '^@chatic/host-node$': '<rootDir>/../../libs/host/node/src/index.ts',
        '^@chatic/data-(model|api|local|repositories)$': '<rootDir>/../../libs/data/$1/src/index.ts',
        '^@chatic/storage-(compose|memory|web-local|web-session|vault-bridge)$':
            '<rootDir>/../../libs/storage/$1/src/index.ts',
        '^@chatic/push-desktop$': '<rootDir>/../../libs/push/desktop/src/index.ts',
        '^@chatic/agent-tools/testing$': '<rootDir>/../../libs/agent-tools/src/testing/index.ts',
        '^@chatic/(.*)$': '<rootDir>/../../libs/$1/src/index.ts',
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
