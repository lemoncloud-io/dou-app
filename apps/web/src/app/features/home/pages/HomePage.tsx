import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { Globe, LogOut, MessageCircle, Moon, Sun } from 'lucide-react';
import { toast } from 'sonner';

import { useTheme } from '@chatic/theme';
import { Button } from '@chatic/ui-kit/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@chatic/ui-kit/components/ui/card';
import { useLogout, useWebCoreStore } from '@chatic/web-core';

export const HomePage = (): JSX.Element => {
    const navigate = useNavigate();
    const { t, i18n } = useTranslation();
    const { theme, setTheme } = useTheme();
    const userName = useWebCoreStore(state => state.userName);

    const { mutate: logout, isPending: isLoggingOut } = useLogout(
        () => {
            toast.success(t('home.logoutSuccess', 'Logged out successfully'));
            navigate('/auth/login', { replace: true });
        },
        error => {
            console.error('Logout failed:', error);
            toast.error(t('home.logoutFailed', 'Logout failed'));
        }
    );

    const handleThemeToggle = () => {
        setTheme(theme === 'light' ? 'dark' : 'light');
    };

    const handleLanguageToggle = () => {
        const newLang = i18n.language === 'en' ? 'ko' : 'en';
        i18n.changeLanguage(newLang);
    };

    const handleLogout = () => {
        logout();
    };

    return (
        <div className="min-h-screen bg-background p-6">
            <div className="max-w-2xl mx-auto space-y-6">
                {/* Welcome Card */}
                <Card>
                    <CardHeader className="text-center">
                        <div className="mx-auto w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center mb-4">
                            <MessageCircle className="w-8 h-8 text-white" />
                        </div>
                        <CardTitle className="text-2xl">
                            {t('home.welcome', 'Welcome')}, {userName || 'User'}
                        </CardTitle>
                        <CardDescription>{t('home.subtitle', 'Manage your settings below')}</CardDescription>
                    </CardHeader>
                </Card>

                {/* Settings Card */}
                <Card>
                    <CardHeader>
                        <CardTitle>{t('home.settings', 'Settings')}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* Theme Toggle */}
                        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                            <div className="flex items-center gap-3">
                                {theme === 'light' ? (
                                    <Sun className="w-5 h-5 text-amber-500" />
                                ) : (
                                    <Moon className="w-5 h-5 text-blue-400" />
                                )}
                                <div>
                                    <p className="font-medium">{t('home.theme', 'Theme')}</p>
                                    <p className="text-sm text-muted-foreground">
                                        {theme === 'light'
                                            ? t('home.lightMode', 'Light Mode')
                                            : t('home.darkMode', 'Dark Mode')}
                                    </p>
                                </div>
                            </div>
                            <Button variant="outline" size="sm" onClick={handleThemeToggle}>
                                {theme === 'light' ? t('home.toDark', 'Dark') : t('home.toLight', 'Light')}
                            </Button>
                        </div>

                        {/* Language Toggle */}
                        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                            <div className="flex items-center gap-3">
                                <Globe className="w-5 h-5 text-green-500" />
                                <div>
                                    <p className="font-medium">{t('home.language', 'Language')}</p>
                                    <p className="text-sm text-muted-foreground">
                                        {i18n.language === 'en' ? 'English' : '한국어'}
                                    </p>
                                </div>
                            </div>
                            <Button variant="outline" size="sm" onClick={handleLanguageToggle}>
                                {i18n.language === 'en' ? '한국어' : 'English'}
                            </Button>
                        </div>

                        {/* Logout */}
                        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                            <div className="flex items-center gap-3">
                                <LogOut className="w-5 h-5 text-red-500" />
                                <div>
                                    <p className="font-medium">{t('home.logout', 'Logout')}</p>
                                    <p className="text-sm text-muted-foreground">
                                        {t('home.logoutDesc', 'Sign out of your account')}
                                    </p>
                                </div>
                            </div>
                            <Button variant="destructive" size="sm" onClick={handleLogout} disabled={isLoggingOut}>
                                {isLoggingOut ? t('home.loggingOut', 'Logging out...') : t('home.logout', 'Logout')}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};
