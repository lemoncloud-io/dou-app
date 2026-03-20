import { useNavigateWithTransition } from '@chatic/shared';

import { EmailInputPage } from '../components';

export const SignupEmailPage = () => {
    const navigate = useNavigateWithTransition();

    const handleSubmit = async (_email: string) => {
        // TODO: Call email verification API
        await new Promise(resolve => setTimeout(resolve, 1000));
        navigate('/account/signup/verify', { replace: true });
        return true;
    };

    return <EmailInputPage translationPrefix="signup" onSubmit={handleSubmit} />;
};
