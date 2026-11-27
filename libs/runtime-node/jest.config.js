module.exports = {
    displayName: 'runtime-node',
    testEnvironment: 'node',
    watchman: false,
    transformIgnorePatterns: ['node_modules/(?!(@chatic|@lemoncloud|uuid)/)'],
    moduleNameMapper: {
        '^@chatic/config/(.*)$': '<rootDir>/../config/src/$1/index.ts',
        '^@chatic/session/(.*)$': '<rootDir>/../session/src/$1',
        '^@chatic/transport/(.*)$': '<rootDir>/../transport/src/$1',
        '^@chatic/runtime-core/(.*)$': '<rootDir>/../runtime/src/engine/$1',
        '^@chatic/runtime-client/(.*)$': '<rootDir>/../runtime/src/api/$1',
        '^@chatic/runtime/(.*)$': '<rootDir>/../runtime/src/$1',
        '^@chatic/sync/(.*)$': '<rootDir>/../sync/src/$1',
        '^@chatic/auth/(.*)$': '<rootDir>/../auth/src/$1',
        '^@chatic/ports$': '<rootDir>/../contracts/ports/src/index.ts',
        '^@chatic/storage-memory$': '<rootDir>/../storage/memory/src/index.ts',
        '^@chatic/storage-file$': '<rootDir>/../storage/file/src/index.ts',
        '^@chatic/db-memory$': '<rootDir>/../db/memory/src/index.ts',
        '^@chatic/host-node$': '<rootDir>/../host/node/src/index.ts',
        '^@chatic/data-(model|api|local|repositories)$': '<rootDir>/../data/$1/src/index.ts',
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
