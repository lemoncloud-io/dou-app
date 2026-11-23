import { useEffect, useRef, useState } from 'react';

import { logger } from '@chatic/bridges';

import { postAutoDeploy } from '../api/goodsApi';
import { abortableDelay, runDeploys, type DeployResult, type DeploySummary } from '../lib/runDeploys';

import type { DeployCall } from '../lib/deployPlan';
import type { GoodsTarget } from '../lib/goodsTarget';

export interface DeployRun {
    target: GoodsTarget;
    calls: DeployCall[];
    results: DeployResult[];
    stopping: boolean;
    summary?: DeploySummary;
}

export const useDeployRun = () => {
    const [run, setRun] = useState<DeployRun | null>(null);
    const controllerRef = useRef<AbortController | null>(null);

    useEffect(() => () => controllerRef.current?.abort(), []);

    const start = (base: string, target: GoodsTarget, calls: DeployCall[]) => {
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

    const clear = () => setRun(null);

    return { run, running: run !== null && !run.summary, start, stop, clear };
};
