import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { RULES, type RuleId } from './check';
import { en } from './i18n/en';
import { ko } from './i18n/ko';
import type { IssueKind } from './scenarios';
import { SCREENLESS_SCENARIOS } from './scenarios';
import { formatVerify, systemLanguage, verify, type VerifyResult } from './verify';

const HANGUL = /[가-힣]/;

const ISSUES: IssueKind[] = Object.keys(en.issues) as IssueKind[];

describe('the messages', () => {
    it.each(Object.keys(RULES) as RuleId[])('explain %s in both languages', rule => {
        for (const [messages, korean] of [
            [en, false],
            [ko, true],
        ] as const) {
            const problem = messages.rules[rule].problem('share');
            const fix = messages.rules[rule].fix('share');
            expect(problem.length).toBeGreaterThan(0);
            expect(fix.length).toBeGreaterThan(0);
            expect(HANGUL.test(problem + fix)).toBe(korean);
        }
    });

    it.each(ISSUES)('explain the scenario issue %s in both languages', kind => {
        const issue = { kind, text: '', screen: 'rooms', count: 2, detail: 'cloud.getCloud' };
        expect(en.issues[kind].problem(issue)).not.toMatch(HANGUL);
        expect(ko.issues[kind].problem(issue) + ko.issues[kind].fix).toMatch(HANGUL);
    });
});

describe('systemLanguage', () => {
    it('follows the locale the environment names', () => {
        expect(systemLanguage({ LANG: 'ko_KR.UTF-8' })).toBe('ko');
        expect(systemLanguage({ LC_ALL: 'ko-KR' })).toBe('ko');
        expect(systemLanguage({ LANG: 'en_US.UTF-8' })).toBe('en');
        expect(systemLanguage({ LANG: 'C.UTF-8' })).toBe('en');
        expect(systemLanguage({ LC_ALL: 'en_GB.UTF-8', LANG: 'ko_KR.UTF-8' })).toBe('en');
    });
});

describe('the scenarios run without a scenario file', () => {
    it('are the ones that need no screens or buttons', () => {
        expect([...SCREENLESS_SCENARIOS].sort()).toEqual(
            [
                'start',
                'back-at-root',
                'close-guard',
                'theme',
                'hide-resume',
                'consent-refused',
                'cloud-change',
                'rate-limited',
            ].sort()
        );
    });
});

describe('formatVerify', () => {
    const result = (language: 'en' | 'ko'): VerifyResult => ({
        ok: false,
        language,
        items: [
            {
                group: 'permissions',
                problem: (language === 'en' ? en : ko).rules['manifest/missing-permission'].problem('share'),
                fix: (language === 'en' ? en : ko).rules['manifest/missing-permission'].fix('share'),
                where: 'src/app.ts:12',
                source: 'manifest/missing-permission',
            },
        ],
        groups: ['manifest', 'permissions', 'code', 'bundle', 'start'],
        screensSkipped: true,
        scenariosSkipped: false,
        check: {
            ok: false,
            findings: [],
            networkTargets: [],
            bundle: { files: 4, bytes: 23_552, byType: {} },
            permissions: [],
        },
        scenarios: [],
    });

    it('folds passing groups and gives one plain line per problem, without rule names', () => {
        const out = formatVerify(result('en'));
        expect(out).toContain('✓ Manifest');
        expect(out).toContain('✗ Permissions');
        expect(out).toContain(
            '  • The page uses something that needs "share", and does not ask for it (src/app.ts:12) → add "share" to the manifest\'s permissions'
        );
        expect(out).not.toContain('manifest/missing-permission');
        expect(out).toContain('Screen checks were skipped: add chatic-apps.scenarios.ts');
        expect(out).toContain('Bundle: 4 files, 23.0 KB.');
        expect(out).toContain('✗ 1 thing(s) to fix.');
    });

    it('shows the rule names with details', () => {
        expect(formatVerify(result('en'), { details: true })).toContain('[manifest/missing-permission]');
    });

    it('speaks Korean', () => {
        const out = formatVerify(result('ko'));
        expect(out).toContain('✗ 권한');
        expect(out).toContain('(src/app.ts:12) → 매니페스트의 permissions에 "share" 권한을 넣으세요');
        expect(out).toContain('✗ 고칠 것 1개.');
    });
});

const MOCK = resolve(__dirname, '../../chatic-apps-sdk/src/mock.ts');

describe('verify', () => {
    it('says one thing to fix once, however many scenarios met it', async () => {
        // A throwaway built page that never shows what its scenario file waits for.
        const root = mkdtempSync(join(tmpdir(), 'chatic-apps-verify-'));
        try {
            mkdirSync(join(root, 'dist/.well-known'), { recursive: true });
            writeFileSync(join(root, 'dist/index.html'), '<!doctype html><html><body><main></main></body></html>');
            writeFileSync(
                join(root, 'dist/.well-known/chatic-app.json'),
                JSON.stringify({ manifestVersion: 1, name: 'Throwaway', permissions: [] })
            );
            writeFileSync(join(root, 'chatic-apps.scenarios.mjs'), "export default { ready: '#never' };\n");
            const result = await verify({ root, language: 'en', mockModule: MOCK });
            const notReady = result.items.filter(item => item.problem.startsWith('The page never showed #never'));
            expect(notReady).toHaveLength(1);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    }, 60_000);

    it('says what to do for an empty folder, in plain words, without running scenarios', async () => {
        const root = mkdtempSync(join(tmpdir(), 'chatic-apps-verify-'));
        try {
            const result = await verify({ root, language: 'en' });
            expect(result.ok).toBe(false);
            expect(result.scenariosSkipped).toBe(true);
            expect(result.items.map(item => item.source)).toEqual(
                expect.arrayContaining(['bundle/missing', 'manifest/missing'])
            );
            const out = formatVerify(result);
            expect(out).toContain('The page is not built yet → run your build (npm run build), then verify again');
            expect(out).toContain('Behaviour checks were skipped: build the page first.');
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});
