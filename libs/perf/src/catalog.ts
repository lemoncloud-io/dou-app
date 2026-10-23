import type { TelemetryCatalog } from '@chatic/logger';
import type { PerfTraceName, PerfTraceResult } from './types';

/**
 * What a trace may carry, and what of it Firebase receives.
 *
 * `attributes` and `metrics` are every dimension and measurement the trace is allowed to record on
 * the log pipeline; the pipeline drops anything else, because each key becomes a field the server
 * stores. Attribute values are not enumerated — a performance dimension such as a request type is an
 * open value — so `true` accepts any short string.
 *
 * `firebase` is what Firebase is sent, and it is **exactly what Firebase received before the log
 * pipeline carried traces too**: the same trace names, the same attribute keys (never more than its
 * cap of five), the same metrics. Firebase's numbers are compared against the pipeline's over the
 * same period, so a dimension added for the pipeline must not change them. `null` means the trace is
 * pipeline-only and Firebase never hears of it; `only` restricts a trace to some attribute values —
 * `web_vitals` reaches Firebase for FCP and LCP, the two vitals it has always had.
 */
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

/** A trace Firebase receives in full: every attribute and metric it records. */
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

const ROOM_PHASES = ['handler', 'handshake_done', 'recover_done', 'cloud_done', 'switch_done', 'mount'];
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

/**
 * Every trace name. The existing fourteen are listed as their call sites record them today — see
 * `apps/web/docs/observability/performance.md` and `apps/mobile/docs/boot/boot-metrics.md` — and
 * Firebase keeps receiving all of it. The last three are pipeline-only.
 */
export const PERF_TRACE_CATALOG: PerfTraceCatalog = {
    boot: everywhere(
        'trace',
        ['boot_type'],
        ['provider_ready', 'app_mount', 'main_screen_mount', 'load_start', 'load_end', 'web_app_ready']
    ),
    first_screen: everywhere('sample', ['boot_type', 'reveal'], ['value_ms', 'web_app_ready']),
    cloud_switch: everywhere('trace', ['outcome'], []),
    site_switch: everywhere('trace', ['outcome'], ['verified']),
    web_vitals: {
        kind: 'sample',
        attributes: attrs('vital'),
        metrics: ['value_ms'],
        // INP, CLS and TTFB are recorded for the pipeline only (CLS as ×1000, an integer).
        firebase: { attributes: ['vital'], metrics: ['value_ms'], only: { vital: ['fcp', 'lcp'] } },
    },
    chat_room_open: everywhere(
        'trace',
        ['entry', 'start', 'switch', 'cache', 'outcome'],
        [...ROOM_PHASES, 'cache_emit', 'message_count']
    ),
    chat_room_sync: everywhere(
        'trace',
        ['entry', 'start', 'switch', 'cache', 'outcome'],
        [...ROOM_PHASES, 'verified', 'feed_sent', 'feed_received', 'feed_done', 'fetched', 'latest_no', 'message_count']
    ),
    bridge_request: everywhere(
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
    // ── Pipeline only ──
    /** The long tasks of one screen, summed when the screen is left. */
    long_tasks: {
        kind: 'sample',
        attributes: attrs('screen'),
        metrics: ['count', 'total_ms', 'max_ms'],
        firebase: null,
    },
    /** One `libs/http` request, per endpoint template. */
    api_request: {
        kind: 'sample',
        attributes: attrs('endpoint', 'method', 'status_class', 'outcome', 'backend'),
        metrics: ['rtt_ms', 'res_bytes'],
        firebase: null,
    },
    /** A route's entry to its first meaningful paint. */
    screen_render: { kind: 'trace', attributes: attrs('screen', 'cache'), metrics: ['mount'], firebase: null },
};

/**
 * Whether this build's catalogue knows the trace name. A runtime built later can send one it does
 * not — see `isPipelineOnlyTrace` for why that matters on the native side.
 */
export const isKnownPerfTrace = (name: string, catalog: PerfTraceCatalog = PERF_TRACE_CATALOG): boolean =>
    Object.prototype.hasOwnProperty.call(catalog, name);

/** Whether the catalogue says Firebase never receives this trace. An unknown name is not pipeline-only. */
export const isPipelineOnlyTrace = (name: string, catalog: PerfTraceCatalog = PERF_TRACE_CATALOG): boolean =>
    isKnownPerfTrace(name, catalog) && !(catalog as Record<string, PerfTraceCatalogEntry>)[name].firebase;

/** Whether Firebase receives this trace at all. An unknown name — from a newer runtime — does not. */
export const isFirebaseTrace = (name: string, catalog: PerfTraceCatalog = PERF_TRACE_CATALOG): boolean =>
    !!(catalog as Record<string, PerfTraceCatalogEntry | undefined>)[name]?.firebase;

const pick = <T>(source: Record<string, T>, keys: readonly string[]): Record<string, T> => {
    const out: Record<string, T> = {};
    for (const key of keys) if (key in source) out[key] = source[key];
    return out;
};

/**
 * A stop cut down to what Firebase receives, or `null` when Firebase does not get this one — a
 * pipeline-only name, or a value outside the trace's `only` list. The result has exactly the shape a
 * stop had before (`sample` and `endedAt` are pipeline-side and left off).
 */
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

/**
 * The same catalogue as `@chatic/logger`'s `TelemetryRecorder` reads it: keyed `perf.<name>`, with the
 * record kind each trace is. Hosts pass it (merged with the usage catalogue) to the recorder.
 */
export const PERF_TELEMETRY_CATALOG: TelemetryCatalog = Object.fromEntries(
    Object.entries(PERF_TRACE_CATALOG).map(([name, entry]) => [
        `perf.${name}`,
        { kinds: [entry.kind], attrs: entry.attributes, metrics: entry.metrics },
    ])
);
