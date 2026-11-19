import { rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { RULES, check, type RuleId } from './check';
import { buildVariant, cleanup, put, type Edit } from './testing/example';

const MANIFEST = 'public/.well-known/chatic-app.json';
const BUILT_MANIFEST = 'dist/.well-known/chatic-app.json';

/** Adds lines at the end of the page's code: the checker reads them; nothing calls them. */
const appended = (code: string): Edit => ({
    file: 'src/app.ts',
    from: /$/,
    to: `\nexport const broken = () => {\n${code}\n};\n`,
});

/** Rewrites the manifest, in the sources and in the bundle alike. */
const manifest = (change: (manifest: Record<string, unknown>) => unknown) => (root: string) => {
    const base = {
        manifestVersion: 1,
        name: 'Chatic Apps Example',
        permissions: [
            'clipboard',
            'share',
            'openUrl',
            'userKey',
            'session',
            'cloud',
            'place',
            'channel',
            'chat',
            'user',
            'chatSend',
        ],
        display: 'clean',
        orientation: 'portrait',
    };
    const next = change(base) ?? base;
    const text = typeof next === 'string' ? next : JSON.stringify(next);
    put(root, MANIFEST, text);
    put(root, BUILT_MANIFEST, text);
};

interface Variant {
    edits?: Edit[];
    /** Changes the built copy, given the project's folder. */
    then?: (root: string) => void;
}

/** One deliberately broken page per rule: each must fail the checker on that rule. */
const BROKEN: Record<RuleId, Variant> = {
    'manifest/missing': {
        then: root => {
            unlinkSync(join(root, MANIFEST));
            unlinkSync(join(root, BUILT_MANIFEST));
        },
    },
    'manifest/invalid': { then: manifest(() => '{ "manifestVersion": 1,') },
    'manifest/version': { then: manifest(value => ({ ...value, manifestVersion: 2 })) },
    'manifest/name': { then: manifest(value => ({ ...value, name: ' ' })) },
    'manifest/unknown-field': { then: manifest(value => ({ ...value, permision: [] })) },
    'manifest/unknown-permission': {
        then: manifest(value => ({ ...value, permissions: [...(value.permissions as string[]), 'camera'] })),
    },
    'manifest/display': { then: manifest(value => ({ ...value, display: 'fullscreen' })) },
    'manifest/orientation': { then: manifest(value => ({ ...value, orientation: 'upside-down' })) },
    'manifest/unused-permission': {
        edits: [{ file: 'src/app.ts', from: '(await apps.getUserKey())', to: "'no key'" }],
    },
    'manifest/missing-permission': {
        then: manifest(value => ({
            ...value,
            permissions: (value.permissions as string[]).filter(permission => permission !== 'share'),
        })),
    },
    'code/unknown-data-method': {
        edits: [appended("    void apps.data.call<unknown>('user.cacheRead', 'user-two');")],
    },
    'code/local-storage': { edits: [appended("    localStorage.setItem('count', '1');")] },
    'code/os-theme': {
        edits: [
            {
                file: 'src/style.css',
                from: /$/,
                to: '\n@media (prefers-color-scheme: dark) { body { color: white; } }\n',
            },
        ],
    },
    'code/history-routing': { edits: [appended("    history.pushState({}, '', '?screen=rooms');")] },
    'code/popup': { edits: [appended("    window.open('https://login.example.net/');")] },
    'code/version-compare': { edits: [appended("    if ((apps.context?.appVersion ?? '') < '0.30.0') return;")] },
    'code/error-message': {
        edits: [appended("    try { void 0; } catch (error) { if ((error as Error).message === 'TIMEOUT') return; }")],
    },
    'bundle/missing': { then: root => rmSync(join(root, 'dist'), { recursive: true }) },
    'bundle/layout': { then: root => unlinkSync(join(root, 'dist/index.html')) },
    'bundle/build-output-only': { then: root => put(root, 'dist/assets/index.js.map', '{}') },
    'bundle/mock': { edits: [{ file: 'src/main.ts', from: 'if (import.meta.env.DEV)', to: 'if (true)' }] },
};

describe('check', () => {
    it('passes the reference mini-app', () => {
        const root = buildVariant();
        try {
            const result = check({ root });
            expect(result.findings).toEqual([]);
            expect(result.ok).toBe(true);
            expect(result.networkTargets).toEqual([]);
            expect(result.bundle?.files).toBe(3);
        } finally {
            cleanup(root);
        }
    });

    it('has a broken variant for every rule', () => {
        expect(Object.keys(BROKEN).sort()).toEqual(Object.keys(RULES).sort());
    });

    it.each(Object.keys(BROKEN) as RuleId[])('fails a page that breaks %s', rule => {
        const variant = BROKEN[rule];
        const root = buildVariant(variant.edits);
        try {
            variant.then?.(root);
            const result = check({ root });
            expect(result.ok).toBe(false);
            expect(result.findings.map(finding => finding.rule)).toContain(rule);
        } finally {
            cleanup(root);
        }
    });

    it('lists where the page talks to the network, without failing it', () => {
        const root = buildVariant([appended("    void fetch('https://api.example.net/scores', { method: 'POST' });")]);
        try {
            writeFileSync(join(root, 'dist/assets/extra.js'), 'navigator.sendBeacon("https://beacon.example.org/x")');
            const result = check({ root });
            expect(result.ok).toBe(true);
            expect(result.networkTargets).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ via: 'fetch', target: 'https://api.example.net', file: 'src/app.ts' }),
                    expect.objectContaining({ via: 'address', target: 'beacon.example.org' }),
                ])
            );
        } finally {
            cleanup(root);
        }
    });

    it('does not fire on a comment that names what a rule forbids', () => {
        const root = buildVariant([
            appended('    // localStorage, window.open and history.pushState are not used here'),
        ]);
        try {
            expect(check({ root }).findings).toEqual([]);
        } finally {
            cleanup(root);
        }
    });
});
