import { useTranslation } from 'react-i18next';

import { useFindAlias, useVerifyAlias } from '@chatic/app-runtime';
import { useNavigateWithTransition } from '@chatic/shared';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { EmailInputPage } from '../components';
import { ROUTES } from '../../../routes/paths';

export const ResetPasswordEmailPage = () => {
    const navigate = useNavigateWithTransition();
    const { toast } = useToast();
    const { t } = useTranslation();
    const findAlias = useFindAlias();
    const verifyAlias = useVerifyAlias();

    const handleSubmit = async (email: string) => {
        try {
            const result = await findAlias.mutateAsync({ type: 'email', alias: email });
            if (!result.hasUser) {
                toast({ title: t('resetPassword.accountNotFound'), variant: 'destructive' });
                return false;
            }
            await verifyAlias.mutateAsync({ type: 'email', mode: 'find', step: 'send', alias: email });
            navigate(ROUTES.account.resetPassword.verify, { replace: true, state: { email } });
            return true;
        } catch {
            toast({ title: t('resetPassword.sendCodeFailed'), variant: 'destructive' });
            return false;
        }
    };

    return <EmailInputPage translationPrefix="resetPassword" buttonLabelKey="sendCode" onSubmit={handleSubmit} />;
};
