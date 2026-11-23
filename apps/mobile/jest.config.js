const { pathsToModuleNameMapper } = require('ts-jest');
const { compilerOptions } = require('../../tsconfig.base.json');

module.exports = {
    testEnvironment: '<rootDir>/../../tools/jest/jsdom-environment.js',
    watchman: false,
    transformIgnorePatterns: ['node_modules/(?!(react-native-mmkv|@chatic|@lemoncloud|uuid)/)'],
    moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths, { prefix: '<rootDir>/../../' }),
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
