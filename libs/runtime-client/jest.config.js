module.exports = {
    testEnvironment: 'node',
    setupFiles: ['<rootDir>/jest.setup.ts'],
    transformIgnorePatterns: ['node_modules/(?!(@chatic|@lemoncloud|uuid)/)'],
    moduleNameMapper: {
        '^@chatic/config/(.*)$': '<rootDir>/../config/src/$1/index.ts',
        // barrels alone; eslint keeps it that way.
        '^@chatic/session/(.*)$': '<rootDir>/../session/src/$1',
        '^@chatic/transport/(.*)$': '<rootDir>/../transport/src/$1',
        '^@chatic/runtime-core/(.*)$': '<rootDir>/../runtime-core/src/$1',
        '^@chatic/sync/(.*)$': '<rootDir>/../sync/src/$1',
        '^@chatic/auth/(.*)$': '<rootDir>/../auth/src/$1',
        '^@chatic/(.*)$': '<rootDir>/../$1/src/index.ts',
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
