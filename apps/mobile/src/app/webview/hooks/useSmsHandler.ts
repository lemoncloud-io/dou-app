import { useCallback } from 'react';
import { useServices } from '../../hooks';
import type { WebMessageAppHandler } from '@chatic/app-messages';

export const useSmsHandler = () => {
    const { smsService, logService: logger } = useServices();

    const handleSendSms = useCallback<WebMessageAppHandler<'SendSms'>>(
        async message => {
            const { phoneNumbers, message: smsText } = message.data;
            try {
                const success = await smsService.sendSms(phoneNumbers, smsText);
                return {
                    type: 'OnSendSms' as const,
                    success: true,
                    data: { success },
                };
            } catch (e: any) {
                logger.error('SMS', 'SendSms error', e);
                return {
                    type: 'OnSendSms' as const,
                    success: false,
                    error: { code: 'SMS_ERROR', message: e.message },
                };
            }
        },
        [smsService, logger]
    );

    return {
        handleSendSms,
    };
};
