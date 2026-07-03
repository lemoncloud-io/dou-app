import { useTranslation } from 'react-i18next';

import { useVerifyAlias } from '@chatic/web-core';
import { useNavigateWithTransition } from '@chatic/shared';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { useSessionIdentity } from '@chatic/web-core';

import { EmailInputPage } from '../components';
import { ROUTES } from '../../../routes/paths';

export const SignupEmailPage = () => {
    const navigate = useNavigateWithTransition();
    const { toast } = useToast();
    const { t } = useTranslation();
    const userId = useSessionIdentity().userId ?? '';
    const verifyAlias = useVerifyAlias();

    const handleSubmit = async (email: string) => {
        try {
            await verifyAlias.mutateAsync({ type: 'email', mode: 'signup', step: 'send', alias: email, userId });
            navigate(ROUTES.account.signup.verify, { replace: true, state: { email, userId } });
            return true;
        } catch {
            toast({ title: t('signup.sendCodeFailed'), variant: 'destructive' });
            return false;
        }
    };

    return <EmailInputPage translationPrefix="signup" onSubmit={handleSubmit} />;
};
