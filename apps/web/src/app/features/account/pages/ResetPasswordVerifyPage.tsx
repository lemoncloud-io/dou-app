import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

import { useVerifyAlias } from '@chatic/web-core';
import { useNavigateWithTransition } from '@chatic/shared';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { VerifyCodePage } from '../components';
import { ROUTES } from '../../../routes/paths';

export const ResetPasswordVerifyPage = () => {
    const navigate = useNavigateWithTransition();
    const { toast } = useToast();
    const { t } = useTranslation();
    const { state } = useLocation();
    const email = (state as { email?: string })?.email ?? '';
    const verifyAlias = useVerifyAlias();

    useEffect(() => {
        if (!email) navigate(ROUTES.account.resetPassword.root, { replace: true });
    }, [email, navigate]);

    const handleVerify = async (code: string) => {
        try {
            await verifyAlias.mutateAsync({ type: 'email', mode: 'find', step: 'check', alias: email, code });
            navigate(ROUTES.account.resetPassword.newPassword, { replace: true, state: { email, code } });
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
