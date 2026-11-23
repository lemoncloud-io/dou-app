'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { RuleTester } = require('eslint');
const tsParser = require('@typescript-eslint/parser');

const rule = require('./ratchet');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ratchet-rule-'));
const baselineFile = path.join(root, 'baseline.json');
fs.writeFileSync(
    baselineFile,
    JSON.stringify({
        'libs/a/src/known.ts': { comments: 2, asAny: 1 },
        'apps/web/src/Screen.tsx': { useEffect: 1 },
    })
);
const options = [{ root, baselineFile }];
const at = file => path.join(root, file);
const over = (field, count, allowed) => ({ messageId: 'over', data: rule.messageData(field, count, allowed) });

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

new RuleTester({
    languageOptions: {
        parser: tsParser,
        ecmaVersion: 2022,
        sourceType: 'module',
        parserOptions: { ecmaFeatures: { jsx: true } },
    },
}).run('ratchet', rule, {
    valid: [
        { code: 'export const a = 1;', filename: at('libs/a/src/new.ts'), options },
        {
            code: '// one\n// two\nexport const b = (x: unknown) => x as any;',
            filename: at('libs/a/src/known.ts'),
            options,
        },
        { code: '// one\nexport const b = 1;', filename: at('libs/a/src/known.ts'), options },
        {
            code: 'const url = "http://example.com"; // not counted twice /* still one line */',
            filename: at('libs/a/src/known.ts'),
            options,
        },
        {
            code: '// eslint-disable-next-line no-console -- the CLI prints\nconsole.log(1);',
            filename: at('libs/a/src/new.ts'),
            options,
        },
        {
            code: '/// <reference types="vite/client" />\n// prettier-ignore\nconst m = import(/* @vite-ignore */ "x");',
            filename: at('libs/a/src/new.ts'),
            options,
        },
        {
            code: '/* Copyright 2026 Example. Licensed under Apache-2.0. */\nexport const a = 1;',
            filename: at('libs/a/src/new.ts'),
            options,
        },
        {
            code: '/** Opens a mini app. */\nexport function open() {}',
            filename: at('libs/chatic-apps-sdk/src/open.ts'),
            options,
        },
        {
            code: '/** Opens a mini app. */\nexport function open() {}',
            filename: at('libs/chatic-apps-devtools/src/open.ts'),
            options,
        },
        {
            code: '// ratchet-allow asAny -- the third-party typings omit this overload\nconst v = (window as any).x;',
            filename: at('libs/a/src/new.ts'),
            options,
        },
        {
            code: 'useEffect(() => {}, []);',
            filename: at('apps/web/src/Screen.tsx'),
            options,
        },
        {
            code: '// SPDX-License-Identifier: Apache-2.0\n/* eslint-env node */\nexport const a = 1;',
            filename: at('libs/a/src/new.ts'),
            options,
        },
        { code: '// outside the root', filename: path.join(os.tmpdir(), 'elsewhere.ts'), options },
    ],
    invalid: [
        {
            code: '// a new comment\nexport const a = 1;',
            filename: at('libs/a/src/new.ts'),
            options,
            errors: [over('comments', 1, 0)],
        },
        {
            code: '/*\n * three\n */\nexport const a = 1;',
            filename: at('libs/a/src/known.ts'),
            options,
            errors: [over('comments', 3, 2)],
        },
        {
            code: 'const a = (x as any) as any;',
            filename: at('libs/a/src/known.ts'),
            options,
            errors: [over('asAny', 2, 1)],
        },
        {
            code: 'const a = <any>x;',
            filename: at('libs/a/src/new.ts'),
            options,
            errors: [over('asAny', 1, 0)],
        },
        {
            code: '// @ts-ignore\nconst a: number = "x";',
            filename: at('libs/a/src/new.ts'),
            options,
            errors: [over('tsIgnore', 1, 0)],
        },
        {
            code: '// @ts-nocheck\nexport const a = 1;',
            filename: at('libs/a/src/new.ts'),
            options,
            errors: [over('tsIgnore', 1, 0)],
        },
        {
            code: '// @ts-expect-error -- wrong on purpose\nconst a: number = "x";',
            filename: at('libs/a/src/new.ts'),
            options,
            errors: [over('tsExpectError', 1, 0)],
        },
        {
            code: '// eslint-disable-next-line no-console\nconsole.log(1);',
            filename: at('libs/a/src/new.ts'),
            options,
            errors: [over('eslintDisableNoReason', 1, 0)],
        },
        {
            code: 'useEffect(() => {}, []);\nReact.useEffect(() => {}, []);',
            filename: at('apps/web/src/Screen.tsx'),
            options,
            errors: [over('useEffect', 2, 1)],
        },
        {
            code: '// ratchet-allow asAny\nconst v = (window as any).x;',
            filename: at('libs/a/src/new.ts'),
            options,
            errors: [over('comments', 1, 0), over('asAny', 1, 0)],
        },
        {
            code: '// ratchet-allow this is prose pretending to be a directive\nexport const a = 1;',
            filename: at('libs/a/src/new.ts'),
            options,
            errors: [over('comments', 1, 0)],
        },
        {
            code: '/*\n * one\n * two\n */\nexport const a = 1;\n// three\n',
            filename: at('libs/a/src/known.ts'),
            options,
            errors: [{ ...over('comments', 5, 2), line: 1 }],
        },
        {
            code: 'export const a = 1;\n// one\n// two\nexport const b = 2;\n// the new one\n',
            filename: at('libs/a/src/known.ts'),
            options,
            errors: [{ ...over('comments', 3, 2), line: 5 }],
        },
        {
            code: '// ratchet-allow comments -- not a field it can allow\nexport const a = 1;',
            filename: at('libs/a/src/new.ts'),
            options,
            errors: [over('comments', 1, 0)],
        },
        {
            code: '// global state lives here\n// exported for the tests\nexport const a = 1;',
            filename: at('libs/a/src/new.ts'),
            options,
            errors: [over('comments', 2, 0)],
        },
        {
            code: '// This license key check runs first\nexport const a = 1;',
            filename: at('libs/a/src/new.ts'),
            options,
            errors: [over('comments', 1, 0)],
        },
        {
            code: '/// @ts-ignore\nconst a: number = "x";',
            filename: at('libs/a/src/new.ts'),
            options,
            errors: [over('tsIgnore', 1, 0)],
        },
        {
            code: '/** Not exempt outside the published packages. */\nexport function open() {}',
            filename: at('libs/a/src/new.ts'),
            options,
            errors: [over('comments', 1, 0)],
        },
        {
            code: '/** Test files of a published package are not its public API. */\nit("opens", () => {});',
            filename: at('libs/chatic-apps-sdk/src/open.spec.ts'),
            options,
            errors: [over('comments', 1, 0)],
        },
        {
            code: 'export const a = 1;\n/* Copyright is only exempt as the first comment. */',
            filename: at('libs/a/src/new.ts'),
            options,
            errors: [over('comments', 1, 0)],
        },
    ],
});
