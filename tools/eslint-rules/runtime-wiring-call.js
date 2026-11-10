'use strict';

const path = require('node:path');

/**
 * Keeps the runtime's wiring calls in the one file that assembles the runtime.
 *
 * A wiring call hands a package something it needs to run — the storage it keeps the session in,
 * the data graph sync reads, the renewer a failed request recovers through. Each of them is
 * assignment: the last call wins. So a second call site is not a harmless duplicate; whichever runs
 * later silently replaces what the assembly chose, and nothing in the assembly shows that it
 * happened. Holding every call in one file is what lets that file be read as the whole wiring.
 *
 * The file is named by its path from the repository root, worked out from this module's own place
 * in the tree — not from where lint was started, which for a project's lint target is that project.
 *
 * Options:
 * - `calls` — the wiring calls. `{ name }` is a function (`configureSessionStore()`, also when
 *   imported under another name or called through a namespace, `session.configureSessionStore()`).
 *   `{ object, name }` is a method on an object whose own
 *   name is `object`, however it was reached (`sessionMedia.configure(…)`,
 *   `runtime.session.sessionMedia.configure(…)`).
 * - `allowedFiles` — repository-relative paths of the files that may make them.
 *
 * Tests are not this rule's business: they wire packages up on purpose, and the config that turns
 * the rule on leaves them out. What it does not see: a call through a computed member
 * (`sessionMedia['configure']`), or a wiring function handed around as a value and called under a
 * name the catalogue does not know.
 */
const REPO_ROOT = path.resolve(__dirname, '..', '..');

/** The name an expression ends in: `a` for `a`, `c` for `a.b.c`, nothing for anything else. */
const tailName = node => {
    if (node.type === 'Identifier') return node.name;
    if (node.type === 'MemberExpression' && !node.computed && node.property.type === 'Identifier') {
        return node.property.name;
    }
    return undefined;
};

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
    meta: {
        type: 'problem',
        docs: {
            description: 'Only the runtime assembly point may make a wiring call.',
        },
        schema: [
            {
                type: 'object',
                properties: {
                    calls: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: { object: { type: 'string' }, name: { type: 'string' } },
                            required: ['name'],
                            additionalProperties: false,
                        },
                    },
                    allowedFiles: { type: 'array', items: { type: 'string' } },
                },
                required: ['calls', 'allowedFiles'],
                additionalProperties: false,
            },
        ],
        messages: {
            outsideAssembly:
                "'{{call}}' wires the runtime, and only {{allowed}} may wire it. A second call site silently replaces what the assembly chose — pass what you need into the assembly instead.",
        },
    },
    create(context) {
        const { calls, allowedFiles } = context.options[0];
        const file = path.relative(REPO_ROOT, context.filename).split(path.sep).join('/');
        if (allowedFiles.includes(file)) return {};

        const functions = new Set(calls.filter(call => !call.object).map(call => call.name));
        const methods = new Set(calls.filter(call => call.object).map(call => `${call.object}.${call.name}`));
        // Local name → catalogue name, for wiring functions imported under another name.
        const aliases = new Map();
        const allowed = allowedFiles.join(', ');

        return {
            ImportSpecifier(node) {
                const imported = node.imported.type === 'Identifier' ? node.imported.name : node.imported.value;
                if (functions.has(imported)) aliases.set(node.local.name, imported);
            },
            CallExpression(node) {
                const { callee } = node;
                let call;
                if (callee.type === 'Identifier') {
                    const name = aliases.get(callee.name) ?? callee.name;
                    if (functions.has(name)) call = name;
                } else if (callee.type === 'MemberExpression' && !callee.computed) {
                    const key = `${tailName(callee.object)}.${tailName(callee)}`;
                    if (methods.has(key)) call = key;
                    // `import * as session from '@chatic/session'` reaches the same function.
                    else if (functions.has(tailName(callee))) call = tailName(callee);
                }
                if (call) context.report({ node, messageId: 'outsideAssembly', data: { call, allowed } });
            },
        };
    },
};
