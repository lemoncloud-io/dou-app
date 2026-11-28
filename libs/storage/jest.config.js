const FAMILY = [
    'memory',
    'file',
    'compose',
    'web-local',
    'web-session',
    'vault-bridge',
    'safe-storage',
    'mmkv',
    'keychain',
];

module.exports = {
    testPathIgnorePatterns: ['/node_modules/', ...FAMILY.map(name => `<rootDir>/${name}/`)],
    modulePathIgnorePatterns: FAMILY.map(name => `<rootDir>/${name}/`),
    testEnvironment: '<rootDir>/../../tools/jest/jsdom-environment.js',
    moduleNameMapper: {
        '^@chatic/storage-(compose|memory|web-local|web-session|vault-bridge)$': '<rootDir>/$1/src/index.ts',
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
