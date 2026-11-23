'use strict';

const FIELDS = ['comments', 'asAny', 'tsIgnore', 'tsExpectError', 'eslintDisableNoReason', 'useEffect'];

const PUBLIC_JSDOC_PACKAGES = ['libs/chatic-apps-sdk/', 'libs/chatic-apps-devtools/'];
const TEST_FILE = /(\.(spec|test)\.[cm]?[jt]sx?$)|(^|\/)(__tests__|__mocks__)\//;
const LICENSE = /licen[cs]e|copyright|SPDX-License-Identifier/i;
const LICENSE_LINE = /^(copyright\b|SPDX-License-Identifier:|@license\b|licensed under\b)/i;
const BLOCK_ESLINT_DIRECTIVE = /^(eslint-disable|eslint-enable|eslint\s|eslint-env\s|globals?\s|exported\s)/;
const LINE_ESLINT_DIRECTIVE = /^eslint-disable-(next-)?line\b/;
const ESLINT_DISABLE = /^eslint-disable/;
const HAS_REASON = /\s--\s*\S/;
const TOOL_DIRECTIVE =
    /^(prettier-ignore|@vite-ignore|webpack[A-Z]\w*\s*:|(istanbul|c8|v8|node:coverage)\s+(ignore|disable|enable)|[@#]__(PURE|NO_SIDE_EFFECTS)__|@jsx(ImportSource|Runtime|Frag)?\s|@refresh\s|@ts-check)/;
const RATCHET_ALLOW = /^ratchet-allow\s+([\w,\s]+?)\s+--\s*\S/;

const isTestFile = relativePath => TEST_FILE.test(relativePath);

const isPublicJsdocFile = relativePath =>
    PUBLIC_JSDOC_PACKAGES.some(prefix => relativePath.startsWith(prefix)) && !isTestFile(relativePath);

const directiveText = comment =>
    comment.value
        .trim()
        .replace(/^\/+\s*/, '')
        .replace(/^\*\s*/, '');

const allowsKnownFields = match =>
    match[1]
        .split(/[\s,]+/)
        .filter(Boolean)
        .every(field => field !== 'comments' && FIELDS.includes(field));

const isLicense = comment =>
    comment.type === 'Block' ? LICENSE.test(comment.value) : LICENSE_LINE.test(directiveText(comment));

const classifyComment = (comment, { relativePath, isFirst }) => {
    if (comment.type === 'Shebang') return 'ignore';
    const text = directiveText(comment);
    if (comment.type === 'Line' && comment.value.startsWith('/ <reference')) return 'exempt';
    if (/^@ts-(ignore|nocheck)\b/.test(text)) return 'tsIgnore';
    if (/^@ts-expect-error\b/.test(text)) return 'tsExpectError';
    const eslintDirective = comment.type === 'Block' ? BLOCK_ESLINT_DIRECTIVE : LINE_ESLINT_DIRECTIVE;
    if (eslintDirective.test(text)) {
        if (HAS_REASON.test(text)) return 'exempt';
        return ESLINT_DISABLE.test(text) ? 'eslintDisableNoReason' : 'exempt';
    }
    if (TOOL_DIRECTIVE.test(text)) return 'exempt';
    const allow = RATCHET_ALLOW.exec(text);
    if (allow && allowsKnownFields(allow)) return 'exempt';
    if (isFirst && isLicense(comment)) return 'exempt';
    if (comment.type === 'Block' && comment.value.startsWith('*') && isPublicJsdocFile(relativePath)) return 'exempt';
    return 'comment';
};

const allowedLines = comments => {
    const allowed = new Map();
    for (const comment of comments) {
        const match = RATCHET_ALLOW.exec(directiveText(comment));
        if (!match || !allowsKnownFields(match)) continue;
        const fields = match[1].split(/[\s,]+/).filter(Boolean);
        for (const line of [comment.loc.end.line, comment.loc.end.line + 1]) {
            const set = allowed.get(line) || new Set();
            fields.forEach(field => set.add(field));
            allowed.set(line, set);
        }
    }
    return allowed;
};

const isAnyAssertion = node =>
    (node.type === 'TSAsExpression' || node.type === 'TSTypeAssertion') &&
    node.typeAnnotation &&
    node.typeAnnotation.type === 'TSAnyKeyword';

const isUseEffectCall = node => {
    if (node.type !== 'CallExpression') return false;
    const callee = node.callee;
    if (callee.type === 'Identifier') return callee.name === 'useEffect';
    return (
        callee.type === 'MemberExpression' &&
        !callee.computed &&
        callee.property.type === 'Identifier' &&
        callee.property.name === 'useEffect'
    );
};

const walk = (root, visitorKeys, visit) => {
    const stack = [root];
    while (stack.length) {
        const node = stack.pop();
        visit(node);
        const keys = visitorKeys[node.type] || [];
        for (const key of keys) {
            const child = node[key];
            if (Array.isArray(child)) {
                for (const item of child) if (item && typeof item.type === 'string') stack.push(item);
            } else if (child && typeof child.type === 'string') {
                stack.push(child);
            }
        }
    }
};

const countSource = ({ ast, comments, visitorKeys, relativePath }) => {
    const counts = Object.fromEntries(FIELDS.map(field => [field, 0]));
    const occurrences = Object.fromEntries(FIELDS.map(field => [field, []]));
    const commentLines = new Map();
    const allowed = allowedLines(comments);
    const isAllowed = (field, line) => (allowed.get(line) || new Set()).has(field);
    const real = comments.filter(comment => comment.type !== 'Shebang');
    const codeStart = ast.body && ast.body.length ? ast.body[0].range[0] : Infinity;

    real.forEach((comment, index) => {
        const kind = classifyComment(comment, { relativePath, isFirst: index === 0 && comment.range[0] < codeStart });
        if (kind === 'comment') {
            for (let line = comment.loc.start.line; line <= comment.loc.end.line; line++) {
                if (!commentLines.has(line)) commentLines.set(line, comment.loc);
            }
        } else if (FIELDS.includes(kind) && !isAllowed(kind, comment.loc.start.line)) {
            counts[kind]++;
            occurrences[kind].push(comment.loc);
        }
    });
    counts.comments = commentLines.size;
    occurrences.comments = [...commentLines.keys()].sort((a, b) => a - b).map(line => commentLines.get(line));

    walk(ast, visitorKeys, node => {
        if (isAnyAssertion(node) && !isAllowed('asAny', node.loc.start.line)) {
            counts.asAny++;
            occurrences.asAny.push(node.loc);
        } else if (isUseEffectCall(node) && !isAllowed('useEffect', node.loc.start.line)) {
            counts.useEffect++;
            occurrences.useEffect.push(node.loc);
        }
    });

    return { counts, occurrences };
};

const compact = counts => {
    const entry = {};
    for (const field of FIELDS) if (counts[field] > 0) entry[field] = counts[field];
    return entry;
};

module.exports = { FIELDS, countSource, compact, classifyComment, isTestFile };
