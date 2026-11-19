import { runtime } from '@chatic/runtime';

import { getBootSnapshot } from './bootMarks';

const REPORT_DELAY_MS = 3000;

let scheduled = false;

/**
 * Send the web boot snapshot to the native shell exactly once per page load.
 * Called when the router unblocks; the delay lets late resource entries
 * (lazy chunks, fonts) land so the asset cache table is complete. Only where the
 * `diagnostics` port has a boot record to merge it into: a page that sends its own
 * (a browser session) has no shell to persist the record.
 */
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
