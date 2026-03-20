import { useTranslation } from 'react-i18next';

import { useNavigateWithTransition } from '@chatic/shared';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { SetPasswordPage } from '../components';

export const SignupPasswordPage = () => {
    const navigate = useNavigateWithTransition();
    const { toast } = useToast();
    const { t } = useTranslation();

    const handleSubmit = async (_password: string) => {
        // TODO: Call signup API
        await new Promise(resolve => setTimeout(resolve, 1000));
        toast({ title: t('signup.signupSuccess') });
        navigate(-1);
    };

    return <SetPasswordPage translationPrefix="signup" onSubmit={handleSubmit} />;
};
