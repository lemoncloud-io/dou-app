import type { TelemetryCatalog } from '@chatic/logger';
import type { PerfTraceName, PerfTraceResult } from './types';

export interface PerfTraceCatalogEntry {
    kind: 'trace' | 'sample';
    attributes: Readonly<Record<string, true>>;
    metrics: readonly string[];
    firebase: {
        attributes: readonly string[];
        metrics: readonly string[];
        only?: Readonly<Record<string, readonly string[]>>;
    } | null;
}

export type PerfTraceCatalog = Readonly<Record<PerfTraceName, PerfTraceCatalogEntry>>;

const attrs = (...keys: string[]): Record<string, true> => Object.fromEntries(keys.map(key => [key, true]));

const everywhere = (
    kind: 'trace' | 'sample',
    attributeKeys: readonly string[],
    metrics: readonly string[]
): PerfTraceCatalogEntry => ({
    kind,
    attributes: attrs(...attributeKeys),
    metrics,
    firebase: { attributes: attributeKeys, metrics },
});

export const SESSION_OWNER_ATTRIBUTE = 'session_owner';

const everywhereByOwner = (
    kind: 'trace' | 'sample',
    attributeKeys: readonly string[],
    metrics: readonly string[]
): PerfTraceCatalogEntry => ({
    ...everywhere(kind, attributeKeys, metrics),
    attributes: attrs(...attributeKeys, SESSION_OWNER_ATTRIBUTE),
});

const ROOM_PHASES = ['handler', 'handshake_done', 'recover_done', 'cloud_done', 'switch_done', 'mount'];
const ROOM_SYNC_METRICS = [
    ...ROOM_PHASES,
    'verified',
    'feed_sent',
    'feed_received',
    'feed_done',
    'fetched',
    'latest_no',
    'message_count',
];
const MEDIA_PHASES = [
    'row',
    'converted',
    'socket',
    'prepared',
    'upload_started',
    'bytes_sent',
    'upload_completed',
    'sent',
];

export const PERF_TRACE_CATALOG: PerfTraceCatalog = {
    boot: everywhereByOwner(
        'trace',
        ['boot_type'],
        ['provider_ready', 'app_mount', 'main_screen_mount', 'load_start', 'load_end', 'web_app_ready']
    ),
    first_screen: everywhereByOwner('sample', ['boot_type', 'reveal'], ['value_ms', 'web_app_ready']),
    cloud_switch: everywhere('trace', ['outcome'], []),
    site_switch: everywhere('trace', ['outcome'], ['verified']),
    web_vitals: {
        kind: 'sample',
        attributes: attrs('vital'),
        metrics: ['value_ms'],
        firebase: { attributes: ['vital'], metrics: ['value_ms'], only: { vital: ['fcp', 'lcp'] } },
    },
    chat_room_open: everywhereByOwner(
        'trace',
        ['entry', 'start', 'switch', 'cache', 'outcome'],
        [...ROOM_PHASES, 'cache_emit', 'message_count']
    ),
    chat_room_sync: {
        kind: 'trace',
        attributes: attrs('entry', 'start', 'switch', 'cache', 'outcome', SESSION_OWNER_ATTRIBUTE),
        metrics: ROOM_SYNC_METRICS,
        firebase: { attributes: ['entry', 'start', 'switch', 'cache', 'outcome'], metrics: ROOM_SYNC_METRICS },
    },
    bridge_request: everywhereByOwner(
        'sample',
        ['type', 'outcome'],
        ['rtt_ms', 'in_flight', 'queue_ms', 'req_chars', 'res_chars']
    ),
    chat_send: everywhere('trace', ['thread', 'kind', 'outcome'], []),
    socket_verify: everywhere('sample', ['kind', 'cause', 'outcome'], ['value_ms', 'connected_ms', 'device_ms']),
    socket_request: everywhere('sample', ['type', 'kind', 'outcome', 'close_reason'], ['rtt_ms']),
    chat_send_media: everywhere(
        'sample',
        ['kind', 'count', 'size', 'thread', 'outcome'],
        ['value_ms', 'bytes_kb', 'files', 'retry', ...MEDIA_PHASES.map(phase => `${phase}_ms`)]
    ),
    state_outbox: everywhere('sample', ['op', 'outcome', 'kind'], ['delivery_ms', 'wait_socket_ms', 'attempts']),
    invite_accept: everywhere(
        'trace',
        ['lane', 'outcome', 'step', 'room'],
        ['login', 'cloud', 'site', 'profile_check', 'invite_read', 'accepted', 'room']
    ),
    long_tasks: {
        kind: 'sample',
        attributes: attrs('screen'),
        metrics: ['count', 'total_ms', 'max_ms'],
        firebase: null,
    },
    api_request: {
        kind: 'sample',
        attributes: attrs('endpoint', 'method', 'status_class', 'outcome', 'backend'),
        metrics: ['rtt_ms', 'res_bytes'],
        firebase: null,
    },
    screen_render: { kind: 'trace', attributes: attrs('screen', 'cache'), metrics: ['mount'], firebase: null },
    image_load: {
        kind: 'sample',
        attributes: attrs('variant', 'source', 'store', 'fallback'),
        metrics: ['value_ms', 'store_ms', 'fetch_ms', 'bytes_kb'],
        firebase: null,
    },
    image_refresh: { kind: 'sample', attributes: attrs('kind', 'outcome'), metrics: ['value_ms'], firebase: null },
};

export const isKnownPerfTrace = (name: string, catalog: PerfTraceCatalog = PERF_TRACE_CATALOG): boolean =>
    Object.prototype.hasOwnProperty.call(catalog, name);

export const isPipelineOnlyTrace = (name: string, catalog: PerfTraceCatalog = PERF_TRACE_CATALOG): boolean =>
    isKnownPerfTrace(name, catalog) && !(catalog as Record<string, PerfTraceCatalogEntry>)[name].firebase;

export const isFirebaseTrace = (name: string, catalog: PerfTraceCatalog = PERF_TRACE_CATALOG): boolean =>
    !!(catalog as Record<string, PerfTraceCatalogEntry | undefined>)[name]?.firebase;

const pick = <T>(source: Record<string, T>, keys: readonly string[]): Record<string, T> => {
    const out: Record<string, T> = {};
    for (const key of keys) if (key in source) out[key] = source[key];
    return out;
};

export const firebaseResultOf = (
    result: PerfTraceResult,
    catalog: PerfTraceCatalog = PERF_TRACE_CATALOG
): PerfTraceResult | null => {
    const firebase = (catalog as Record<string, PerfTraceCatalogEntry | undefined>)[result.name]?.firebase;
    if (!firebase) return null;

    for (const [key, allowed] of Object.entries(firebase.only ?? {})) {
        if (!allowed.includes(result.attributes[key])) return null;
    }

    return {
        id: result.id,
        name: result.name,
        durationMs: result.durationMs,
        attributes: pick(result.attributes, firebase.attributes),
        metrics: pick(result.metrics, firebase.metrics),
    };
};

export const PERF_TELEMETRY_CATALOG: TelemetryCatalog = Object.fromEntries(
    Object.entries(PERF_TRACE_CATALOG).map(([name, entry]) => [
        `perf.${name}`,
        { kinds: [entry.kind], attrs: entry.attributes, metrics: entry.metrics },
    ])
);
