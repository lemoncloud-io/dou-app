import * as fc from 'fast-check';

import { LOG_CONTEXT_FIELDS } from '@chatic/logger';

import { toAppLogInfo, toLogEntry } from './appLogInfoCodec';

import type { AppLogInfo } from '@chatic/bridge-messages';
import type { LogEntry } from '@chatic/logger';

const RUNS = { numRuns: 200, seed: 1123 };

const text = fc.string({ maxLength: 16 });
const jsonPayload = fc.jsonValue({ maxDepth: 3 }).filter(value => value !== null);

const context = fc.record(Object.fromEntries(LOG_CONTEXT_FIELDS.map(field => [field, text])), {
    requiredKeys: [],
});

const structured = fc.record(
    {
        kind: fc.constantFrom('log', 'trace', 'sample', 'event'),
        httpStatus: fc.integer({ min: 100, max: 599 }),
        errorCode: text,
        durationMs: fc.nat(),
        attrs: fc.dictionary(text, text, { maxKeys: 4 }),
        metrics: fc.dictionary(text, fc.integer(), { maxKeys: 4 }),
        sr: fc.double({ min: 0, max: 1, noNaN: true }),
        pv: fc.nat(),
        seq: fc.nat(),
    },
    { requiredKeys: [] }
);

const entry = fc
    .tuple(
        context,
        structured,
        fc.record(
            {
                id: text,
                level: fc.constantFrom('debug', 'info', 'warn', 'error'),
                tag: text,
                message: fc.string(),
                timestamp: fc.nat(),
                data: jsonPayload,
                error: jsonPayload,
            },
            { requiredKeys: ['level', 'tag', 'message', 'timestamp'] }
        )
    )
    .map(([ctx, fields, base]) => ({ ...ctx, ...fields, ...base }) as LogEntry);

const acrossTheBridge = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe('app log bridge codec properties', () => {
    it('a web log entry sent to the app and read back is the same entry, marked as from the web', () => {
        fc.assert(
            fc.property(entry, original => {
                const roundTrip = toLogEntry(acrossTheBridge(toAppLogInfo(original)));

                expect(roundTrip).toEqual(acrossTheBridge({ ...original, source: 'web' }));
            }),
            RUNS
        );
    });

    it('reading an app log twice gives the same entry as reading it once', () => {
        fc.assert(
            fc.property(entry, original => {
                const info = acrossTheBridge(toAppLogInfo(original));
                const once = toLogEntry(info);

                expect(toLogEntry(acrossTheBridge(once) as AppLogInfo)).toEqual(once);
            }),
            RUNS
        );
    });
});
