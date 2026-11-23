import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

import type { FullConfig, FullResult, Reporter, Suite, TestCase, TestResult } from '@playwright/test/reporter';

import { currentCoverage, type FeatureCoverage } from '../feature-map/coverage';
import { CHAOS_TIMELINE_ATTACHMENT, type ChaosEvent } from '../support/chaos';
import { METRICS_ATTACHMENT, SHOT_PREFIX, type Metric } from '../support/evidence';
import { renderEvidence } from './render';
import { visualResult, type Image, type RunRecord, type ScenarioRecord } from './run';

const DEFAULT_DIR = resolve(__dirname, '..', '..', '..', '..', 'dist', '.playwright', 'apps', 'web-e2e', 'evidence');

class EvidenceReporter implements Reporter {
    private dir: string;
    private readonly scenarios = new Map<string, ScenarioRecord>();
    private config!: FullConfig;
    private startedAt = new Date();

    private readonly featureMap: boolean;

    constructor(options: { outputDir?: string; featureMap?: boolean } = {}) {
        this.dir = process.env['WEB_E2E_EVIDENCE_DIR'] ?? options.outputDir ?? DEFAULT_DIR;
        this.featureMap = options.featureMap ?? true;
    }

    printsToStdio(): boolean {
        return false;
    }

    onBegin(config: FullConfig, _suite: Suite): void {
        this.config = config;
        if (config.configFile) this.dir = resolve(dirname(config.configFile), this.dir);
        this.startedAt = new Date();
        rmSync(join(this.dir, '..', 'visual-result.json'), { force: true });
    }

    onTestEnd(test: TestCase, result: TestResult): void {
        const project = test.parent.project()?.name ?? '';
        const key = `${test.id}#${result.retry}#${project}#${test.repeatEachIndex}`;
        const testDir = test.parent.project()?.testDir ?? '';
        const outcome = test.outcome();
        const earlier = this.scenarios.get(`${test.id}#${result.retry - 1}#${project}#${test.repeatEachIndex}`);
        const error = result.error
            ? stripAnsi(result.error.message ?? String(result.error.value ?? '')).slice(0, 2_000)
            : undefined;
        this.scenarios.set(key, {
            title: test.titlePath().slice(3).join(' › ') || test.title,
            spec: relative(testDir, test.location.file).split(sep).join('/'),
            line: test.location.line,
            project,
            tags: test.tags,
            status: outcome === 'flaky' ? 'flaky' : result.status,
            expected: result.status === test.expectedStatus,
            durationMs: result.duration,
            retries: result.retry,
            repeat: test.repeatEachIndex,
            error,
            earlierErrors: earlier ? [...earlier.earlierErrors, ...(earlier.error ? [earlier.error] : [])] : [],
            ...readAttachments(result, test.repeatEachIndex === 0),
        });
        if (result.retry > 0) {
            this.scenarios.delete(`${test.id}#${result.retry - 1}#${project}#${test.repeatEachIndex}`);
        }
    }

    onEnd(result: FullResult): void {
        if (this.scenarios.size === 0) return;
        const run: RunRecord = {
            startedAt: this.startedAt.toISOString(),
            durationMs: result.duration,
            status: result.status,
            commit: git(['rev-parse', '--short', 'HEAD']),
            branch: git(['rev-parse', '--abbrev-ref', 'HEAD']),
            grep: String(this.config.grep ?? ''),
            scenarios: [...this.scenarios.values()].sort(
                (a, b) => a.spec.localeCompare(b.spec) || a.line - b.line || a.project.localeCompare(b.project)
            ),
            coverage: this.featureMap ? safeCoverage() : null,
        };
        mkdirSync(this.dir, { recursive: true });
        writeFileSync(join(this.dir, 'index.html'), renderEvidence(run));
        writeFileSync(join(this.dir, 'summary.json'), `${JSON.stringify(summarize(run, this.dir), null, 2)}\n`);

        const visual = visualResult(run);
        if (visual.status !== 'not-run') {
            writeFileSync(join(this.dir, '..', 'visual-result.json'), `${JSON.stringify(visual, null, 2)}\n`);
            if (process.env['GITHUB_ACTIONS']) {
                for (const failure of visual.failures) {
                    console.log(
                        `::error title=visual-regression::${failure.kind}: ${failure.screen} [${failure.project}] ${failure.reason}`
                    );
                }
            }
        }
        console.log(`\nEvidence report: ${join(this.dir, 'index.html')}`);
        if (visual.status !== 'not-run') {
            console.log(
                `Visual regression: ${visual.status} (${visual.compared} compared, ${visual.failures.length} failed)`
            );
        }
    }
}

