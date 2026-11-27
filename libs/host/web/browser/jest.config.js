module.exports = {
    displayName: 'host-web-browser',
    testEnvironment: '<rootDir>/../../../../tools/jest/jsdom-environment.js',
    watchman: false,
    moduleNameMapper: {
        '^@chatic/ports$': '<rootDir>/../../../contracts/ports/src/index.ts',
        '^@chatic/(.*)$': '<rootDir>/../../../$1/src/index.ts',
    },
    transform: {
        '^.+\\.[tj]sx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
    },
};
