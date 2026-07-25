module.exports = {
    testEnvironment: 'node',
    watchman: false,
    // Main-process only. Electron is not importable under jest, so the modules under test
    // must stay electron-free (see src/main/webUrl.ts).
    testMatch: ['<rootDir>/src/**/*.test.ts'],
    transform: {
        '^.+\\.ts$': [
            'ts-jest',
            {
                tsconfig: '<rootDir>/tsconfig.spec.json',
            },
        ],
    },
};
