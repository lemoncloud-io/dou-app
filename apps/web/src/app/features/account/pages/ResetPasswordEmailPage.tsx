import { useTranslation } from 'react-i18next';

import { useNavigateWithTransition } from '@chatic/shared';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { EmailInputPage } from '../components';
import { MOCK_VALID_EMAILS } from '../constants';

export const ResetPasswordEmailPage = () => {
    const navigate = useNavigateWithTransition();
    const { toast } = useToast();
    const { t } = useTranslation();

    const handleSubmit = async (email: string) => {
        // TODO: Call send reset password verification code API
        await new Promise(resolve => setTimeout(resolve, 1000));
        if (!MOCK_VALID_EMAILS.includes(email)) {
            toast({ title: t('resetPassword.accountNotFound'), variant: 'destructive' });
            return false;
        }
        navigate('/account/reset-password/verify', { replace: true });
        return true;
    };

    return <EmailInputPage translationPrefix="resetPassword" buttonLabelKey="sendCode" onSubmit={handleSubmit} />;
};
