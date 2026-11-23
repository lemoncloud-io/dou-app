import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@chatic/bridges';
import { useClouds } from '../../../hooks/useCloudCatalog';

import { EmailVerifyRefusal, findCloudByEmail, isEmailAlreadyRegistered } from '../lib';
import { useVerifyEmailCode, type EmailVerifyRequest } from './useVerifyEmailCode';

export const useCloudEmailGuard = (): ((request: EmailVerifyRequest) => Promise<void>) => {
    const { t } = useTranslation();
    const verifyEmailCode = useVerifyEmailCode();
    const { data: cloudsData } = useClouds({ limit: -1 });
    const clouds = cloudsData?.list ?? [];

    return useCallback(
        async (request: EmailVerifyRequest) => {
            if (request.step !== 'check' && findCloudByEmail(clouds, request.email)) {
                logger.warn('CLOUD', 'email already bound to another cloud', { step: request.step });
                throw new EmailVerifyRefusal(t('addAccount.emailAlreadyUsed'));
            }
            try {
                await verifyEmailCode(request);
            } catch (error) {
                const sending = request.step === 'send' || request.step === 'resend';
                if (sending && isEmailAlreadyRegistered(error)) {
                    throw new EmailVerifyRefusal(t('addAccount.emailAlreadyRegistered'));
                }
                throw error;
            }
        },
        [clouds, t, verifyEmailCode]
    );
};
