import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

import { Shield } from 'lucide-react';

import { Button } from '@chatic/ui-kit/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@chatic/ui-kit/components/ui/card';

import type { JSX } from 'react';

export const LoginPage = (): JSX.Element => {
    const { t } = useTranslation();
    const location = useLocation();
    const from = location.state?.from || '/';

    const onClickSocialLogin = (provider: string) => {
        const HOST = import.meta.env.VITE_HOST.toLowerCase();
        const SOCIAL_OAUTH = import.meta.env.VITE_SOCIAL_OAUTH_ENDPOINT.toLowerCase();
        const state = encodeURIComponent(JSON.stringify({ from }));
        const redirectUrl = `${HOST}/auth/oauth-response?state=${state}`;

        window.location.replace(`${SOCIAL_OAUTH}/oauth/${provider}/authorize?redirect=${redirectUrl}`);
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
            <Card className="w-full max-w-md">
                <CardHeader className="text-center space-y-4">
                    <div className="mx-auto w-16 h-16 bg-primary rounded-2xl flex items-center justify-center">
                        <Shield className="w-8 h-8 text-primary-foreground" />
                    </div>
                    <div>
                        <CardTitle className="text-2xl">{t('login.adminTitle')}</CardTitle>
                        <CardDescription>{t('login.adminSubtitle')}</CardDescription>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Button variant="outline" className="w-full h-12" onClick={() => onClickSocialLogin('google')}>
                        {t('login.google')}
                    </Button>
                    <Button variant="outline" className="w-full h-12" onClick={() => onClickSocialLogin('kakao')}>
                        {t('login.kakao')}
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
};
