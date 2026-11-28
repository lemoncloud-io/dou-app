'use strict';

const path = require('node:path');

/**
 * Keeps the page from asking the host what it is.
 *
 * `isNative()` answers one question correctly — is there a bridge to post to — and is used to answer
 * two more by guessing: what this host can do, and which product rule applies here. The shell's
 * `CHATIC_APP_*` globals are read the same way, most often to tell one phone platform from the other.
 * Each guess holds only while every host with a bridge can do everything the phone can, and nothing
 * outside the page can change its answer. What a host can do reaches a feature through a host port
 * instead (`runtime.<port>` from `@chatic/runtime-react`), chosen once by the app's runtime declaration from
 * what the host declared.
 *
 * So this reports, outside the allowed files:
 * - any use of `isNative` imported from `@chatic/bridges` or `@chatic/bridge-client` — called, or handed on as a value — under
 *   any local name or through a namespace import;
 * - any use of `isNativeApp`, the runtime's second answer to the same question
 *   (`runtime.boot.isNativeApp()`), called or handed on;
 * - a read of a `CHATIC_APP_*` global off `window`, `globalThis` or `self` — a member read
 *   (`window.CHATIC_APP_PLATFORM`, through a cast or `?.` too, or `window['CHATIC_APP_…']`), a
 *   destructuring of one of those objects, or an `'CHATIC_APP_…' in window` test — including through a
 *   local name for one of them (`const g = window`) or a function that only returns one
 *   (`const globals = () => window as …`).
 *
 * Writing a global (`window.CHATIC_APP_X = …`, `delete window.CHATIC_APP_X`) is not a read and is
 * not reported: that is what a host, or a test playing one, does. A compound assignment (`??=`) reads
 * first, and is reported.
 *
 * Options:
 * - `allowedFiles` — repository-relative paths that may do it. An entry ending in `/` allows every
 *   file under that folder. The list starts with every file that did it when the rule was added; a
 *   domain that moves onto its port takes its files off, so the list is the migration's progress.
 *
 * What it does not see: a global read through a computed name that is not a string literal
 * (`window[name]`), an alias made any other way than a plain declaration, and a value handed on from
 * an allowed file and used elsewhere.
 */
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const GLOBAL_PREFIX = 'CHATIC_APP_';
const GLOBAL_OBJECTS = new Set(['window', 'globalThis', 'self']);
const BRIDGES = new Set(['@chatic/bridges', '@chatic/bridge-client']);
const APP_PROBE = 'isNativeApp';

/** `window` through casts, non-null assertions and parentheses: `(window as unknown as X)`. */
const unwrap = node => {
    let current = node;
    while (
        current &&
        (current.type === 'TSAsExpression' ||
            current.type === 'TSTypeAssertion' ||
            current.type === 'TSNonNullExpression' ||
            current.type === 'TSSatisfiesExpression')
    ) {
        current = current.expression;
    }
    return current;
};

const isBareGlobalObject = node => {
    const inner = unwrap(node);
    return inner?.type === 'Identifier' && GLOBAL_OBJECTS.has(inner.name);
};

/** A function whose whole body is the global object: `() => window as unknown as Shell`. */
const returnsGlobalObject = node => {
    const fn = unwrap(node);
    if (fn?.type !== 'ArrowFunctionExpression' && fn?.type !== 'FunctionExpression') return false;
    if (fn.body.type !== 'BlockStatement') return isBareGlobalObject(fn.body);
    const [only] = fn.body.body;
    return fn.body.body.length === 1 && only.type === 'ReturnStatement' && isBareGlobalObject(only.argument);
};

const propertyName = member => {
    if (!member.computed && member.property.type === 'Identifier') return member.property.name;
    if (member.computed && member.property.type === 'Literal' && typeof member.property.value === 'string') {
        return member.property.value;
    }
    return undefined;
};

/** The member is written, not read: the target of a plain assignment or of `delete`. */
const isWrite = member => {
    let node = member;
    let parent = member.parent;
    while (parent && parent.type === 'ChainExpression') {
        node = parent;
        parent = parent.parent;
    }
    if (parent?.type === 'AssignmentExpression' && parent.left === node && parent.operator === '=') return true;
    if (parent?.type === 'UnaryExpression' && parent.operator === 'delete') return true;
    return false;
};

