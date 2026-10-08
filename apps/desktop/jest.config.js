const { pathsToModuleNameMapper } = require('ts-jest');
const { compilerOptions } = require('../../tsconfig.base.json');

module.exports = {
    testEnvironment: 'node',
    watchman: false,
    // Main-process only. Electron is not importable under jest, so the modules under test
    // must stay electron-free (see src/main/webUrl.ts) — or be mocked, as the bridge contract
    // suite mocks it to load updater.ts.
    testMatch: ['<rootDir>/src/**/*.test.ts'],
    // Workspace libs resolve to their sources, the same way the build resolves them. The bridge
    // contract suite runs the real `@chatic/bridges` host against the real message map.
    moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths, { prefix: '<rootDir>/../../' }),
    transform: {
        '^.+\\.ts$': [
            'ts-jest',
            {
                tsconfig: '<rootDir>/tsconfig.spec.json',
            },
        ],
    },
};
