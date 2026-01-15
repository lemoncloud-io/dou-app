import { useEffect, useRef, useState } from 'react';
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
    const { isConnected, connectionStatus, id } = useWebSocketStore();
    const tabState = useTabLifecycle();
    const [connectionData, setConnectionData] = useState<Record<string, unknown> | null>(null);

    const { connect, disconnect } = useInitWebSocket(sessionId);
    const unsubscribeRef = useRef<(() => void) | null>(null);

    // Subscribe to WebSocket messages to capture connection data
    useEffect(() => {
        if (!isConnected) return;

        console.log('[HomePage] Setting up subscription');
        unsubscribeRef.current = useWebSocketStore.getState().subscribe(message => {
            if (message.data && typeof message.data === 'object') {
                const data = message.data as Record<string, unknown>;
                // Check if it's an info action with payload
                if (data.action === 'info' && data.payload && typeof data.payload === 'object') {
                    const payload = data.payload as Record<string, unknown>;
                    if (payload.connectionId && payload.deviceId && payload.remote) {
                        setConnectionData(payload);
                    }
                }
            }
        });

        return () => {
            console.log('[HomePage] Cleaning up subscription');
            unsubscribeRef.current?.();
        };
    }, [isConnected]);

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
                        <p className="text-muted-foreground mt-1">두유 채널용(웹)</p>
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

                {/* Connection Data Panel */}
                {connectionData && (
                    <div className="mt-4 p-4 rounded-lg border bg-card">
                        <h2 className="text-sm font-medium text-muted-foreground mb-3">Connection Info</h2>
                        <div className="grid grid-cols-2 gap-3 text-xs">
                            <div>
                                <span className="text-muted-foreground">Connection ID:</span>
                                <p className="font-mono mt-1">{connectionData.connectionId as string}</p>
                            </div>
                            <div>
                                <span className="text-muted-foreground">Device ID:</span>
                                <p className="font-mono mt-1">{(connectionData.deviceId as string)?.slice(0, 13)}...</p>
                            </div>
                            <div>
                                <span className="text-muted-foreground">Remote IP:</span>
                                <p className="font-mono mt-1">{connectionData.remote as string}</p>
                            </div>
                            <div>
                                <span className="text-muted-foreground">Domain:</span>
                                <p className="font-mono mt-1">{connectionData.domain as string}</p>
                            </div>
                            <div>
                                <span className="text-muted-foreground">Stage:</span>
                                <p className="font-mono mt-1">{connectionData.stage as string}</p>
                            </div>
                            <div>
                                <span className="text-muted-foreground">Connected At:</span>
                                <p className="font-mono mt-1">
                                    {new Date(connectionData.connectedAt as number).toLocaleTimeString('ko-KR')}
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* App Lifecycle Panel */}
                <div className="mt-8 p-4 rounded-lg border bg-card">
                    <h2 className="text-sm font-medium text-muted-foreground mb-3">App Lifecycle</h2>
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2">
                            <div
                                className={`h-2 w-2 rounded-full ${tabState.isVisible ? 'bg-green-500' : 'bg-gray-400'}`}
                            />
                            <span className="text-sm font-medium">
                                {tabState.isVisible ? 'Foreground' : 'Background'}
                            </span>
                            {tabState.lastVisibilityChange && (
                                <span className="text-xs text-muted-foreground font-mono">
                                    {tabState.lastVisibilityChange.toLocaleTimeString('ko-KR', {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        second: '2-digit',
                                    })}
                                </span>
                            )}
                        </div>
                        <div className="h-4 w-px bg-border" />
                        <div className="flex items-center gap-2">
                            <div
                                className={`h-2 w-2 rounded-full ${tabState.isFocused ? 'bg-blue-500' : 'bg-gray-400'}`}
                            />
                            <span className="text-sm font-medium">{tabState.isFocused ? 'Focused' : 'Blurred'}</span>
                            {tabState.lastFocusChange && (
                                <span className="text-xs text-muted-foreground font-mono">
                                    {tabState.lastFocusChange.toLocaleTimeString('ko-KR', {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        second: '2-digit',
                                    })}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
