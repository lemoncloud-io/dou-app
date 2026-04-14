import { useTranslation } from 'react-i18next';

import { useVerifyAlias } from '@chatic/auth';
import { useNavigateWithTransition } from '@chatic/shared';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { useWebCoreStore } from '@chatic/web-core';

import { EmailInputPage } from '../components';

export const SignupEmailPage = () => {
    const navigate = useNavigateWithTransition();
    const { toast } = useToast();
    const { t } = useTranslation();
    const { profile } = useWebCoreStore();
    const userId = profile?.uid ?? '';
    const verifyAlias = useVerifyAlias();

    const handleSubmit = async (email: string) => {
        try {
            await verifyAlias.mutateAsync({ type: 'email', mode: 'signup', step: 'send', alias: email, userId });
            navigate('/account/signup/verify', { replace: true, state: { email, userId } });
            return true;
        } catch {
            toast({ title: t('signup.sendCodeFailed'), variant: 'destructive' });
            return false;
        }
    };

    return <EmailInputPage translationPrefix="signup" onSubmit={handleSubmit} />;
};
