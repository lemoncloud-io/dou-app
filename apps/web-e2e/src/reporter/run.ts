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
    status: 'pass' | 'fail' | 'not-run';
    compared: number;
    failures: { screen: string; project: string; reason: string }[];
}

export const visualResult = (run: RunRecord): VisualResult => {
    const visual = run.scenarios.filter(scenario => scenario.tags.includes('@visual'));
    if (visual.length === 0) return { status: 'not-run', compared: 0, failures: [] };
    const failures = visual
        .filter(scenario => !scenario.expected && scenario.status !== 'skipped')
        .map(scenario => ({
            screen: scenario.title,
            project: scenario.project,
            reason: firstLine(scenario.error) || scenario.status,
        }));
    return { status: failures.length ? 'fail' : 'pass', compared: visual.length, failures };
};

const firstLine = (text: string | undefined): string => (text ?? '').split('\n').find(line => line.trim()) ?? '';
