import { validateTelemetryRecord } from '@chatic/logger';

import { firebaseResultOf, isFirebaseTrace, PERF_TELEMETRY_CATALOG, PERF_TRACE_CATALOG } from './catalog';

import type { PerfTraceName, PerfTraceResult } from './types';

/**
 * Every attribute and metric each existing trace records today, and so everything Firebase has been
 * receiving. Written out by hand on purpose: if the catalogue's Firebase list drifts from this, the
 * data Firebase receives has changed, and the comparison against the pipeline is off.
 */
const FIREBASE_TODAY: Record<string, { attributes: string[]; metrics: string[] }> = {
    boot: {
        attributes: ['boot_type'],
        metrics: ['provider_ready', 'app_mount', 'main_screen_mount', 'load_start', 'load_end', 'web_app_ready'],
    },
    first_screen: { attributes: ['boot_type', 'reveal'], metrics: ['value_ms', 'web_app_ready'] },
    cloud_switch: { attributes: ['outcome'], metrics: [] },
    site_switch: { attributes: ['outcome'], metrics: ['verified'] },
    web_vitals: { attributes: ['vital'], metrics: ['value_ms'] },
    chat_room_open: {
        attributes: ['entry', 'start', 'switch', 'cache', 'outcome'],
        metrics: [
            'handler',
            'handshake_done',
            'recover_done',
            'cloud_done',
            'switch_done',
            'mount',
            'cache_emit',
            'message_count',
        ],
    },
    chat_room_sync: {
        attributes: ['entry', 'start', 'switch', 'cache', 'outcome'],
        metrics: [
            'handler',
            'handshake_done',
            'recover_done',
            'cloud_done',
            'switch_done',
            'verified',
            'mount',
            'feed_sent',
            'feed_received',
            'feed_done',
            'fetched',
            'latest_no',
            'message_count',
        ],
    },
    bridge_request: {
        attributes: ['type', 'outcome'],
        metrics: ['rtt_ms', 'in_flight', 'queue_ms', 'req_chars', 'res_chars'],
    },
    chat_send: { attributes: ['thread', 'kind', 'outcome'], metrics: [] },
    socket_verify: { attributes: ['kind', 'cause', 'outcome'], metrics: ['value_ms', 'connected_ms', 'device_ms'] },
    socket_request: { attributes: ['type', 'kind', 'outcome', 'close_reason'], metrics: ['rtt_ms'] },
    chat_send_media: {
        attributes: ['kind', 'count', 'size', 'thread', 'outcome'],
        metrics: [
            'value_ms',
            'bytes_kb',
            'files',
            'retry',
            'row_ms',
            'converted_ms',
            'socket_ms',
            'prepared_ms',
            'upload_started_ms',
            'bytes_sent_ms',
            'upload_completed_ms',
            'sent_ms',
        ],
    },
    state_outbox: { attributes: ['op', 'outcome', 'kind'], metrics: ['delivery_ms', 'wait_socket_ms', 'attempts'] },
    invite_accept: {
        attributes: ['lane', 'outcome', 'step', 'room'],
        metrics: ['login', 'cloud', 'site', 'profile_check', 'invite_read', 'accepted', 'room'],
    },
};

const resultWith = (name: PerfTraceName, attributes: string[], metrics: string[], extra = false): PerfTraceResult => ({
    id: 't',
    name,
    durationMs: 10,
    attributes: Object.fromEntries([
        ...attributes.map(key => [key, key === 'vital' ? 'lcp' : 'v']),
        ...(extra ? [['network', '4g']] : []),
    ]),
    metrics: Object.fromEntries([...metrics.map((key, i) => [key, i]), ...(extra ? [['new_phase', 1]] : [])]),
    sample: true,
    endedAt: 1,
});

describe('firebaseResultOf — Firebase receives exactly what it did', () => {
    it.each(Object.entries(FIREBASE_TODAY))('%s keeps every attribute and metric it had', (name, today) => {
        const full = resultWith(name as PerfTraceName, today.attributes, today.metrics);

        expect(firebaseResultOf(full)).toEqual({
            id: 't',
            name,
            durationMs: 10,
            attributes: full.attributes,
            metrics: full.metrics,
        });
    });

    it.each(Object.entries(FIREBASE_TODAY))('%s drops a dimension added for the pipeline only', (name, today) => {
        const withExtra = resultWith(name as PerfTraceName, today.attributes, today.metrics, true);
        const out = firebaseResultOf(withExtra);

        expect(out?.attributes).not.toHaveProperty('network');
        expect(out?.metrics).not.toHaveProperty('new_phase');
    });

    it('never sends Firebase more than five attributes', () => {
        for (const entry of Object.values(PERF_TRACE_CATALOG)) {
            if (entry.firebase) expect(entry.firebase.attributes.length).toBeLessThanOrEqual(5);
        }
    });

    it('covers every existing trace and leaves the three new ones to the pipeline', () => {
        const firebaseNames = (Object.keys(PERF_TRACE_CATALOG) as PerfTraceName[]).filter(name =>
            isFirebaseTrace(name)
        );
        expect(firebaseNames.sort()).toEqual(Object.keys(FIREBASE_TODAY).sort());
        for (const name of ['long_tasks', 'api_request', 'screen_render'] as const) {
            expect(firebaseResultOf(resultWith(name, [], []))).toBeNull();
        }
    });

    it('sends web_vitals to Firebase for FCP and LCP only', () => {
        const vital = (value: string) => ({
            ...resultWith('web_vitals', [], ['value_ms']),
            attributes: { vital: value },
        });

        expect(firebaseResultOf(vital('fcp'))).not.toBeNull();
        expect(firebaseResultOf(vital('lcp'))).not.toBeNull();
        for (const v of ['inp', 'cls', 'ttfb']) expect(firebaseResultOf(vital(v))).toBeNull();
    });

    it('does not treat an unknown name as a Firebase trace', () => {
        expect(isFirebaseTrace('nope')).toBe(false);
    });
});

describe('PERF_TELEMETRY_CATALOG', () => {
    it('accepts every attribute and metric a trace records, as the pipeline validates it', () => {
        for (const [name, entry] of Object.entries(PERF_TRACE_CATALOG)) {
            const result = validateTelemetryRecord(PERF_TELEMETRY_CATALOG, {
                tag: `perf.${name}`,
                kind: entry.kind,
                durationMs: 1,
                attrs: Object.fromEntries(Object.keys(entry.attributes).map(key => [key, 'x'])),
                metrics: Object.fromEntries(entry.metrics.map(key => [key, 1])),
            });

            expect(result.ok).toBe(true);
            expect(result.rejections).toEqual([]);
        }
    });

    it('keeps every key inside the pipeline limits', () => {
        for (const entry of Object.values(PERF_TRACE_CATALOG)) {
            expect(Object.keys(entry.attributes).length).toBeLessThanOrEqual(16);
            expect(entry.metrics.length).toBeLessThanOrEqual(32);
        }
    });
});
