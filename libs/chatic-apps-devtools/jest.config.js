module.exports = {
    // Node: the scenario runner makes its own windows, one per page it opens.
    testEnvironment: 'node',
    moduleNameMapper: {
        '^@chatic/chatic-apps-sdk$': '<rootDir>/../chatic-apps-sdk/src/index.ts',
        '^@chatic/chatic-apps-sdk/(.*)$': '<rootDir>/../chatic-apps-sdk/src/$1.ts',
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
