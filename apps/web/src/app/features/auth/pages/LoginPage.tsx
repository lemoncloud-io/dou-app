import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';

import { calcTestSignature } from '@lemoncloud/lemon-web-core';
import { ArrowLeft, Cloud } from 'lucide-react';
import { toast } from 'sonner';

import { useGlobalLoader } from '@chatic/shared';
import { Button } from '@chatic/ui-kit/components/ui/button';
import { Card } from '@chatic/ui-kit/components/ui/card';
import { Input } from '@chatic/ui-kit/components/ui/input';
import { HOST, SOCIAL_OAUTH_ENDPOINT, snsTestLogin, useWebCoreStore } from '@chatic/web-core';

import { SettingsControl } from '../../../shared';

export const LoginPage = () => {
    const { t } = useTranslation();

    const setIsAuthenticated = useWebCoreStore(state => state.setIsAuthenticated);
    const logout = useWebCoreStore(state => state.logout);

    const location = useLocation();
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(false);
    const { setIsLoading: setGlobalLoading } = useGlobalLoader();
    const from = location.state?.from || '/home';
    const [snsTestUid, setSnsTestUid] = useState('test');

    const handleLogout = async () => {
        toast(t('oauth.logout'));
        await logout();
        navigate('/', { replace: true });
    };

    const _onClickLogin = (provider: string) => {
        setIsLoading(true);
        setGlobalLoading(true);
        const state = encodeURIComponent(JSON.stringify({ from }));
        const redirectUrl = `${HOST}/auth/oauth-response?state=${state}`;

        window.location.replace(`${SOCIAL_OAUTH_ENDPOINT}/oauth/${provider}/authorize?redirect=${redirectUrl}`);
    };

    const onClickSnsTestLogin = async () => {
        const date = new Date();

        const body = {
            provider: 'test',
            idToken: snsTestUid,
            refreshToken: date.toISOString(),
            signature: calcTestSignature(
                {
                    authId: snsTestUid,
                    accountId: snsTestUid,
                    identityId: snsTestUid,
                    identityToken: '*jjukkumi-test-token-250211*',
                },
                date.toISOString()
            ),
        };
        setIsLoading(true);
        try {
            await snsTestLogin(body);
            setIsAuthenticated(true);
            navigate('/pouch-result/60000202', { replace: true });
            toast('테스트 결과 페이지로 이동합니다. id: 60000202');
        } catch (error) {
            console.error('SNS Test Login failed:', error);
            toast(t('oauth.error.general'));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen relative overflow-hidden bg-lemon-cosmic animate-gradient">
            {/* Background Effects */}
            <div className="absolute inset-0 bg-lemon-aurora animate-gradient opacity-30" />
            <div className="absolute top-32 left-16 w-64 h-64 bg-orange-500/8 dark:bg-orange-400/5 rounded-full blur-3xl animate-float" />
            <div
                className="absolute bottom-32 right-16 w-48 h-48 bg-yellow-500/8 dark:bg-yellow-400/5 rounded-full blur-3xl animate-float"
                style={{ animationDelay: '3s' }}
            />

            {/* Header */}
            <div className="absolute top-8 left-0 right-0 z-50 flex justify-between items-center px-8 pointer-events-none">
                <Button
                    variant="ghost"
                    className="text-secondary-content hover:text-primary-content hover:bg-white/10 dark:hover:bg-white/5 pointer-events-auto"
                    onClick={() => navigate(-1)}
                >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    {t('common.back', 'Back')}
                </Button>
                <div className="pointer-events-auto">
                    <SettingsControl />
                </div>
            </div>

            {/* Main Content */}
            <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-6">
                <Card className="glass-strong w-full max-w-md p-8 border-0 animate-slide-up">
                    {/* Logo Section */}
                    <div className="text-center mb-8">
                        <div className="inline-flex items-center justify-center w-20 h-20 bg-lemon-gradient rounded-2xl mb-4">
                            <Cloud className="w-12 h-12 text-white" />
                        </div>
                        <h1 className="text-3xl font-bold text-primary-content mb-2">
                            {t('login.welcomeBack', 'Welcome Back')}
                        </h1>
                        <p className="text-secondary-content">
                            {t('login.subtitle', 'Sign in to continue to LemonCloud')}
                        </p>
                    </div>

                    {/* Test Login Section */}
                    <div className="mt-6 space-y-4">
                        <div className="text-center">
                            <div className="w-full h-px bg-white/20 dark:bg-white/10 mb-4" />
                            <p className="text-sm text-secondary-content">Test Login</p>
                        </div>

                        <Input
                            type="text"
                            placeholder="Enter any number for test login"
                            value={snsTestUid}
                            onChange={e => setSnsTestUid(e.target.value)}
                            className="w-full glass-strong border-white/20 dark:border-white/10 bg-transparent text-primary-content placeholder-secondary-content"
                        />

                        <Button
                            variant="outline"
                            className="w-full h-14 glass-strong border-white/20 dark:border-white/10 hover:border-orange-400/50 hover:bg-white/10 dark:hover:bg-white/5 group transition-all duration-300 relative overflow-hidden text-primary-content"
                            onClick={onClickSnsTestLogin}
                            disabled={isLoading || !snsTestUid}
                        >
                            {isLoading ? (
                                <div className="flex items-center space-x-2">
                                    <div className="w-5 h-5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                                    <span>{t('login.connecting', 'Connecting...')}</span>
                                </div>
                            ) : (
                                <>Login</>
                            )}
                        </Button>
                    </div>

                    {/* Footer */}
                    <div className="mt-8 text-center">
                        <p className="text-sm text-muted-content">
                            {t('login.terms', 'By signing in, you agree to our Terms of Service')}
                        </p>
                    </div>

                    <Button className="w-full mt-3 text-primary-content" onClick={handleLogout} disabled={isLoading}>
                        <div className="relative flex items-center justify-center w-full">Logout</div>
                    </Button>
                </Card>

                {/* Decorative Elements */}
                <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 flex space-x-2">
                    <div className="w-2 h-2 bg-secondary-content/30 rounded-full animate-pulse" />
                    <div
                        className="w-2 h-2 bg-secondary-content/50 rounded-full animate-pulse"
                        style={{ animationDelay: '0.5s' }}
                    />
                    <div
                        className="w-2 h-2 bg-secondary-content/30 rounded-full animate-pulse"
                        style={{ animationDelay: '1s' }}
                    />
                </div>
            </div>
        </div>
    );
};
