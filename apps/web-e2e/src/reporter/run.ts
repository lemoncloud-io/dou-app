import type { FullResult, TestResult } from '@playwright/test/reporter';

import type { FeatureCoverage } from '../feature-map/coverage';
import type { ChaosEvent } from '../support/chaos';
import type { Metric } from '../support/evidence';

export interface Image {
    caption: string;
    dataUri: string;
}

export interface ScenarioRecord {
    title: string;
    spec: string;
    line: number;
    project: string;
    tags: string[];
    status: TestResult['status'] | 'flaky';
    expected: boolean;
    durationMs: number;
    retries: number;
    repeat: number;
    error?: string;
    earlierErrors: string[];
    shots: Image[];
    visual: Image[];
    chaos: ChaosEvent[];
    metrics: Metric[];
    unanswered: string[];
}

export interface RunRecord {
    startedAt: string;
    durationMs: number;
    status: FullResult['status'];
    commit: string;
    branch: string;
    grep: string;
    scenarios: ScenarioRecord[];
    coverage: FeatureCoverage | null;
}

export interface VisualResult {
    status: 'pass' | 'fail' | 'error' | 'not-run';
    compared: number;
    failures: { screen: string; project: string; kind: 'diff' | 'missing' | 'error'; reason: string }[];
}

export const visualResult = (run: RunRecord): VisualResult => {
    const visual = run.scenarios.filter(scenario => scenario.tags.includes('@visual'));
    if (visual.length === 0) return { status: 'not-run', compared: 0, failures: [] };
    const failures = visual
        .filter(scenario => !scenario.expected && scenario.status !== 'skipped')
        .map(scenario => ({
            screen: scenario.title,
            project: scenario.project,
            kind: failureKind(scenario),
            reason: firstLine(scenario.error) || scenario.status,
        }));
    const status = failures.some(failure => failure.kind !== 'error') ? 'fail' : failures.length ? 'error' : 'pass';
    return { status, compared: visual.length, failures };
};

const failureKind = (scenario: ScenarioRecord): VisualResult['failures'][number]['kind'] => {
    if (/snapshot doesn't exist/i.test(scenario.error ?? '')) return 'missing';
    if (scenario.visual.some(image => image.caption.endsWith('-diff.png'))) return 'diff';
    return 'error';
};

const firstLine = (text: string | undefined): string => (text ?? '').split('\n').find(line => line.trim()) ?? '';
