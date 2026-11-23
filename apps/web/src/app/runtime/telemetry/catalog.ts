import { PERF_TELEMETRY_CATALOG } from '@chatic/perf';

import { APP_ICON_ATTR_VALUES } from './appIcon';

import type { TelemetryCatalog } from '@chatic/bridges';

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
    'usage.app_icon_change': {
        kinds: ['event'],
        attrs: { from: APP_ICON_ATTR_VALUES, to: APP_ICON_ATTR_VALUES },
    },
    'usage.app_icon_in_use': {
        kinds: ['event'],
        attrs: { icon: APP_ICON_ATTR_VALUES },
    },
};

const PIPELINE_CATALOG: TelemetryCatalog = {
    'perf.telemetry_dropped': { kinds: ['sample'], metrics: ['count'] },
};

export const WEB_TELEMETRY_CATALOG: TelemetryCatalog = {
    ...PERF_TELEMETRY_CATALOG,
    ...USAGE_CATALOG,
    ...PIPELINE_CATALOG,
};
