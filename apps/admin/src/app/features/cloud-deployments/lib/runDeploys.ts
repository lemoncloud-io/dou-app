import type { DeployCall } from './deployPlan';

export const DEPLOY_INTERVAL_MS = 1500;

export interface DeployResult {
    call: DeployCall;
    ok: boolean;
    message: string;
}

export interface DeploySummary {
    succeeded: number;
    failed: number;
    notStarted: number;
}

export interface RunDeploysOptions {
    calls: DeployCall[];
    deploy: (call: DeployCall) => Promise<string>;
    wait: (ms: number, signal: AbortSignal) => Promise<void>;
    signal: AbortSignal;
    onResult?: (result: DeployResult) => void;
    intervalMs?: number;
}

const failureMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const summarizeResults = (results: DeployResult[], total: number): DeploySummary => {
    const succeeded = results.filter(result => result.ok).length;
    return { succeeded, failed: results.length - succeeded, notStarted: total - results.length };
};

export const runDeploys = async ({
    calls,
    deploy,
    wait,
    signal,
    onResult,
    intervalMs = DEPLOY_INTERVAL_MS,
}: RunDeploysOptions): Promise<{ results: DeployResult[]; summary: DeploySummary }> => {
    const results: DeployResult[] = [];

    for (const [index, call] of calls.entries()) {
        if (signal.aborted) break;
        if (index > 0) await wait(intervalMs, signal);
        if (signal.aborted) break;

        let result: DeployResult;
        try {
            result = { call, ok: true, message: await deploy(call) };
        } catch (error) {
            result = { call, ok: false, message: failureMessage(error) };
        }
        results.push(result);
        onResult?.(result);
    }

    return { results, summary: summarizeResults(results, calls.length) };
};

export const abortableDelay = (ms: number, signal: AbortSignal): Promise<void> =>
    new Promise(resolve => {
        if (signal.aborted) {
            resolve();
            return;
        }
        const done = () => {
            clearTimeout(timer);
            signal.removeEventListener('abort', done);
            resolve();
        };
        const timer = setTimeout(done, ms);
        signal.addEventListener('abort', done);
    });
