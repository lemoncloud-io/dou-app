const ts = require('typescript');

const KEPT_FLAGS =
    ts.NodeFlags.Let |
    ts.NodeFlags.Const |
    ts.NodeFlags.Using |
    ts.NodeFlags.NestedNamespace |
    ts.NodeFlags.Namespace |
    ts.NodeFlags.OptionalChain |
    ts.NodeFlags.GlobalAugmentation;

const SKIPPED_KEYS = new Set([
    'pos',
    'end',
    'kind',
    'flags',
    'parent',
    'id',
    'modifierFlagsCache',
    'transformFlags',
    'emitNode',
    'jsDoc',
    'jsDocCache',
    'symbol',
    'localSymbol',
    'locals',
    'nextContainer',
    'flowNode',
    'endFlowNode',
    'returnFlowNode',
    'original',
    'multiLine',
]);

const DIRECTIVE =
    /@ts-|eslint|prettier-ignore|[#@]__(PURE|NO_SIDE_EFFECTS|INLINE)__|@vite-ignore|webpack[A-Z]|@jsx|^\/\/\/\s*<(reference|amd)|istanbul|[cv]8 ignore|@refresh|@license|@preserve|source(Mapping)?URL|@flow|biome-ignore|@(vitest|jest)-environment|^\/\*\s*globals?\s/;

function scriptKind(fileName) {
    if (/\.tsx$/.test(fileName)) return ts.ScriptKind.TSX;
    if (/\.jsx$/.test(fileName)) return ts.ScriptKind.JSX;
    if (/\.[cm]?js$/.test(fileName)) return ts.ScriptKind.JS;
    return ts.ScriptKind.TS;
}

function parse(fileName, text) {
    return ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, scriptKind(fileName));
}

function parses(sf) {
    return sf.parseDiagnostics.length === 0;
}

function cleanJsxText(text) {
    const lines = text.split(/\r\n|\n|\r/);
    const kept = [];
    lines.forEach((line, i) => {
        let s = line;
        if (i !== 0) s = s.replace(/^[ \t]+/, '');
        if (i !== lines.length - 1) s = s.replace(/[ \t]+$/, '');
        if (s) kept.push(s);
    });
    return kept.join(' ');
}

function fingerprint(sf) {
    const out = [];
    const visit = node => {
        if (ts.isParenthesizedExpression(node)) {
            const standaloneString = ts.isExpressionStatement(node.parent) && ts.isStringLiteral(node.expression);
            if (!standaloneString) return visit(node.expression);
        }
        if (ts.isJsxExpression(node) && !node.expression && !node.dotDotDotToken) return;
        if (node.kind === ts.SyntaxKind.JsxText) {
            const text = cleanJsxText(node.text);
            if (text) out.push(`T${JSON.stringify(text)}`);
            return;
        }
        out.push(ts.SyntaxKind[node.kind]);
        const flags = node.flags & KEPT_FLAGS;
        if (flags) out.push(`f${flags}`);
        const keys = node.kind === ts.SyntaxKind.SourceFile ? [] : Object.keys(node).sort();
        for (const key of keys) {
            if (SKIPPED_KEYS.has(key)) continue;
            const value = node[key];
            const type = typeof value;
            if (type === 'string' || type === 'number' || type === 'boolean') {
                out.push(`${key}=${JSON.stringify(value)}`);
            }
        }
        out.push('(');
        ts.forEachChild(node, visit, nodes => {
            out.push('[');
            nodes.forEach(visit);
            out.push(']');
        });
        out.push(')');
    };
    visit(sf);
    return out.join(' ');
}

function leaves(sf) {
    const result = [];
    const walk = node => {
        if (node.kind >= ts.SyntaxKind.FirstJSDocNode && node.kind <= ts.SyntaxKind.LastJSDocNode) return;
        const children = node.getChildren(sf);
        if (children.length === 0) result.push(node);
        else children.forEach(walk);
    };
    walk(sf);
    return result;
}

function comments(sf) {
    const text = sf.text;
    const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, sf.languageVariant, text);
    const found = [];
    const seen = new Set();
    for (const leaf of leaves(sf)) {
        if (leaf.kind === ts.SyntaxKind.JsxText) continue;
        const start = leaf.pos;
        const end = leaf.kind === ts.SyntaxKind.EndOfFileToken ? leaf.end : leaf.getStart(sf);
        if (end <= start) continue;
        scanner.resetTokenState(start);
        scanner.setText(text, start, end - start);
        for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) {
            const isComment =
                kind === ts.SyntaxKind.SingleLineCommentTrivia ||
                kind === ts.SyntaxKind.MultiLineCommentTrivia ||
                kind === ts.SyntaxKind.ShebangTrivia;
            const pos = scanner.getTokenStart();
            if (isComment && !seen.has(pos)) {
                seen.add(pos);
                found.push(scanner.getTokenText());
            }
        }
    }
    return found;
}

function shebang(text) {
    return text.startsWith('#!') ? text.slice(0, text.indexOf('\n') >>> 0) : '';
}

function proveCommentRemoval(fileName, before, after) {
    const a = parse(fileName, before);
    const b = parse(fileName, after);
    if (!parses(a) || !parses(b)) return { ok: false, why: 'does not parse, so equality cannot be proven' };
    if (shebang(before) !== shebang(after)) return { ok: false, why: 'the shebang line changed' };
    if (fingerprint(a) !== fingerprint(b)) return { ok: false, why: 'code changed, not only comments' };
    const left = new Map();
    for (const c of comments(a)) left.set(c, (left.get(c) || 0) + 1);
    for (const c of comments(b)) {
        const n = left.get(c) || 0;
        if (n === 0) return { ok: false, why: 'a comment was added or reworded, not only removed' };
        left.set(c, n - 1);
    }
    const removed = [];
    for (const [c, n] of left) for (let i = 0; i < n; i++) removed.push(c);
    const directive = removed.find(c => DIRECTIVE.test(c));
    if (directive) {
        return { ok: false, why: `a tool directive was removed: ${directive.split('\n')[0].slice(0, 80)}` };
    }
    if (removed.length === 0) return { ok: false, why: 'no comment was removed (formatting-only change)' };
    return { ok: true, removed: removed.length };
}

module.exports = { proveCommentRemoval, fingerprint, comments, parse, cleanJsxText, scriptKind };
