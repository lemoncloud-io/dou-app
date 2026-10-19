import type { WebMessageData } from '@chatic/app-messages';
import type { ILogService, ISmsService } from '../../services';

export const createSmsHandlers = (smsService: ISmsService, logger: ILogService) => {
    const handleSendSms = async (message: WebMessageData<'SendSms'>) => {
        const { phoneNumbers, message: smsText } = message.data;
        try {
            const opened = await smsService.sendSms(phoneNumbers, smsText);
            // A composer that could not open is an answer, not a failed request: it travels in
            // `data`, the shape `OnSendSmsPayload` declares, so the web can fall back to the
            // clipboard on purpose. The reply's own `success` stays for a request that broke.
            return {
                type: 'OnSendSms' as const,
                success: true,
                data: { success: opened },
            };
        } catch (e: any) {
            logger.error('SMS', 'SendSms error', e);
            return {
                type: 'OnSendSms' as const,
                success: false,
                error: { code: 'SMS_ERROR', message: e?.message ?? 'Failed to open the SMS composer.' },
            };
        }
    };

    return {
        handleSendSms,
    };
};
