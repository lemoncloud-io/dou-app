import { useEffect } from 'react';
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

import { useSessionId, useTabLifecycle } from '../hooks';

export const HomePage = (): JSX.Element => {
    const navigate = useNavigate();
    const { t, i18n } = useTranslation();
    const { theme, setTheme } = useTheme();
    const userName = useWebCoreStore(state => state.userName);
    const sessionId = useSessionId();
    const { isConnected, connectionStatus } = useWebSocketStore();
    const tabState = useTabLifecycle();

    const { connect, disconnect } = useInitWebSocket(sessionId);

    // Handle tab visibility changes
    useEffect(() => {
        console.log('[HomePage] Tab visibility changed:', tabState.isVisible);
        console.log('[HomePage] Current connection status:', connectionStatus);

        if (tabState.isVisible) {
            console.log('[HomePage] Tab foreground - reconnecting WebSocket');
            void connect();
        } else {
            console.log('[HomePage] Tab background - disconnecting WebSocket');
            disconnect();
        }
    }, [tabState.isVisible, connect, disconnect]);

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

                {/* Event Trigger Panel */}
                <div className="mt-8">
                    <h2 className="text-xl font-semibold mb-4">Tab Lifecycle Events</h2>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 rounded-lg border">
                            <p className="text-sm font-medium mb-2">Tab State</p>
                            <div className="flex items-center gap-2">
                                <div
                                    className={`h-3 w-3 rounded-full ${tabState.isVisible ? 'bg-green-500' : 'bg-gray-500'}`}
                                />
                                <span className="text-sm">{tabState.isVisible ? 'Foreground' : 'Background'}</span>
                            </div>
                            {tabState.lastVisibilityChange && (
                                <p className="text-xs text-muted-foreground mt-1">
                                    Last: {tabState.lastVisibilityChange.toLocaleTimeString()}
                                </p>
                            )}
                        </div>
                        <div className="p-4 rounded-lg border">
                            <p className="text-sm font-medium mb-2">Focus</p>
                            <div className="flex items-center gap-2">
                                <div
                                    className={`h-3 w-3 rounded-full ${tabState.isFocused ? 'bg-blue-500' : 'bg-gray-500'}`}
                                />
                                <span className="text-sm">{tabState.isFocused ? 'Focused' : 'Blurred'}</span>
                            </div>
                            {tabState.lastFocusChange && (
                                <p className="text-xs text-muted-foreground mt-1">
                                    Last: {tabState.lastFocusChange.toLocaleTimeString()}
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
