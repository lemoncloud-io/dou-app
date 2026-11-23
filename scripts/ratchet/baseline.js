'use strict';

const fs = require('fs');

const isCount = value => Number.isInteger(value) && value >= 0;

const flatten = (baseline, prefix = []) => {
    const leaves = new Map();
    for (const [key, value] of Object.entries(baseline || {})) {
        const at = [...prefix, key];
        if (value && typeof value === 'object') {
            for (const [leaf, count] of flatten(value, at)) leaves.set(leaf, count);
        } else if (isCount(value)) {
            leaves.set(JSON.stringify(at), value);
        } else {
            throw new Error(`baseline value at ${at.join(' > ')} is not a non-negative integer`);
        }
    }
    return leaves;
};

const unflattenKey = leaf => JSON.parse(leaf);

const prune = baseline => {
    const out = {};
    for (const key of Object.keys(baseline).sort()) {
        const value = baseline[key];
        if (value && typeof value === 'object') {
            const inner = prune(value);
            if (Object.keys(inner).length) out[key] = inner;
        } else if (value > 0) {
            out[key] = value;
        }
    }
    return out;
};

const serialize = baseline => {
    const pruned = prune(baseline);
    const lines = Object.keys(pruned).map(key => `    ${JSON.stringify(key)}: ${JSON.stringify(pruned[key])}`);
    return lines.length ? `{\n${lines.join(',\n')}\n}\n` : '{}\n';
};

const read = file => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null);

const write = (file, baseline) => fs.writeFileSync(file, serialize(baseline));

const compare = (actual, baseline) => {
    const actualLeaves = flatten(prune(actual));
    const baselineLeaves = flatten(prune(baseline));
    const over = [];
    const under = [];
    for (const [leaf, count] of actualLeaves) {
        const allowed = baselineLeaves.get(leaf) || 0;
        if (count > allowed) over.push({ path: unflattenKey(leaf), count, allowed });
    }
    for (const [leaf, allowed] of baselineLeaves) {
        const count = actualLeaves.get(leaf) || 0;
        if (count < allowed) under.push({ path: unflattenKey(leaf), count, allowed });
    }
    return { over, under };
};

const lower = (baseline, actual) => {
    const actualLeaves = flatten(prune(actual));
    const out = {};
    for (const [leaf, allowed] of flatten(prune(baseline))) {
        const next = Math.min(allowed, actualLeaves.get(leaf) || 0);
        if (next <= 0) continue;
        const at = unflattenKey(leaf);
        let node = out;
        for (const key of at.slice(0, -1)) node = node[key] = node[key] || {};
        node[at[at.length - 1]] = next;
    }
    return prune(out);
};

const renameTarget = (path, renames) => {
    for (const [from, to] of renames) {
        if (path === from) return to;
        if (path.startsWith(`${from}/`)) return to + path.slice(from.length);
    }
    return null;
};

const followRenames = (before, renames) => {
    const out = {};
    for (const [key, value] of Object.entries(prune(before))) {
        const target = renameTarget(key, renames) || key;
        if (value && typeof value === 'object') {
            const merged = (out[target] = { ...(out[target] || {}) });
            for (const [field, count] of Object.entries(value)) merged[field] = Math.max(merged[field] || 0, count);
        } else {
            out[target] = Math.max(out[target] || 0, value);
        }
    }
    return out;
};

const increases = (before, after, renames = new Map()) => {
    const beforeLeaves = flatten(prune(before));
    const moved = new Map();
    for (const [leaf, count] of beforeLeaves) {
        const at = unflattenKey(leaf);
        const target = renameTarget(at[0], renames);
        if (target === null) continue;
        const movedLeaf = JSON.stringify([target, ...at.slice(1)]);
        moved.set(movedLeaf, Math.max(moved.get(movedLeaf) || 0, count));
    }
    const problems = [];
    for (const [leaf, count] of flatten(prune(after))) {
        const allowed = Math.max(beforeLeaves.get(leaf) || 0, moved.get(leaf) || 0);
        if (count > allowed) problems.push({ path: unflattenKey(leaf), count, allowed });
    }
    return problems;
};

module.exports = { flatten, prune, serialize, read, write, compare, lower, followRenames, increases };
