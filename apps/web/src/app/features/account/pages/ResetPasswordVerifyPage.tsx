import { useTranslation } from 'react-i18next';

import { useNavigateWithTransition } from '@chatic/shared';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { VerifyCodePage } from '../components';
import { MOCK_VALID_CODE } from '../constants';

export const ResetPasswordVerifyPage = () => {
    const navigate = useNavigateWithTransition();
    const { toast } = useToast();
    const { t } = useTranslation();

    const handleVerify = async (code: string) => {
        // TODO: Call verify code API
        await new Promise(resolve => setTimeout(resolve, 1000));
        if (code !== MOCK_VALID_CODE) {
            toast({ title: t('resetPassword.verifyFailed'), variant: 'destructive' });
            return false;
        }
        navigate('/account/reset-password/new-password', { replace: true });
        return true;
    };

    const handleResend = async () => {
        // TODO: Call resend API
        await new Promise(resolve => setTimeout(resolve, 1000));
    };

    return <VerifyCodePage translationPrefix="resetPassword" onVerify={handleVerify} onResend={handleResend} />;
};
