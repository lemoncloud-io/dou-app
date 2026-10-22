import { PERF_TELEMETRY_CATALOG } from '@chatic/perf';

import type { TelemetryCatalog } from '@chatic/bridges';

/**
 * The usage events this build records, and the two bookkeeping samples the pipeline writes about
 * itself. Together with `@chatic/perf`'s traces this is the closed list the recorder accepts.
 *
 * **Only the screen and session events, for now.** The rest of the usage catalogue (a login, a sent
 * message, …) is still being settled with product, and an event cannot be renamed once it has data
 * behind it. Attribute values here are closed sets, except `screen`, whose values are the route
 * templates — a closed set too, generated from the route table.
 */
const USAGE_CATALOG: TelemetryCatalog = {
    'usage.screen_view': {
        kinds: ['event'],
        attrs: { screen: true, prev_screen: true },
        metrics: ['prev_dwell_ms'],
    },
    'usage.session_start': {
        kinds: ['event'],
        attrs: { start: ['cold', 'warm', 'resume'], entry: ['icon', 'push', 'deeplink', 'browser'] },
    },
    'usage.session_end': {
        kinds: ['event'],
        metrics: ['duration_ms', 'screens'],
    },
};

/** Statistics the pipeline writes about itself. */
const PIPELINE_CATALOG: TelemetryCatalog = {
    /** Statistics the queue had to drop for room, counted since the last one of these. */
    'perf.telemetry_dropped': { kinds: ['sample'], metrics: ['count'] },
};

export const WEB_TELEMETRY_CATALOG: TelemetryCatalog = {
    ...PERF_TELEMETRY_CATALOG,
    ...USAGE_CATALOG,
    ...PIPELINE_CATALOG,
};