const readAttachments = (result: TestResult, keepLastScreen: boolean) => {
    const shots: Image[] = [];
    const visual: Image[] = [];
    const chaos: ChaosEvent[] = [];
    const metrics: Metric[] = [];
    const unanswered: string[] = [];
    let lastScreen: Image | undefined;
    for (const attachment of result.attachments) {
        const body =
            attachment.body ??
            (attachment.path && existsSync(attachment.path) ? readFileSync(attachment.path) : undefined);
        if (!body) continue;
        if (attachment.contentType === 'image/png' || attachment.contentType === 'image/jpeg') {
            const image = {
                caption: attachment.name,
                dataUri: `data:${attachment.contentType};base64,${body.toString('base64')}`,
            };
            if (attachment.name.startsWith(SHOT_PREFIX)) {
                shots.push({ ...image, caption: attachment.name.slice(SHOT_PREFIX.length) });
            } else if (/-(expected|actual|diff)\.png$/.test(attachment.name)) visual.push(image);
            else if (attachment.name === 'screenshot') lastScreen = { ...image, caption: 'last screen' };
        } else if (attachment.name === CHAOS_TIMELINE_ATTACHMENT) {
            chaos.push(...parseList<ChaosEvent>(body));
        } else if (attachment.name === METRICS_ATTACHMENT) {
            metrics.push(...parseList<Metric>(body));
        } else if (attachment.name === 'backend-unanswered' || attachment.name === 'shell-not-found') {
            unanswered.push(
                ...body
                    .toString()
                    .split('\n')
                    .filter(Boolean)
                    .map(line => `${attachment.name}: ${line}`)
            );
        }
    }
    if (lastScreen && shots.length === 0 && keepLastScreen) shots.push(lastScreen);
    return { shots, visual, chaos, metrics, unanswered };
};

const parseList = <T>(body: Buffer): T[] => {
    try {
        const parsed: unknown = JSON.parse(body.toString());
        return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
        return [];
    }
};

const summarize = (run: RunRecord, dir: string) => {
    const imagesDir = join(dir, 'images');
    rmSync(imagesDir, { recursive: true, force: true });
    mkdirSync(imagesDir, { recursive: true });
    const write = (scenario: ScenarioRecord, kind: string, images: Image[]) =>
        images.map((image, index) => {
            const [, type = 'png', data = ''] = /^data:image\/(\w+);base64,(.*)$/.exec(image.dataUri) ?? [];
            const name = [scenario.project, scenario.spec, scenario.line, `r${scenario.repeat}`, kind, index + 1]
                .join('-')
                .replace(/[^a-zA-Z0-9-]+/g, '-');
            const file = `${name}.${type === 'jpeg' ? 'jpg' : type}`;
            writeFileSync(join(imagesDir, file), Buffer.from(data, 'base64'));
            return { caption: image.caption, file: `images/${file}` };
        });
    return {
        ...run,
        scenarios: run.scenarios.map(scenario => {
            const { shots, visual, ...rest } = scenario;
            return {
                ...rest,
                screenshots: write(scenario, 'shot', shots),
                visualImages: write(scenario, 'visual', visual),
            };
        }),
    };
};

const safeCoverage = (): FeatureCoverage | null => {
    try {
        return currentCoverage();
    } catch {
        return null;
    }
};

const git = (args: string[]): string => {
    try {
        return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
        return '';
    }
};

// eslint-disable-next-line no-control-regex -- Playwright's messages carry terminal colour codes
const stripAnsi = (text: string): string => text.replace(/\u001b\[[0-9;]*m/g, '');

export default EvidenceReporter;