/** The identifier names something here rather than using it: a declaration, a key, import plumbing. */
const isNotAUse = node => {
    const parent = node.parent;
    return (
        parent.type === 'ImportSpecifier' ||
        parent.type === 'ImportNamespaceSpecifier' ||
        parent.type === 'ExportSpecifier' ||
        (parent.type === 'VariableDeclarator' && parent.id === node) ||
        (parent.type === 'FunctionDeclaration' && parent.id === node) ||
        (parent.type === 'MemberExpression' && parent.property === node && !parent.computed) ||
        (parent.type === 'Property' && parent.key === node && !parent.shorthand) ||
        (parent.type === 'MethodDefinition' && parent.key === node) ||
        parent.type === 'TSPropertySignature' ||
        parent.type === 'TSMethodSignature'
    );
};

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
    meta: {
        type: 'problem',
        docs: {
            description: 'Only the allowed files may ask the host what it is; features reach it through its ports.',
        },
        schema: [
            {
                type: 'object',
                properties: { allowedFiles: { type: 'array', items: { type: 'string' } } },
                required: ['allowedFiles'],
                additionalProperties: false,
            },
        ],
        messages: {
            probe: "'{{name}}' only says a bridge exists. Ask the capability's port (`runtime.<port>` from @chatic/runtime-react) instead; only the files on this rule's allow-list may use it.",
            global: "'{{name}}' is a fact the host injected. Read it through the host ports (`runtime.<port>` from @chatic/runtime-react), or @chatic/bridges' host profile in infrastructure; only the files on this rule's allow-list may read it off the global object.",
        },
    },
    create(context) {
        const { allowedFiles } = context.options[0];
        const file = path.relative(REPO_ROOT, context.filename).split(path.sep).join('/');
        if (allowedFiles.some(entry => (entry.endsWith('/') ? file.startsWith(entry) : file === entry))) return {};

        const isNativeNames = new Set();
        const bridgesNamespaces = new Set();
        const globalAliases = new Set();
        const globalGetters = new Set();

        const isGlobalObject = node => {
            if (isBareGlobalObject(node)) return true;
            const inner = unwrap(node);
            if (inner?.type === 'Identifier') return globalAliases.has(inner.name);
            return (
                inner?.type === 'CallExpression' &&
                inner.callee.type === 'Identifier' &&
                globalGetters.has(inner.callee.name)
            );
        };
        const reportGlobal = (node, name) => context.report({ node, messageId: 'global', data: { name } });
        const reportProbe = (node, name) => context.report({ node, messageId: 'probe', data: { name } });

        return {
            ImportDeclaration(node) {
                if (!BRIDGES.has(node.source.value)) return;
                for (const spec of node.specifiers) {
                    if (spec.type === 'ImportNamespaceSpecifier') bridgesNamespaces.add(spec.local.name);
                    if (spec.type !== 'ImportSpecifier') continue;
                    const imported = spec.imported.type === 'Identifier' ? spec.imported.name : spec.imported.value;
                    if (imported === 'isNative') isNativeNames.add(spec.local.name);
                }
            },
            Identifier(node) {
                if (isNotAUse(node)) return;
                if (isNativeNames.has(node.name)) reportProbe(node, 'isNative()');
                else if (node.name === APP_PROBE) reportProbe(node, `${APP_PROBE}()`);
            },
            MemberExpression(node) {
                const name = propertyName(node);
                if (name === APP_PROBE) {
                    reportProbe(node, `${APP_PROBE}()`);
                    return;
                }
                if (
                    name === 'isNative' &&
                    node.object.type === 'Identifier' &&
                    bridgesNamespaces.has(node.object.name)
                ) {
                    reportProbe(node, 'isNative()');
                    return;
                }
                if (!name?.startsWith(GLOBAL_PREFIX) || !isGlobalObject(node.object) || isWrite(node)) return;
                reportGlobal(node, name);
            },
            VariableDeclarator(node) {
                if (node.id.type === 'Identifier' && node.init) {
                    if (isBareGlobalObject(node.init)) globalAliases.add(node.id.name);
                    else if (returnsGlobalObject(node.init)) globalGetters.add(node.id.name);
                }
                if (node.id.type !== 'ObjectPattern' || !node.init || !isGlobalObject(node.init)) return;
                for (const prop of node.id.properties) {
                    if (prop.type !== 'Property') continue;
                    const key = prop.key.type === 'Identifier' ? prop.key.name : prop.key.value;
                    if (typeof key === 'string' && key.startsWith(GLOBAL_PREFIX)) reportGlobal(prop, key);
                }
            },
            BinaryExpression(node) {
                if (node.operator !== 'in' || !isGlobalObject(node.right)) return;
                const left = node.left;
                if (left.type === 'Literal' && typeof left.value === 'string' && left.value.startsWith(GLOBAL_PREFIX)) {
                    reportGlobal(node, left.value);
                }
            },
        };
    },
};
