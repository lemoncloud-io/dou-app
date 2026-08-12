import crashlytics from '@react-native-firebase/crashlytics';
import DeviceInfo from 'react-native-device-info';
import type { ILogService } from '../../log';
import type { IFirebaseCrashlyticsService } from './types';
import { getUserAgent } from '../../../utils';

export class FirebaseCrashlyticsService implements IFirebaseCrashlyticsService {
    private unsubscribeLog?: () => void;

    constructor(private readonly logger: ILogService) {}

    init() {
        void crashlytics().setCrashlyticsCollectionEnabled(true);

        this.unsubscribeLog = this.logger.subscribe(entry => {
            const { level, tag, message, data, error } = entry;
            // Occurrence time from the entry, so bridged web logs keep their
            // original timeline in the Crashlytics breadcrumb (ADR-0047).
            const timestamp = new Date(entry.timestamp).toISOString();
            const dataString = data ? ` | Data: ${JSON.stringify(data)}` : '';
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
                        ...(typeof data === 'object' && data !== null ? (data as Record<string, string>) : {}),
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
