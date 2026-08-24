import crashlytics from '@react-native-firebase/crashlytics';
import DeviceInfo from 'react-native-device-info';
import { redactSensitive, safeStringify } from '@chatic/logger';
import type { ILogService } from '../../log';
import { NATIVE_RUN_ID } from '../../log/nativeLogContext';
import type { IFirebaseCrashlyticsService } from './types';
import { getUserAgent } from '../../../utils';

/**
 * Crashlytics attributes are a flat string map, so an entry's `data` cannot be
 * spread in as-is: nested values arrive as `[object Object]` and the keys are
 * whatever the call site happened to use.
 *
 * More importantly this is a sink OUTSIDE the upload path, so it has to redact
 * for itself. `dispatch` keeps the raw value in the buffer and masking happens
 * inside `safeStringify`, which only the wire mapper calls — anything that
 * reads `entry.data` directly is reading unmasked input.
 */
const toCrashlyticsAttributes = (data: unknown): Record<string, string> => {
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return {};

    return Object.fromEntries(
        Object.entries(redactSensitive(data) as Record<string, unknown>).map(([key, value]) => [
            key,
            typeof value === 'string' ? value : (safeStringify(value) ?? ''),
        ])
    );
};

export class FirebaseCrashlyticsService implements IFirebaseCrashlyticsService {
    private unsubscribeLog?: () => void;

    constructor(private readonly logger: ILogService) {}

    init() {
        void crashlytics().setCrashlyticsCollectionEnabled(true);

        // The run id is the only thing tying a Crashlytics crash back to this
        // launch's uploaded logs. A native crash kills the process before
        // anything can report, so the stack exists only in the Crashlytics
        // console while the surrounding logs exist only in the collector —
        // without a shared axis the two halves cannot be put back together.
        // Set in init(), not setupUser(), so a crash in the boot window (while
        // setupUser is still awaiting DeviceInfo) is already tagged.
        void crashlytics().setAttribute('run_id', NATIVE_RUN_ID);

        this.unsubscribeLog = this.logger.subscribe(entry => {
            const { level, tag, message, data, error } = entry;
            // Occurrence time from the entry, so bridged web logs keep their
            // original timeline in the Crashlytics breadcrumb (ADR-0047).
            const timestamp = new Date(entry.timestamp).toISOString();
            const dataString = data ? ` | Data: ${safeStringify(data) ?? ''}` : '';
            const logLine = `${timestamp} [${level.toUpperCase()}] [${tag}] ${message}${dataString}`;
            crashlytics().log(logLine);

            switch (level) {
                case 'error': {
                    let errorToRecord: Error;

                    if (error instanceof Error) {
                        errorToRecord = error;
                        errorToRecord.name = tag;
                    } else {
                        errorToRecord = new Error(message);
                        errorToRecord.name = tag;
                    }

                    void crashlytics().setAttributes({
                        error_tag: tag,
                        error_message: message,
                        ...toCrashlyticsAttributes(data),
                    });

                    crashlytics().recordError(errorToRecord);
                    break;
                }
                default:
                    break;
            }
        });
    }

    async setupUser() {
        try {
            const [uniqueId, ua] = await Promise.all([DeviceInfo.getUniqueId(), getUserAgent()]);

            await crashlytics().setUserId(uniqueId);

            await crashlytics().setAttributes({
                user_agent: ua,
                app_version: DeviceInfo.getVersion(),
                build_number: DeviceInfo.getBuildNumber(),
            });
        } catch (error) {
            console.error('[Crashlytics] Identity setup failed:', error);
        }
    }
}
