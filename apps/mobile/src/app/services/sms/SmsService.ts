import { Linking, Platform } from 'react-native';
import type { ILogService } from '../log';
import type { ISmsService } from './types';

export class SmsService implements ISmsService {
    constructor(private readonly logger: ILogService) {}

    async sendSms(phoneNumbers: string | string[], message: string): Promise<boolean> {
        try {
            const numbers = Array.isArray(phoneNumbers) ? phoneNumbers : [phoneNumbers];
            const cleanNumbers = numbers.map(num => num.trim()).filter(Boolean);

            if (cleanNumbers.length === 0) {
                this.logger.warn('SMS', 'No valid phone numbers provided to send SMS');
                return false;
            }

            const phoneSeparator = Platform.OS === 'ios' ? ',' : ';';
            const joinedNumbers = cleanNumbers.join(phoneSeparator);

            const querySeparator = Platform.OS === 'ios' ? '&' : '?';

            const url = `sms:${joinedNumbers}${querySeparator}body=${encodeURIComponent(message)}`;

            this.logger.info('SMS', `Attempting to send SMS to ${cleanNumbers.length} recipient(s)`);

            const canOpen = await Linking.canOpenURL(url);
            if (!canOpen) {
                this.logger.warn('SMS', `Cannot open SMS URL: ${url}`);
                const fallbackUrl = `sms:${joinedNumbers}`;
                const canOpenFallback = await Linking.canOpenURL(fallbackUrl);
                if (canOpenFallback) {
                    await Linking.openURL(fallbackUrl);
                    return true;
                }
                return false;
            }

            await Linking.openURL(url);
            return true;
        } catch (error: any) {
            this.logger.error('SMS', 'Failed to send SMS', error);
            throw error;
        }
    }
}
