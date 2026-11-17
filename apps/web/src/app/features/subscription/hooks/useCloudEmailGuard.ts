import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@chatic/bridges';
import { useClouds } from '../../../hooks/useCloudCatalog';

import { EmailVerifyRefusal, findCloudByEmail, isEmailAlreadyRegistered } from '../lib';
import { useVerifyEmailCode, type EmailVerifyRequest } from './useVerifyEmailCode';

/**
 * `useVerifyEmailCode` with the one-email-per-cloud rule in front of it.
 *
 * The refusal happens on `send`/`resend`, before a code goes out — waiting for the server would
 * mean delivering a code and only then failing, and the backend does not even error: it silently
 * overwrites the first cloud's `verify$.cloudId` pointer and breaks that cloud's release cascade.
 *
 * An address another user already registered is the server's call, not this one's — the client
 * cannot see other users' clouds — and the relay does refuse it. That refusal is turned into its
 * own message here, so the dialog says the address is taken instead of "failed to send".
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
