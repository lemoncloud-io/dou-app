import type { RuleId } from '../check';
import type { IssueKind, ScenarioIssue } from '../scenarios';

/** The groups `verify` folds its results into, in the order it prints them. */
export const GROUPS = [
    'manifest',
    'permissions',
    'code',
    'bundle',
    'start',
    'backAndClose',
    'display',
    'lifecycle',
    'actions',
    'cloudData',
] as const;
export type GroupId = (typeof GROUPS)[number];

/** A problem in plain words, and how to fix it. `subject` is the permission, field or method. */
export interface RuleText {
    problem: (subject: string) => string;
    fix: (subject: string) => string;
}

export interface IssueText {
    problem: (issue: ScenarioIssue) => string;
    fix: string;
}

/** Everything `verify` says, in one language. Keyed by every rule and issue, so none goes untranslated. */
export interface Messages {
    title: string;
    groups: Record<GroupId, string>;
    rules: Record<RuleId, RuleText>;
    issues: Record<IssueKind, IssueText>;
    passed: string;
    failed: (count: number) => string;
    noScenarioFile: string;
    notBuilt: string;
    talksTo: (hosts: string) => string;
    bundle: (files: number, kilobytes: string) => string;
    detailsHint: string;
    /** What `bundle` says once the zip is written. */
    bundled: (file: string, files: number) => string;
    /** What `bundle` says when it cannot pack: the reason is the tool's own, in English. */
    bundleFailed: (reason: string) => string;
}
