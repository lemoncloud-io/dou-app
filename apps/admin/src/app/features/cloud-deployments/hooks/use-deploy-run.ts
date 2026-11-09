/**
 * `hooks/cloud-deployments/use-deploy-run.ts`
 * - The one deploy run the screen can have: start it, stop it, and stop it when the screen goes away.
 *
 * The pacing and the stop rules are `runDeploys`'; this hook only binds a run to the screen's
 * lifetime and keeps its results as state.
 */
import { useEffect, useRef, useState } from 'react';

import { logger } from '@chatic/bridges';

import { postAutoDeploy } from '../api/goodsApi';
import { abortableDelay, runDeploys, type DeployResult, type DeploySummary } from '../lib/runDeploys';

import type { DeployCall } from '../lib/deployPlan';
import type { GoodsTarget } from '../lib/goodsTarget';

export interface DeployRun {
    /** The goods service this run calls, fixed when it started. */
    target: GoodsTarget;
    calls: DeployCall[];
    results: DeployResult[];
    stopping: boolean;
    /** Set once the run has ended, finished or stopped. */
    summary?: DeploySummary;
}

export const useDeployRun = () => {
    const [run, setRun] = useState<DeployRun | null>(null);
    const controllerRef = useRef<AbortController | null>(null);

    // Leaving the screen stops the run. A deploy run nobody is watching should not keep going, and
    // there would be no Stop button left to press.
    useEffect(() => () => controllerRef.current?.abort(), []);

    const start = (base: string, target: GoodsTarget, calls: DeployCall[]) => {
        // One run at a time. The confirm button has no business firing twice, but if it ever does —
        // a dialog that animates out stays clickable for its exit — a second run would deploy every
        // product again, with `force`, and Stop would reach only one of the two.
        if (controllerRef.current) return;
        const controller = new AbortController();
        controllerRef.current = controller;
        setRun({ target, calls, results: [], stopping: false });

        void runDeploys({
            calls,
            deploy: async call => {
                try {
                    return `status: ${(await postAutoDeploy(base, call)).status ?? 'unknown'}`;
                } catch (error) {
                    // The screen shows the failure; this is the trace that outlives it, since these
                    // calls skip the shared http layers and their network log.
                    logger.error('GLOBAL', '[useDeployRun] auto-deploy failed', {
                        error,
                        productId: call.productId,
                        projectId: call.projectId,
                        service: call.service,
                    });
                    throw error;
                }
            },
            wait: abortableDelay,
            signal: controller.signal,
            onResult: result => setRun(prev => (prev ? { ...prev, results: [...prev.results, result] } : prev)),
        })
            .then(({ summary }) => setRun(prev => (prev ? { ...prev, summary } : prev)))
            .finally(() => {
                controllerRef.current = null;
            });
    };

    const stop = () => {
        controllerRef.current?.abort();
        setRun(prev => (prev && !prev.summary ? { ...prev, stopping: true } : prev));
    };

    /** Drops the last run's results. Only reachable between runs: the goods stage is locked during one. */
    const clear = () => setRun(null);

    return { run, running: run !== null && !run.summary, start, stop, clear };
};
