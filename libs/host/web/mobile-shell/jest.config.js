module.exports = {
    displayName: 'host-web-mobile-shell',
    testEnvironment: '<rootDir>/../../../../tools/jest/jsdom-environment.js',
    watchman: false,
    moduleNameMapper: {
        '^@chatic/ports$': '<rootDir>/../../../contracts/ports/src/index.ts',
        '^@chatic/host-web-browser$': '<rootDir>/../browser/src/index.ts',
        '^@chatic/(.*)$': '<rootDir>/../../../$1/src/index.ts',
    },
    transform: {
        '^.+\\.[tj]sx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
    },
};
