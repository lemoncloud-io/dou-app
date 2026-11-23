'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ENVIRONMENT = '<rootDir>/../../tools/jest/jsdom-environment.js';
const TRANSFORMER = '<rootDir>/../../tools/jest/import-meta-transformer.js';

const jestConfigs = ['apps', 'libs'].flatMap(group =>
    fs
        .readdirSync(path.join(REPO_ROOT, group))
        .map(project => path.join(group, project, 'jest.config.js'))
        .filter(file => fs.existsSync(path.join(REPO_ROOT, file)))
);

const tsJestOptions = config =>
    Object.values(config.transform ?? {})
        .filter(entry => (Array.isArray(entry) ? entry[0] : entry) === 'ts-jest')
        .map(entry => (Array.isArray(entry) ? (entry[1] ?? {}) : {}));

const SKIP = new Set(['node_modules', 'dist', 'out-tsc', 'coverage', '.vite']);

const testFilesUnder = dir =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        if (SKIP.has(entry.name)) return [];
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return testFilesUnder(full);
        return /\.(test|spec)\.[jt]sx?$/.test(entry.name) ? [full] : [];
    });

const bareJsdomDocblocks = () =>
    jestConfigs
        .flatMap(file => testFilesUnder(path.join(REPO_ROOT, path.dirname(file))))
        .filter(file => /@jest-environment\s+(jsdom|jest-environment-jsdom)\b/.test(fs.readFileSync(file, 'utf8')))
        .map(file => path.relative(REPO_ROOT, file));

describe('every jest project in apps/ and libs/', () => {
    it('is found', () => {
        expect(jestConfigs.length).toBeGreaterThan(10);
    });

    it.each(jestConfigs)('%s runs a page on the shared jsdom environment', file => {
        const config = require(path.join(REPO_ROOT, file));

        expect(config.testEnvironment).not.toBe('jsdom');
        expect(config.testEnvironment).not.toBe('jest-environment-jsdom');
        if (config.testEnvironment !== 'node') expect(config.testEnvironment).toBe(ENVIRONMENT);
    });

    it('has no test that opts into bare jsdom by docblock', () => {
        expect(bareJsdomDocblocks()).toEqual([]);
    });

    it.each(jestConfigs)('%s compiles import.meta through the shared transformer', file => {
        const config = require(path.join(REPO_ROOT, file));

        for (const options of tsJestOptions(config)) {
            expect(options.astTransformers?.before ?? []).toContain(TRANSFORMER);
        }
    });
});
