import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

import { useVerifyAlias } from '@chatic/auth';
import { useNavigateWithTransition } from '@chatic/shared';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { VerifyCodePage } from '../components';

export const SignupVerifyPage = () => {
    const navigate = useNavigateWithTransition();
    const { toast } = useToast();
    const { t } = useTranslation();
    const { state } = useLocation();
    const { email = '', userId = '' } = (state as { email?: string; userId?: string }) ?? {};
    const verifyAlias = useVerifyAlias();

    useEffect(() => {
        if (!email) navigate('/account/signup', { replace: true });
    }, [email, navigate]);

    const handleVerify = async (code: string) => {
        try {
            await verifyAlias.mutateAsync({ type: 'email', mode: 'signup', step: 'check', alias: email, userId, code });
            navigate('/account/signup/password', { replace: true, state: { email, userId } });
            return true;
        } catch {
            toast({ title: t('signup.verifyFailed'), variant: 'destructive' });
            return false;
        }
    };

    const handleResend = async () => {
        try {
            await verifyAlias.mutateAsync({ type: 'email', mode: 'signup', step: 'resend', alias: email, userId });
        } catch {
            toast({ title: t('signup.resendFailed'), variant: 'destructive' });
        }
    };

    return <VerifyCodePage translationPrefix="signup" onVerify={handleVerify} onResend={handleResend} />;
};
