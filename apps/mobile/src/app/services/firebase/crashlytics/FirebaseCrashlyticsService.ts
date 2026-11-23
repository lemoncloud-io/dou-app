import crashlytics from '@react-native-firebase/crashlytics';
import DeviceInfo from 'react-native-device-info';
import { isTelemetryEntry, redactSensitive, safeStringify } from '@chatic/logger';
import type { ILogService } from '../../log';
import { NATIVE_RUN_ID } from '../../log/native/nativeLogContext';
import type { IFirebaseCrashlyticsService } from './types';
import { getUserAgent } from '../../../utils';

const STRICT = { strict: true } as const;

const toCrashlyticsAttributes = (data: unknown): Record<string, string> => {
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return {};

    return Object.fromEntries(
        Object.entries(redactSensitive(data, STRICT) as Record<string, unknown>).map(([key, value]) => [
            key,
            typeof value === 'string' ? value : (safeStringify(value, STRICT) ?? ''),
        ])
    );
};

export class FirebaseCrashlyticsService implements IFirebaseCrashlyticsService {
    private unsubscribeLog?: () => void;

    constructor(private readonly logger: ILogService) {}

    init() {
        void crashlytics().setCrashlyticsCollectionEnabled(true);

        void crashlytics().setAttribute('run_id', NATIVE_RUN_ID);

        this.unsubscribeLog = this.logger.subscribe(entry => {
            const { level, tag, message, data, error } = entry;

            if (level === 'debug') return;

            if (isTelemetryEntry(entry)) return;

            const timestamp = new Date(entry.timestamp).toISOString();
            const dataString = data ? ` | Data: ${safeStringify(data, STRICT) ?? ''}` : '';
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
