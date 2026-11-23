'use strict';

const fs = require('fs');
const path = require('path');

const { FIELDS, countSource } = require('./ratchet-count');

const DEFAULT_ROOT = path.resolve(__dirname, '../..');
const DEFAULT_BASELINE = path.join(DEFAULT_ROOT, 'scripts/ratchet/source-ratchet-baseline.json');

const LABELS = {
    comments: 'comment lines',
    asAny: '`as any` assertions',
    tsIgnore: '`@ts-ignore` directives',
    tsExpectError: '`@ts-expect-error` directives',
    eslintDisableNoReason: '`eslint-disable` directives without a `-- reason`',
    useEffect: '`useEffect` calls',
};

const messageData = (field, count, allowed) => ({
    count: String(count),
    label: LABELS[field],
    allowed: String(allowed),
    hint:
        field === 'comments'
            ? 'Say it in a name, a test or the module README instead (tools/eslint-rules/README.md § ratchet).'
            : `Remove it, or justify one occurrence with \`// ratchet-allow ${field} -- <reason>\` on the line above (tools/eslint-rules/README.md § ratchet).`,
});

const cache = new Map();

const loadBaseline = file => {
    let stat;
    try {
        stat = fs.statSync(file);
    } catch {
        return {};
    }
    const cached = cache.get(file);
    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) return cached.baseline;
    const baseline = JSON.parse(fs.readFileSync(file, 'utf8'));
    cache.set(file, { mtimeMs: stat.mtimeMs, size: stat.size, baseline });
    return baseline;
};

module.exports = {
    messageData,
    meta: {
        type: 'problem',
        docs: {
            description:
                'Fails a file that has more comment lines, escape hatches or useEffect calls than its ratchet baseline.',
        },
        schema: [
            {
                type: 'object',
                properties: {
                    root: { type: 'string' },
                    baselineFile: { type: 'string' },
                },
                additionalProperties: false,
            },
        ],
        messages: {
            over: 'This file has {{count}} {{label}}; its ratchet baseline allows {{allowed}}. {{hint}}',
        },
    },
    create(context) {
        const options = context.options[0] || {};
        const root = options.root || DEFAULT_ROOT;
        const baselineFile = options.baselineFile || DEFAULT_BASELINE;
        const relativePath = path.relative(root, context.filename).split(path.sep).join('/');
        if (relativePath.startsWith('..')) return {};

        return {
            'Program:exit'(program) {
                const sourceCode = context.sourceCode;
                const { counts, occurrences } = countSource({
                    ast: program,
                    comments: sourceCode.getAllComments(),
                    visitorKeys: sourceCode.visitorKeys,
                    relativePath,
                });
                const entry = loadBaseline(baselineFile)[relativePath] || {};
                for (const field of FIELDS) {
                    const allowed = entry[field] || 0;
                    if (counts[field] <= allowed) continue;
                    const loc = occurrences[field][allowed] || occurrences[field][0] || program.loc;
                    context.report({ loc, messageId: 'over', data: messageData(field, counts[field], allowed) });
                }
            },
        };
    },
};
