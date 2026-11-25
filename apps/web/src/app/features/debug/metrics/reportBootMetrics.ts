import { runtime } from '@chatic/runtime-react';

import { getBootSnapshot } from './bootMarks';

const REPORT_DELAY_MS = 3000;

let scheduled = false;

export const scheduleBootMetricsReport = (): void => {
    const { bootMetrics } = runtime.diagnostics;
    if (scheduled || !bootMetrics) return;
    scheduled = true;

    setTimeout(() => {
        const snapshot = getBootSnapshot();
        bootMetrics.send({
            marks: {
                mainStartMs: snapshot.marks['main-start'],
                appRenderMs: snapshot.marks['app-render'],
                sessionInitializedMs: snapshot.marks['session-initialized'],
            },
            navigation: snapshot.navigation,
            assets: snapshot.assets.map(({ name, transferSize, durationMs, fromCache }) => ({
                name,
                transferSize,
                durationMs,
                fromCache,
            })),
        });
    }, REPORT_DELAY_MS);
};
