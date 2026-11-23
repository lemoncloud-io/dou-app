#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [root = path.join(os.homedir(), '.claude', 'projects'), match = 'dou-app', since = ''] = process.argv.slice(2);
const sinceMs = since ? Date.parse(since) : 0;

const files = [];
const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory() && entry.name !== 'subagents') walk(full);
        else if (entry.name.endsWith('.jsonl') && full.includes(match)) files.push(full);
    }
};
walk(root);

const quantile = (values, p) => {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const i = (sorted.length - 1) * p;
    const lo = Math.floor(i);
    return sorted[lo] + (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]) * (i - lo);
};

const sessions = [];
const switches = { model: { n: 0, recreated: 0 }, effort: { n: 0, recreated: 0 } };

for (const file of files) {
    const byId = new Map();
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
        if (!line) continue;
        let entry;
        try {
            entry = JSON.parse(line);
        } catch {
            continue;
        }
        const message = entry.message;
        if (entry.type !== 'assistant' || entry.isSidechain || !message?.usage || !message.id) continue;
        if (message.model === '<synthetic>' || Date.parse(entry.timestamp) < sinceMs) continue;
        const usage = message.usage;
        byId.set(message.id, {
            model: message.model,
            effort: entry.effort ?? null,
            input: usage.input_tokens ?? 0,
            created: usage.cache_creation_input_tokens ?? 0,
            read: usage.cache_read_input_tokens ?? 0,
            output: usage.output_tokens ?? 0,
        });
    }
    const turns = [...byId.values()].filter(t => t.input + t.created + t.read > 0);
    if (turns.length < 5) continue;
    const total = key => turns.reduce((sum, t) => sum + t[key], 0);
    const read = total('read');
    const created = total('created');
    const input = total('input');
    sessions.push({
        turns: turns.length,
        read,
        created,
        input,
        output: total('output'),
        hit: read / (read + created + input),
    });
    for (let i = 1; i < turns.length; i += 1) {
        const prev = turns[i - 1];
        const next = turns[i];
        const context = prev.read + prev.created + prev.input;
        if (context < 5000) continue;
        const recreated = next.created >= context / 2 ? 1 : 0;
        if (prev.model !== next.model) {
            switches.model.n += 1;
            switches.model.recreated += recreated;
        } else if (prev.effort && next.effort && prev.effort !== next.effort) {
            switches.effort.n += 1;
            switches.effort.recreated += recreated;
        }
    }
}

const column = key => sessions.map(s => s[key]);
const summary = {
    sessions: sessions.length,
    hitRatio: {
        median: quantile(column('hit'), 0.5),
        p25: quantile(column('hit'), 0.25),
        p75: quantile(column('hit'), 0.75),
    },
    tokensPerSession: {
        cacheRead: quantile(column('read'), 0.5),
        cacheCreation: quantile(column('created'), 0.5),
        output: quantile(column('output'), 0.5),
    },
    midSessionSwitches: switches,
};
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
