import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

import { useVerifyAlias } from '@chatic/auth';
import { useNavigateWithTransition } from '@chatic/shared';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { VerifyCodePage } from '../components';

export const ResetPasswordVerifyPage = () => {
    const navigate = useNavigateWithTransition();
    const { toast } = useToast();
    const { t } = useTranslation();
    const { state } = useLocation();
    const email = (state as { email?: string })?.email ?? '';
    const verifyAlias = useVerifyAlias();

    useEffect(() => {
        if (!email) navigate('/account/reset-password', { replace: true });
    }, [email, navigate]);

    const handleVerify = async (code: string) => {
        try {
            await verifyAlias.mutateAsync({ type: 'email', mode: 'find', step: 'check', alias: email, code });
            navigate('/account/reset-password/new-password', { replace: true, state: { email } });
            return true;
        } catch {
            toast({ title: t('resetPassword.verifyFailed'), variant: 'destructive' });
            return false;
        }
    };

    const handleResend = async () => {
        try {
            await verifyAlias.mutateAsync({ type: 'email', mode: 'find', step: 'resend', alias: email });
        } catch {
            toast({ title: t('resetPassword.resendFailed'), variant: 'destructive' });
        }
    };

    return <VerifyCodePage translationPrefix="resetPassword" onVerify={handleVerify} onResend={handleResend} />;
};
