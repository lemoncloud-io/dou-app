import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';

import { calcTestSignature } from '@lemoncloud/lemon-web-core';
import { ArrowLeft, Shield } from 'lucide-react';
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
    const from = location.state?.from || '/dashboard';
    const [snsTestUid, setSnsTestUid] = useState('admin');

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
                    identityToken: '*chatic-admin-test-token*',
                },
                date.toISOString()
            ),
        };
        setIsLoading(true);
        try {
            await snsTestLogin(body);
            setIsAuthenticated(true);
            navigate('/dashboard', { replace: true });
            toast('Admin Dashboard로 이동합니다.');
        } catch (error) {
            console.error('SNS Test Login failed:', error);
            toast(t('oauth.error.general'));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
            {/* Background Effects */}
            <div className="absolute inset-0 bg-gradient-to-tr from-blue-500/10 via-transparent to-purple-500/10" />
            <div className="absolute top-32 left-16 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl animate-pulse" />
            <div
                className="absolute bottom-32 right-16 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl animate-pulse"
                style={{ animationDelay: '2s' }}
            />

            {/* Header */}
            <div className="absolute top-8 left-0 right-0 z-50 flex justify-between items-center px-8 pointer-events-none">
                <Button
                    variant="ghost"
                    className="text-slate-400 hover:text-white hover:bg-white/10 pointer-events-auto"
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
                <Card className="w-full max-w-md p-8 border-slate-700 bg-slate-800/80 backdrop-blur-xl">
                    {/* Logo Section */}
                    <div className="text-center mb-8">
                        <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl mb-4">
                            <Shield className="w-12 h-12 text-white" />
                        </div>
                        <h1 className="text-3xl font-bold text-white mb-2">Admin Portal</h1>
                        <p className="text-slate-400">{t('login.subtitle', 'Sign in to access the admin dashboard')}</p>
                    </div>

                    {/* Test Login Section */}
                    <div className="mt-6 space-y-4">
                        <div className="text-center">
                            <div className="w-full h-px bg-slate-600 mb-4" />
                            <p className="text-sm text-slate-400">Admin Test Login</p>
                        </div>

                        <Input
                            type="text"
                            placeholder="Enter admin user ID"
                            value={snsTestUid}
                            onChange={e => setSnsTestUid(e.target.value)}
                            className="w-full border-slate-600 bg-slate-700/50 text-white placeholder-slate-400"
                        />

                        <Button
                            variant="outline"
                            className="w-full h-14 border-slate-600 hover:border-blue-500 hover:bg-blue-500/10 text-white transition-all duration-300"
                            onClick={onClickSnsTestLogin}
                            disabled={isLoading || !snsTestUid}
                        >
                            {isLoading ? (
                                <div className="flex items-center space-x-2">
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    <span>{t('login.connecting', 'Connecting...')}</span>
                                </div>
                            ) : (
                                <>Sign In</>
                            )}
                        </Button>
                    </div>

                    {/* Footer */}
                    <div className="mt-8 text-center">
                        <p className="text-sm text-slate-500">
                            {t('login.terms', 'By signing in, you agree to our Terms of Service')}
                        </p>
                    </div>

                    <Button
                        variant="ghost"
                        className="w-full mt-3 text-slate-400 hover:text-white"
                        onClick={handleLogout}
                        disabled={isLoading}
                    >
                        Logout
                    </Button>
                </Card>
            </div>
        </div>
    );
};
