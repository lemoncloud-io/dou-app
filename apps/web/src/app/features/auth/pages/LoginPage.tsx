import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';

import { ArrowLeft, Cloud } from 'lucide-react';

import { Images } from '@lemon/assets';
import { useGlobalLoader } from '@lemon/shared';
import { Button } from '@lemon/ui-kit/components/ui/button';
import { Card } from '@lemon/ui-kit/components/ui/card';
import { HOST, SOCIAL_OAUTH_ENDPOINT } from '@lemon/web-core';

import { SettingsControl } from '../../../shared';

export const LoginPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(false);
    const { setIsLoading: setGlobalLoading } = useGlobalLoader();
    const location = useLocation();
    const from = location.state?.from || '/home';

    const onClickLogin = (provider: string) => {
        setIsLoading(true);
        setGlobalLoading(true);
        const state = encodeURIComponent(JSON.stringify({ from }));
        const redirectUrl = `${HOST}/auth/oauth-response?state=${state}`;

        window.location.replace(`${SOCIAL_OAUTH_ENDPOINT}/oauth/${provider}/authorize?redirect=${redirectUrl}`);
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

                    {/* Login Button */}
                    <Button
                        className="w-full h-14 glass-strong border-white/20 dark:border-white/10 hover:border-orange-400/50 hover:bg-white/10 dark:hover:bg-white/5 group transition-all duration-300 relative overflow-hidden text-primary-content"
                        onClick={() => onClickLogin('google')}
                        disabled={isLoading}
                    >
                        {/* Button Glow Effect */}
                        <div className="absolute inset-0 bg-lemon-gradient opacity-0 group-hover:opacity-20 transition-opacity duration-300" />

                        <div className="relative flex items-center justify-center w-full">
                            {isLoading ? (
                                <div className="flex items-center space-x-2">
                                    <div className="w-5 h-5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                                    <span>{t('login.connecting', 'Connecting...')}</span>
                                </div>
                            ) : (
                                <>
                                    <img className="w-6 h-6 mr-3" src={Images.googleLogo} alt="Google Logo" />
                                    <span className="font-medium">
                                        {t('login.googleButton', 'Continue with Google')}
                                    </span>
                                </>
                            )}
                        </div>
                    </Button>

                    {/* Footer */}
                    <div className="mt-8 text-center">
                        <p className="text-sm text-muted-content">
                            {t('login.terms', 'By signing in, you agree to our Terms of Service')}
                        </p>
                    </div>
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
