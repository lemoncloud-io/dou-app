import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

import { useVerifyAlias } from '@chatic/web-core';
import { useNavigateWithTransition } from '@chatic/shared';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { SetPasswordPage } from '../components';
import { ROUTES } from '../../../routes/paths';

export const SignupPasswordPage = () => {
    const navigate = useNavigateWithTransition();
    const { toast } = useToast();
    const { t } = useTranslation();
    const { state } = useLocation();
    const { email = '', userId = '' } = (state as { email?: string; userId?: string }) ?? {};
    const verifyAlias = useVerifyAlias();

    useEffect(() => {
        if (!email) navigate(ROUTES.account.signup.root, { replace: true });
    }, [email, navigate]);

    const handleSubmit = async (password: string) => {
        try {
            await verifyAlias.mutateAsync({
                type: 'email',
                mode: 'signup',
                step: 'confirm',
                alias: email,
                userId,
                password,
            });
            toast({ title: t('signup.signupSuccess') });
            setTimeout(() => navigate(ROUTES.auth.login, { replace: true }), 1500);
        } catch {
            toast({ title: t('signup.signupFailed'), variant: 'destructive' });
        }
    };

    return <SetPasswordPage translationPrefix="signup" onSubmit={handleSubmit} />;
};
