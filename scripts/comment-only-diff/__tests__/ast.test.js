const test = require('node:test');
const assert = require('node:assert/strict');
const { proveCommentRemoval, comments, parse, cleanJsxText } = require('../ast');

const prove = (before, after, name = 'a.ts') => proveCommentRemoval(name, before, after);

test('removing line, block and JSDoc comments is proven', () => {
    const before =
        '/** Adds. */\nexport function add(a: number, b: number) {\n    // sum\n    return a + b; /* done */\n}\n';
    const after = 'export function add(a: number, b: number) {\n    return a + b;\n}\n';
    assert.deepEqual(prove(before, after), { ok: true, removed: 3 });
});

test('layout changes alongside a removal are still proven', () => {
    assert.equal(prove('f(  1,2 ) // c\n', 'f(1, 2);\n').ok, true);
});

test('any code change fails, however small', () => {
    assert.equal(prove('const x = 1; // c\n', 'const x = 2;\n').ok, false);
    assert.equal(prove('let a = 1; // c\n', 'const a = 1;\n').ok, false);
    assert.equal(prove('i++; // c\n', 'i--;\n').ok, false);
    assert.equal(prove('import type { A } from "a"; // c\n', 'import { A } from "a";\n').ok, false);
    assert.equal(prove('a?.b; // c\n', 'a.b;\n').ok, false);
    assert.equal(prove('x = `a${b}c`; // c\n', 'x = `a${b}d`;\n').ok, false);
});

test('an added or reworded comment fails', () => {
    assert.match(prove('f();\n', '// new\nf();\n').why, /added or reworded/);
    assert.match(prove('// old words\nf();\n', '// new words\nf();\n').why, /added or reworded/);
});

test('a formatting-only change is not a removal', () => {
    assert.match(prove('f( 1 );\n', 'f(1);\n').why, /no comment was removed/);
});

test('tool directives cannot be removed', () => {
    const directives = [
        '// @ts-expect-error',
        '// @ts-ignore',
        '// eslint-disable-next-line no-console',
        '/* eslint-disable */',
        '// prettier-ignore',
        '/* @vite-ignore */',
        '/** @jsxImportSource preact */',
        '/// <reference types="vite/client" />',
        '/* istanbul ignore next */',
        '/* c8 ignore next */',
        '/** @jest-environment jsdom */',
        '/*! @license MIT */',
        '//# sourceURL=worker.js',
    ];
    for (const d of directives) assert.equal(prove(`${d}\nf();\n`, 'f();\n').ok, false, d);
    assert.equal(prove('const a = /*#__PURE__*/ make();\n', 'const a = make();\n').ok, false);
});

test('the shebang line is kept', () => {
    assert.match(prove('#!/usr/bin/env node\n// c\nrun();\n', 'run();\n', 'cli.js').why, /shebang/);
    assert.equal(prove('#!/usr/bin/env node\n// c\nrun();\n', '#!/usr/bin/env node\nrun();\n', 'cli.js').ok, true);
});

test('files that do not parse cannot be proven', () => {
    assert.match(prove('const = ; // c\n', 'const = ;\n').why, /does not parse/);
});

test('an empty JSX comment container is dropped, and JSX text follows React whitespace rules', () => {
    const before =
        'export const A = () => (\n    <div>\n        {/* heading */}\n        <h1>Hi</h1>\n    </div>\n);\n';
    const after = 'export const A = () => (\n    <div>\n        <h1>Hi</h1>\n    </div>\n);\n';
    assert.equal(prove(before, after, 'a.tsx').ok, true);
});

test('removing a JSX comment between two text runs changes the rendered text, so it fails', () => {
    const before = 'export const A = () => (\n    <p>\n        Hello\n        {/* c */}\n        World\n    </p>\n);\n';
    const after = 'export const A = () => (\n    <p>\n        Hello\n        World\n    </p>\n);\n';
    assert.equal(prove(before, after, 'a.tsx').ok, false);
});

test('slashes inside JSX text and strings are not comments', () => {
    const sf = parse('a.tsx', 'const a = "// no";\nexport const B = () => <p>see http://x // y</p>; // yes\n');
    assert.deepEqual(comments(sf), ['// yes']);
});

test('cleanJsxText trims indentation and drops blank lines', () => {
    assert.equal(cleanJsxText('\n    Hello\n    World\n  '), 'Hello World');
    assert.equal(cleanJsxText('\n   \n'), '');
    assert.equal(cleanJsxText(' a '), ' a ');
});

test('a block, array or object that only loses its comment may collapse onto one line', () => {
    assert.equal(prove('try {\n    f();\n} catch {\n    // ignore\n}\n', 'try {\n    f();\n} catch {}\n').ok, true);
    assert.equal(prove('const a = [\n    1, // one\n    2,\n];\n', 'const a = [1, 2];\n').ok, true);
    assert.equal(prove('const o = {\n    a: 1, // one\n};\n', 'const o = { a: 1 };\n').ok, true);
});

test('parentheses a formatter drops after a comment goes are not a change, those that carry meaning are', () => {
    assert.equal(
        prove(
            'function f() {\n    return ( // why\n        a.b()\n    );\n}\n',
            'function f() {\n    return a.b();\n}\n'
        ).ok,
        true
    );
    assert.equal(prove('x = (a?.b).c; // c\n', 'x = a?.b.c;\n').ok, false);
    assert.equal(prove('x = (a + b) * c; // c\n', 'x = a + b * c;\n').ok, false);
    assert.equal(prove('(0, obj.fn)(); // c\n', '0, obj.fn();\n').ok, false);
    assert.equal(prove("('use strict'); // c\nf();\n", "'use strict';\nf();\n").ok, false);
});
