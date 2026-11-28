module.exports = {
    displayName: 'host-web-desktop-shell',
    testEnvironment: '<rootDir>/../../../../tools/jest/jsdom-environment.js',
    watchman: false,
    moduleNameMapper: {
        '^@chatic/ports$': '<rootDir>/../../../contracts/ports/src/index.ts',
        '^@chatic/host-web-browser$': '<rootDir>/../browser/src/index.ts',
        '^@chatic/storage-(compose|memory|web-local|web-session|vault-bridge)$':
            '<rootDir>/../../../storage/$1/src/index.ts',
        '^@chatic/bridge-(client|host)$': '<rootDir>/../../../bridge/$1/src/index.ts',
        '^@chatic/(.*)$': '<rootDir>/../../../$1/src/index.ts',
    },
    transform: {
        '^.+\\.[tj]sx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
    },
};
