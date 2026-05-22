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

            // On iOS, multiple numbers are separated by comma (e.g. "123,456").
            // On Android, multiple numbers are separated by semicolon (e.g. "123;456").
            const phoneSeparator = Platform.OS === 'ios' ? ',' : ';';
            const joinedNumbers = cleanNumbers.join(phoneSeparator);

            // Separator between the phone number(s) and query parameters (body)
            // iOS: sms:123&body=Hello
            // Android: sms:123?body=Hello
            const querySeparator = Platform.OS === 'ios' ? '&' : '?';

            // Construct SMS url
            const url = `sms:${joinedNumbers}${querySeparator}body=${encodeURIComponent(message)}`;

            this.logger.info('SMS', `Attempting to send SMS to ${cleanNumbers.length} recipient(s)`);

            const canOpen = await Linking.canOpenURL(url);
            if (!canOpen) {
                this.logger.warn('SMS', `Cannot open SMS URL: ${url}`);
                // Fallback: try opening standard sms: protocol without body
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
