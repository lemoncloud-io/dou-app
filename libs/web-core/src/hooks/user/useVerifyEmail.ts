import { useCustomMutation } from '@chatic/shared';
import type { CloudVerifyEmailBody, CloudVerifyEmailView } from '@lemoncloud/chatic-backend-api';
import { verifyEmail } from '../../api';

const IS_DEV = import.meta.env.VITE_ENV === 'DEV' || import.meta.env.VITE_ENV === 'LOCAL';
export const useVerifyEmail = () =>
    useCustomMutation<CloudVerifyEmailView, string, CloudVerifyEmailBody>(body =>
        verifyEmail(body, { ...(IS_DEV && body.step === 'confirm' && { dryRun: true }) })
    );
