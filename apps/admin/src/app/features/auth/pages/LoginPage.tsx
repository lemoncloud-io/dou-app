import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

import { Images } from '@lemon/assets';
import { useGlobalLoader } from '@lemon/shared';
import { Button } from '@lemon/ui-kit/components/ui/button';
import { Card } from '@lemon/ui-kit/components/ui/card';

export const LoginPage = () => {
    const { t } = useTranslation();
    const { setIsLoading } = useGlobalLoader();
    const location = useLocation();
    const from = location.state?.from || '/home';

    const onClickLogin = (provider: string) => {
        setIsLoading(true);
        const HOST = import.meta.env.VITE_HOST.toLowerCase();
        const SOCIAL_OAUTH = import.meta.env.VITE_SOCIAL_OAUTH_ENDPOINT.toLowerCase();
        const state = encodeURIComponent(JSON.stringify({ from }));
        const redirectUrl = `${HOST}/auth/oauth-response?state=${state}`;

        window.location.replace(`${SOCIAL_OAUTH}/oauth/${provider}/authorize?redirect=${redirectUrl}`);
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-background">
            <Card className="w-full max-w-md p-8 space-y-8 glassmorphism">
                <div className="text-center">
                    <h1 className="text-4xl font-bold gradient-text mb-2">Lemon</h1>
                    <h1 className="text-xl text-text font-medium">{t('login.welcome')}</h1>
                </div>

                <div className="space-y-4">
                    <Button
                        className="w-full flex items-center justify-center space-x-2"
                        variant="outline"
                        onClick={() => onClickLogin('google')}
                    >
                        <img src={Images.googleLogo} alt="Google Logo" width={20} height={20} />
                        <span className="text-text font-medium">{t('login.googleButton')}</span>
                    </Button>

                    <Button
                        className="w-full flex items-center justify-center space-x-2 bg-[#FEE500] text-[#000000] hover:bg-[#FEE500]/90"
                        onClick={() => onClickLogin('kakao')}
                    >
                        <img src={Images.kakaoLogo} alt="Kakao Logo" width={20} height={20} />
                        <span className="text-text font-medium">{t('login.kakaoButton')}</span>
                    </Button>
                </div>
            </Card>
        </div>
    );
};
