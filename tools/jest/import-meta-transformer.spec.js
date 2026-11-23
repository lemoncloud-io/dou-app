'use strict';

const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const transformer = require('./import-meta-transformer');

const compile = (source, transformers) =>
    ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
        transformers,
    }).outputText;

const load = (code, filename) => {
    const module = { exports: {} };
    vm.runInThisContext(`(function (exports, require, module, __filename, __dirname) {${code}\n})`)(
        module.exports,
        require,
        module,
        filename,
        path.dirname(filename)
    );
    return module.exports;
};

const VITE_MODULE = `
export const mode = import.meta.env.MODE;
export const isDev = import.meta.env.DEV === true || import.meta.env?.VITE_ENV === 'DEV';
export const isProd = import.meta.env.PROD;
export const here = import.meta.url;
export const dir = import.meta.dirname;
`;

describe('the import.meta transformer for ts-jest', () => {
    const before = [transformer.factory({ configSet: { compilerModule: ts } })];
    const filename = path.join(__dirname, 'fixture', 'viteEnv.ts');

    it('leaves a module that reads import.meta loadable as CommonJS', () => {
        const loaded = load(compile(VITE_MODULE, { before }), filename);

        expect(loaded.mode).toBe('test');
        expect(loaded.isDev).toBe(false);
        expect(loaded.isProd).toBe(true);
        expect(loaded.here).toBe(`file://${filename}`);
        expect(loaded.dir).toBe(path.dirname(filename));
    });

    it('is what stands between such a module and a SyntaxError', () => {
        expect(() => load(compile(VITE_MODULE), filename)).toThrow(/import\.meta/);
    });
});
