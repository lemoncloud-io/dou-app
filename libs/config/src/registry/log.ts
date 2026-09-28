import type { ConfigRegistryModule } from '../types';

/**
 * Log collection and upload — five levers collapsed into three keys, plus the upload tuning
 * discovered in the tunables sweep.
 *
 * `LOG_UPLOAD_FORCED_KEY` used to be a second key that existed only because there was no override
 * layer: the build flag became `log.upload.enabled`'s default and forcing became its local
 * override, so one key now does both jobs. `collection.enabled` stays excluded from `server` —
 * it is a privacy opt-out, and privacy opt-outs must not be something the server can undo.
 *
 * `upload.batchSize`/`intervalMs`/`backoffMs`/`maxAttempts` are `'restart'`:
 * `LogUploadScheduler`'s constructor captures them into instance fields, so a changed value has no
 * effect until the scheduler is rebuilt.
 */
export const logModule: ConfigRegistryModule = {
    'log.collection.enabled': {
        title: 'Log collection',
        description: 'Whether to collect logs on the device. Turning it off also discards logs already collected.',
        type: 'boolean',
        defaultValue: true,
        surface: 'dev',
        writableBy: ['local'],
        persist: 'local',
    },
    'log.upload.enabled': {
        title: 'Log upload',
        description: 'Whether to send collected logs to the server.',
        type: 'boolean',
        defaultValue: true,
        surface: 'dev',
        writableBy: ['shell', 'local', 'server'],
        persist: 'local',
    },
    'log.upload.hold': {
        title: 'Hold log upload',
        description:
            'Keeps logs queued instead of draining them. A debugging lever for reading back logs the device produced, distinct from opting out of collection.',
        type: 'boolean',
        defaultValue: false,
        surface: 'dev',
        writableBy: ['shell', 'local'],
        persist: 'local',
    },
    'log.keepDebug': {
        title: 'Keep debug logs',
        description: 'Also keeps debug-level logs.',
        type: 'boolean',
        defaultValue: false,
        byStage: { LOCAL: true, DEV: true },
        surface: 'dev',
        writableBy: ['shell', 'local'],
        persist: 'none',
    },
    'log.console.mirror': {
        title: 'Mirror console logs',
        description: 'Also prints web console logs to the native console.',
        type: 'boolean',
        defaultValue: false,
        byStage: { LOCAL: true, DEV: true },
        surface: 'dev',
        writableBy: ['shell', 'local'],
        persist: 'none',
    },
    'log.perf.runId': {
        title: 'Perf run ID',
        description: 'An ID identifying this run, used for performance logs. Injected by native.',
        type: 'string',
        defaultValue: '',
        surface: 'dev',
        writableBy: ['shell'],
        persist: 'none',
    },
    'log.upload.batchSize': {
        title: 'Log batch size',
        description: 'The number of log entries sent together in one batch.',
        type: 'number',
        defaultValue: 50,
        surface: 'dev',
        writableBy: ['local', 'server'],
        persist: 'session',
        appliesAt: 'restart',
    },
    'log.upload.intervalMs': {
        title: 'Log upload interval',
        description: 'How often accumulated logs are sent.',
        type: 'number',
        defaultValue: 60_000,
        surface: 'dev',
        writableBy: ['local', 'server'],
        persist: 'session',
        appliesAt: 'restart',
    },
    'log.upload.backoffMs': {
        title: 'Log upload retry backoff',
        description: 'The increasing wait times between retries after a failed upload.',
        type: 'json',
        defaultValue: [5_000, 30_000, 120_000],
        surface: 'dev',
        writableBy: ['local', 'server'],
        persist: 'session',
        appliesAt: 'restart',
    },
    'log.upload.maxAttempts': {
        title: 'Log upload retry attempts',
        description: 'The maximum number of attempts before giving up on a batch.',
        type: 'number',
        defaultValue: 5,
        surface: 'dev',
        writableBy: ['local', 'server'],
        persist: 'session',
        appliesAt: 'restart',
    },
    'log.perf.samplePercent': {
        title: 'Perf metric sample rate',
        description: 'The percentage of devices that send boot performance metrics to the server.',
        type: 'number',
        defaultValue: 10,
        surface: 'dev',
        writableBy: ['local', 'server'],
        persist: 'none',
        appliesAt: 'live',
    },
};
