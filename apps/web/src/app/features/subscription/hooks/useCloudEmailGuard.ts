import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@chatic/bridges';
import { useClouds } from '@chatic/web-core';

import { EmailVerifyRefusal, findCloudByEmail } from '../lib';
import { useVerifyEmailCode, type EmailVerifyRequest } from './useVerifyEmailCode';

/**
 * `useVerifyEmailCode` with the one-email-per-cloud rule in front of it.
 *
 * The refusal happens on `send`/`resend`, before a code goes out — waiting for the server would
 * mean delivering a code and only then failing, and the backend does not even error: it silently
 * overwrites the first cloud's `verify$.cloudId` pointer and breaks that cloud's release cascade.
 */
export const useCloudEmailGuard = (): ((request: EmailVerifyRequest) => Promise<void>) => {
    const { t } = useTranslation();
    const verifyEmailCode = useVerifyEmailCode();
    const { data: cloudsData } = useClouds({ limit: -1 });
    const clouds = cloudsData?.list ?? [];

    return useCallback(
        async (request: EmailVerifyRequest) => {
            if (request.step !== 'check' && findCloudByEmail(clouds, request.email)) {
                // Tagged so the dialog shows this wording rather than treating it as a failed request.
                logger.warn('CLOUD', 'email already bound to another cloud', { step: request.step });
                throw new EmailVerifyRefusal(t('addAccount.emailAlreadyUsed'));
            }
            await verifyEmailCode(request);
        },
        [clouds, t, verifyEmailCode]
    );
};
