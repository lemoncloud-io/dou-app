import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { Globe, LogOut, Moon, Settings, Sun } from 'lucide-react';
import { toast } from 'sonner';

import { useInitWebSocket, useWebSocketStore } from '@chatic/socket';
import { useTheme } from '@chatic/theme';
import { Button } from '@chatic/ui-kit/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@chatic/ui-kit/components/ui/dropdown-menu';
import { useLogout, useWebCoreStore } from '@chatic/web-core';

import { useSessionId } from '../hooks';

export const HomePage = (): JSX.Element => {
    const navigate = useNavigate();
    const { t, i18n } = useTranslation();
    const { theme, setTheme } = useTheme();
    const userName = useWebCoreStore(state => state.userName);
    const sessionId = useSessionId();
    const { isConnected, connectionStatus } = useWebSocketStore();

    useInitWebSocket(sessionId);

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
            <div className="max-w-4xl mx-auto">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-bold">
                            {t('home.welcome', 'Welcome')}, {userName || 'User'}
                        </h1>
                        <p className="text-muted-foreground mt-1">dou chat 채널용(웹)</p>
                        <div className="flex items-center gap-3 mt-2">
                            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50">
                                <div
                                    className={`h-2 w-2 rounded-full ${
                                        isConnected
                                            ? 'bg-green-500 animate-pulse'
                                            : connectionStatus === 'connecting'
                                              ? 'bg-yellow-500 animate-pulse'
                                              : 'bg-red-500'
                                    }`}
                                />
                                <span className="text-xs font-medium">
                                    {connectionStatus === 'connected'
                                        ? 'Connected'
                                        : connectionStatus === 'connecting'
                                          ? 'Connecting...'
                                          : connectionStatus === 'error'
                                            ? 'Error'
                                            : 'Disconnected'}
                                </span>
                            </div>
                            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50">
                                <span className="text-xs text-muted-foreground">ID:</span>
                                <span className="text-xs font-mono">{sessionId?.slice(0, 8)}...</span>
                            </div>
                        </div>
                    </div>

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="icon">
                                <Settings className="h-5 w-5" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuLabel>{t('home.settings', 'Settings')}</DropdownMenuLabel>
                            <DropdownMenuSeparator />

                            <DropdownMenuItem onSelect={e => e.preventDefault()} onClick={handleThemeToggle}>
                                {theme === 'light' ? (
                                    <Sun className="mr-2 h-4 w-4" />
                                ) : (
                                    <Moon className="mr-2 h-4 w-4" />
                                )}
                                <span>{theme === 'light' ? 'Light Mode' : 'Dark Mode'}</span>
                            </DropdownMenuItem>

                            <DropdownMenuItem onSelect={e => e.preventDefault()} onClick={handleLanguageToggle}>
                                <Globe className="mr-2 h-4 w-4" />
                                <span>{i18n.language === 'en' ? 'English' : '한국어'}</span>
                            </DropdownMenuItem>

                            <DropdownMenuSeparator />

                            <DropdownMenuItem onClick={handleLogout} disabled={isLoggingOut}>
                                <LogOut className="mr-2 h-4 w-4" />
                                <span>
                                    {isLoggingOut ? t('home.loggingOut', 'Logging out...') : t('home.logout', 'Logout')}
                                </span>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>
        </div>
    );
};
