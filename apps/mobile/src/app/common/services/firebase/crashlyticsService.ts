import crashlytics from '@react-native-firebase/crashlytics';
import { logger } from '../log';
import { getUserAgent } from '../../utils';
import DeviceInfo from 'react-native-device-info';

/**
 * Initializes the Crashlytics service.
 * - Subscribes to the internal logger to pipe all logs into the Crashlytics timeline.
 * - Captures 'error' level logs and reports them as 'Non-fatal' exceptions.
 */
export const initCrashlyticsService = () => {
    void crashlytics().setCrashlyticsCollectionEnabled(true);

    return logger.subscribe((level, tag, message, data, error) => {
        const timestamp = new Date().toISOString();
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
                    ...data,
                });

                crashlytics().recordError(errorToRecord);
                break;
            }
            default:
                break;
        }
    });
};

/**
 * Configures user-specific information and device metadata.
 * - Sets a unique device identifier as the Crashlytics User ID.
 * - Attaches device context (User Agent, App Version, etc.) for enhanced debugging.
 */
export const setupCrashlyticsUser = async () => {
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
};

// Immediate execution for service initialization
void setupCrashlyticsUser();
initCrashlyticsService();
