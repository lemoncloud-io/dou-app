import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

import { useVerifyAlias } from '@chatic/auth';
import { useNavigateWithTransition } from '@chatic/shared';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { SetPasswordPage } from '../components';

export const ResetPasswordNewPage = () => {
    const navigate = useNavigateWithTransition();
    const { toast } = useToast();
    const { t } = useTranslation();
    const { state } = useLocation();
    const { email = '', code = '' } = (state as { email?: string; code?: string }) ?? {};
    const verifyAlias = useVerifyAlias();

    useEffect(() => {
        if (!email) navigate('/account/reset-password', { replace: true });
    }, [email, navigate]);

    const handleSubmit = async (password: string) => {
        try {
            await verifyAlias.mutateAsync({
                type: 'email',
                mode: 'find',
                step: 'change',
                alias: email,
                code,
                password,
            });
            toast({ title: t('resetPassword.success') });
            navigate('/auth/login', { replace: true });
        } catch {
            toast({ title: t('resetPassword.changeFailed'), variant: 'destructive' });
        }
    };

    return <SetPasswordPage translationPrefix="resetPassword" onSubmit={handleSubmit} />;
};
