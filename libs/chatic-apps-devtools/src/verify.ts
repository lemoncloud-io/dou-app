import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { check, type CheckResult, type RuleId } from './check';
import { loadScenarioConfig } from './config';
import { en } from './i18n/en';
import { ko } from './i18n/ko';
import { GROUPS, type GroupId, type Messages } from './i18n/messages';
import { loadDist } from './page';
import { SCREENLESS_SCENARIOS, runScenarios, type ScenarioName, type ScenarioResult } from './scenarios';

/**
 * `verify`: the one command an author runs. It checks the page, then runs the scenarios on its build,
 * and says what is wrong and how to fix it, in plain words — the checker's and the runner's rule names
 * stay behind `--details`. With no scenario file it runs what needs no screens.
 */

export type Language = 'en' | 'ko';

export const MESSAGES: Record<Language, Messages> = { en, ko };

const RULE_GROUPS: Record<RuleId, GroupId> = {
    'manifest/missing': 'manifest',
    'manifest/invalid': 'manifest',
    'manifest/version': 'manifest',
    'manifest/name': 'manifest',
    'manifest/unknown-field': 'manifest',
    'manifest/display': 'manifest',
    'manifest/orientation': 'manifest',
    'manifest/unknown-permission': 'permissions',
    'manifest/unused-permission': 'permissions',
    'manifest/missing-permission': 'permissions',
    'code/unknown-data-method': 'code',
    'code/local-storage': 'code',
    'code/os-theme': 'code',
    'code/history-routing': 'code',
    'code/popup': 'code',
    'code/version-compare': 'code',
    'code/error-message': 'code',
    'bundle/missing': 'bundle',
    'bundle/layout': 'bundle',
    'bundle/build-output-only': 'bundle',
    'bundle/mock': 'bundle',
};

const SCENARIO_GROUPS: Record<ScenarioName, GroupId> = {
    start: 'start',
    screens: 'backAndClose',
    'back-at-root': 'backAndClose',
    'close-guard': 'backAndClose',
    theme: 'display',
    'hide-resume': 'lifecycle',
    actions: 'actions',
    'device-refused': 'actions',
    'consent-refused': 'cloudData',
    'cloud-change': 'cloudData',
    'big-list': 'cloudData',
    'rate-limited': 'cloudData',
    rotation: 'display',
};

/** One thing to fix, in the reader's language. */
export interface VerifyItem {
    group: GroupId;
    /** What is wrong. */
    problem: string;
    /** How to fix it. */
    fix: string;
    /** `file:line`, or the screen it happened on. */
    where?: string;
    /** The checker rule or scenario behind it, for `--details`. */
    source: string;
}

export interface VerifyResult {
    ok: boolean;
    language: Language;
    items: VerifyItem[];
    /** Every group that was checked, passed or not, in print order. */
    groups: GroupId[];
    /** No scenario file: the screen checks did not run. */
    screensSkipped: boolean;
    /** No build: the behaviour checks did not run. */
    scenariosSkipped: boolean;
    check: CheckResult;
    scenarios: ScenarioResult[];
}

export interface VerifyOptions {
    root: string;
    src?: string;
    /** The build folder; `dist` by default. */
    dist?: string;
    /** The module the mock is imported from; the project's installed SDK by default. */
    mockModule?: string;
    language?: Language;
}

/** The reader's language: Korean when the system says so, English otherwise. */
export const systemLanguage = (env: NodeJS.ProcessEnv = process.env): Language => {
    const named = env.LC_ALL || env.LC_MESSAGES || env.LANG || env.LANGUAGE || '';
    if (named) return /^ko\b|^ko[_-]/i.test(named) ? 'ko' : 'en';
    try {
        return Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase().startsWith('ko') ? 'ko' : 'en';
    } catch {
        return 'en';
    }
};

