/**
 * `lib/cloud-deployments/runDeploys.ts`
 * - Works through a call list one call at a time, with a pause between calls and a way to stop.
 *
 * One call at a time with a 1.5-second gap is the pace the hand-run deploy script used; nothing on
 * the goods service enforces it (it has no deploy lock and no rate limit), so it is a habit kept, not
 * a measured limit.
 *
 * Stopping is cooperative. The signed request builder takes no `AbortSignal`, so a call already sent
 * is waited out; what a stop guarantees is that no further call starts. The call and the wait are
 * passed in, so tests drive the runner without a network or a clock.
 */
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
    /** Calls the run never reached because it was stopped. */
    notStarted: number;
}

export interface RunDeploysOptions {
    calls: DeployCall[];
    /** Resolves with the line to show for a success; a rejection is a failed call. */
    deploy: (call: DeployCall) => Promise<string>;
    /** Resolves after `ms`, or earlier once `signal` aborts. */
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

/**
 * Runs every call in order. A failed call is recorded and the run moves on — one cloud refusing a
 * deploy is no reason to leave the rest on the old build.
 */
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
        // Checked before the pause and again after it: a stop pressed during the call skips the
        // pause, and one pressed during the pause must not let the next call out.
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

/** The production `wait`: a timer that a stop cuts short. */
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