/** Checks the page in `options.root`, runs the scenarios that apply, and explains the result. */
export const verify = async (options: VerifyOptions): Promise<VerifyResult> => {
    const root = resolve(options.root);
    const language = options.language ?? systemLanguage();
    const text = MESSAGES[language];
    const dist = options.dist ?? 'dist';
    const distDir = resolve(root, dist);

    const checked = check({ root, src: options.src, dist });
    const items: VerifyItem[] = checked.findings.map(finding => {
        const rule = text.rules[finding.rule];
        const subject = finding.subject ?? '';
        return {
            group: RULE_GROUPS[finding.rule],
            problem: rule.problem(subject),
            fix: rule.fix(subject),
            where: finding.file ? `${finding.file}${finding.line ? `:${finding.line}` : ''}` : undefined,
            source: finding.rule,
        };
    });

    const built = existsSync(join(distDir, 'index.html'));
    const { config, file } = loadScenarioConfig(root);
    let scenarios: ScenarioResult[] = [];
    if (built) {
        const manifestPath = join(distDir, '.well-known', 'chatic-app.json');
        let permissions: string[] = [];
        let display: string | undefined;
        try {
            const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
                permissions?: unknown;
                display?: unknown;
            };
            if (Array.isArray(manifest.permissions)) permissions = manifest.permissions.map(String);
            if (typeof manifest.display === 'string') display = manifest.display;
        } catch {
            // The checker has said what is wrong with the manifest; the scenarios run with no permission.
        }
        scenarios = await runScenarios({
            source: await loadDist(distDir),
            permissions,
            display,
            config,
            mockModule: options.mockModule,
            resolveDir: root,
            only: file ? undefined : [...SCREENLESS_SCENARIOS],
        });
        for (const result of scenarios) {
            for (const issue of result.issues) {
                const explained = text.issues[issue.kind];
                const problem = explained.problem(issue);
                // One thing to fix is said once, however many scenarios met it.
                if (items.some(item => item.problem === problem && item.where === issue.screen)) continue;
                items.push({
                    group: SCENARIO_GROUPS[result.name],
                    problem,
                    fix: explained.fix,
                    where: issue.screen,
                    source: `scenario ${result.name}: ${issue.kind}`,
                });
            }
        }
    }

    const ran = new Set<GroupId>(['manifest', 'permissions', 'code', 'bundle']);
    for (const result of scenarios) if (result.ran) ran.add(SCENARIO_GROUPS[result.name]);
    return {
        ok: items.length === 0,
        language,
        items,
        groups: GROUPS.filter(group => ran.has(group)),
        screensSkipped: built && !file,
        scenariosSkipped: !built,
        check: checked,
        scenarios,
    };
};

/** The result as `verify` prints it: one ✓ line per passing group, one line per thing to fix. */
export const formatVerify = (result: VerifyResult, { details = false } = {}): string => {
    const text = MESSAGES[result.language];
    const lines: string[] = [text.title, ''];
    for (const group of result.groups) {
        const items = result.items.filter(item => item.group === group);
        if (items.length === 0) {
            lines.push(`✓ ${text.groups[group]}`);
            continue;
        }
        lines.push(`✗ ${text.groups[group]}`);
        for (const item of items) {
            const where = item.where ? ` (${item.where})` : '';
            const source = details ? `  [${item.source}]` : '';
            lines.push(`  • ${item.problem}${where} → ${item.fix}${source}`);
        }
    }
    const notes: string[] = [];
    if (result.scenariosSkipped) notes.push(text.notBuilt);
    if (result.screensSkipped) notes.push(text.noScenarioFile);
    const hosts = [...new Set(result.check.networkTargets.map(target => target.target))];
    if (hosts.length) notes.push(text.talksTo(hosts.join(', ')));
    if (result.check.bundle) {
        notes.push(text.bundle(result.check.bundle.files, (result.check.bundle.bytes / 1024).toFixed(1)));
    }
    if (notes.length) lines.push('', ...notes);
    lines.push('', result.ok ? text.passed : text.failed(result.items.length));
    if (!result.ok && !details) lines.push(text.detailsHint);
    return lines.join('\n');
};
