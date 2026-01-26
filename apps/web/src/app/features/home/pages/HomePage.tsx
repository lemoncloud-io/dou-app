import { type JSX, type MouseEvent, useCallback, useEffect, useRef, useState } from 'react';
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
    const { isConnected, connectionStatus, id } = useWebSocketStore();
    const [presenceData, setPresenceData] = useState<Record<string, unknown> | null>(null);
    const [localStatus, setLocalStatus] = useState<'green' | 'yellow' | 'red'>('green');

    const { connect, disconnect, send: originalSend, pingCount, pongCount } = useInitWebSocket(sessionId);
    const unsubscribeRef = useRef<(() => void) | null>(null);
    const [messageFields, setMessageFields] = useState<Array<{ key: string; value: string }>>([
        { key: 'type', value: 'test' },
    ]);

    const [localPointerPosition, setLocalPointerPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const lastSentPointerRef = useRef<number>(0);
    const pointerCanvasRef = useRef<HTMLDivElement>(null);
    const retryCountRef = useRef<number>(0);
    const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const previousStatusRef = useRef<'green' | 'yellow' | 'red'>('green');

    // Tick management
    const getTickKey = () => `presence_tick_${sessionId}`;
    const getTick = (): number => {
        const stored = sessionStorage.getItem(getTickKey());
        return stored ? parseInt(stored, 10) : 0;
    };

    const setTick = (tick: number): void => {
        sessionStorage.setItem(getTickKey(), tick.toString());
    };

    const send = originalSend;

    // Send presence info when connected (only once)
    const hasRequestedInfoRef = useRef(false);
    useEffect(() => {
        if (isConnected && !hasRequestedInfoRef.current) {
            send({ type: 'presence', action: 'info' });
            hasRequestedInfoRef.current = true;
        }

        if (!isConnected) {
            hasRequestedInfoRef.current = false;
        }
    }, [isConnected, send]);

    // Subscribe to WebSocket messages
    useEffect(() => {
        if (!isConnected) return;

        unsubscribeRef.current = useWebSocketStore.getState().subscribe(message => {
            if (message.data && typeof message.data === 'object') {
                const data = message.data as Record<string, unknown>;

                if (data.type === 'presence' && data.payload) {
                    setPresenceData(data.payload as Record<string, unknown>);
                }

                if (data.type === 'sync' && data.payload) {
                    const payload = data.payload as Record<string, unknown>;
                    const serverTick = payload.tick as number;
                    const myTick = getTick();
                    if (serverTick > myTick) {
                        // 서버 tick이 크면 서버 상태 적용
                        retryCountRef.current = 0; // 성공하면 리셋
                        if (retryTimeoutRef.current) {
                            clearTimeout(retryTimeoutRef.current);
                            retryTimeoutRef.current = null;
                        }
                        setTick(serverTick);
                        if (payload.status) {
                            setLocalStatus(payload.status as 'green' | 'yellow' | 'red');
                        }
                        if (payload.posX !== undefined && payload.posY !== undefined) {
                            setLocalPointerPosition({
                                x: payload.posX as number,
                                y: payload.posY as number,
                            });
                        }
                    } else if (serverTick < myTick) {
                        // 서버 tick이 작을 때만 지수 백오프로 재전송
                        if (retryTimeoutRef.current) return; // 이미 대기 중이면 스킵

                        const delay = Math.min(1000 * Math.pow(2, retryCountRef.current), 30000); // max 30s
                        retryCountRef.current += 1;

                        retryTimeoutRef.current = setTimeout(() => {
                            retryTimeoutRef.current = null;
                            send({
                                type: 'sync',
                                action: 'update',
                                payload: {
                                    id: sessionId,
                                    status: localStatus,
                                    posX: Math.round(localPointerPosition.x),
                                    posY: Math.round(localPointerPosition.y),
                                    ts: Date.now(),
                                    tick: myTick,
                                },
                            });
                        }, delay);
                    }
                }
            }
        });

        return () => {
            unsubscribeRef.current?.();
        };
    }, [isConnected, send, sessionId, localStatus, localPointerPosition]);

    // Initial connection
    useEffect(() => {
        void connect();
    }, [connect]);

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

    // Pointer sync handler
    const handlePointerMove = useCallback(
        (e: MouseEvent<HTMLDivElement>) => {
            if (!pointerCanvasRef.current || !isConnected) return;

            const rect = pointerCanvasRef.current.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            setLocalPointerPosition({ x, y });

            // Throttle to 50ms (20fps)
            const now = Date.now();
            if (now - lastSentPointerRef.current < 50) return;
            lastSentPointerRef.current = now;

            const currentTick = getTick();
            send({
                type: 'sync',
                action: 'update',
                payload: {
                    id: sessionId,
                    status: localStatus,
                    posX: Math.round(x),
                    posY: Math.round(y),
                    ts: now,
                    tick: currentTick,
                },
            });
        },
        [isConnected, send, localStatus, sessionId]
    );

    const handlePointerLeave = useCallback(() => {
        setLocalPointerPosition({ x: 0, y: 0 });
    }, []);

    // Status change handler
    const handleStatusChange = useCallback(
        (status: 'green' | 'yellow' | 'red') => {
            if (previousStatusRef.current === status) return; // 상태가 같으면 전송 안 함

            previousStatusRef.current = status;
            setLocalStatus(status);
            const nextTick = getTick() + 1;
            setTick(nextTick);

            send({
                type: 'sync',
                action: 'update',
                payload: {
                    id: sessionId,
                    status,
                    posX: Math.round(localPointerPosition.x),
                    posY: Math.round(localPointerPosition.y),
                    ts: Date.now(),
                    tick: nextTick,
                },
            });
        },
        [send, localPointerPosition, sessionId]
    );

    // App visibility change handler
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (!isConnected) return;

            const newStatus = document.hidden ? 'yellow' : 'green';
            handleStatusChange(newStatus);
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [isConnected, handleStatusChange]);

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
                            {connectionStatus === 'connected' ? (
                                <Button
                                    size="sm"
                                    variant="destructive"
                                    className="h-7 px-3 text-xs"
                                    onClick={disconnect}
                                >
                                    연결 끊기
                                </Button>
                            ) : connectionStatus === 'disconnected' || connectionStatus === 'error' ? (
                                <Button
                                    size="sm"
                                    variant="default"
                                    className="h-7 px-3 text-xs"
                                    onClick={() => void connect()}
                                >
                                    재연결
                                </Button>
                            ) : null}
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

                {/* Presence Status Panel */}
                {presenceData && (
                    <div className="mt-4 p-4 rounded-lg border bg-card">
                        <h2 className="text-sm font-medium text-muted-foreground mb-3">Presence Status</h2>
                        <div className="grid grid-cols-2 gap-3 text-xs">
                            <div>
                                <span className="text-muted-foreground">Status:</span>
                                <div className="flex items-center gap-2 mt-1">
                                    <div
                                        className={`h-3 w-3 rounded-full ${
                                            presenceData.status === 'green'
                                                ? 'bg-green-500'
                                                : presenceData.status === 'yellow'
                                                  ? 'bg-yellow-500'
                                                  : 'bg-red-500'
                                        }`}
                                    />
                                    <span className="font-mono">{presenceData.status as string}</span>
                                </div>
                            </div>
                            <div>
                                <span className="text-muted-foreground">Platform:</span>
                                <p className="font-mono mt-1">{presenceData.platform as string}</p>
                            </div>
                            <div>
                                <span className="text-muted-foreground">Tick:</span>
                                <p className="font-mono mt-1">{presenceData.tick as number}</p>
                            </div>
                            <div>
                                <span className="text-muted-foreground">Connected At:</span>
                                <p className="font-mono mt-1">
                                    {new Date(presenceData.connectedAt as number).toLocaleTimeString('ko-KR')}
                                </p>
                            </div>
                            <div>
                                <span className="text-muted-foreground">Connection ID:</span>
                                <p className="font-mono mt-1">{presenceData.connId as string}</p>
                            </div>
                            {presenceData.disconnectedAt !== 0 && (
                                <div>
                                    <span className="text-muted-foreground">Disconnected At:</span>
                                    <p className="font-mono mt-1">
                                        {new Date(presenceData.disconnectedAt as number).toLocaleTimeString('ko-KR')}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Test Panel */}
                <div className="mt-4 p-4 rounded-lg border bg-card">
                    <h2 className="text-sm font-medium text-muted-foreground mb-4">WebSocket Test</h2>
                    <div className="space-y-4 divide-y">
                        {/* Ping/Pong Stats */}
                        <div className="p-3 rounded-md bg-muted/30">
                            <p className="text-sm font-semibold text-foreground mb-3">📊 Ping/Pong Statistics</p>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="flex items-center justify-between p-2 rounded bg-background">
                                    <span className="text-xs text-muted-foreground">Interval</span>
                                    <span className="text-sm font-bold font-mono">30s</span>
                                </div>
                                <div className="flex items-center justify-between p-2 rounded bg-background">
                                    <span className="text-xs text-muted-foreground">Timeout</span>
                                    <span className="text-sm font-bold font-mono">5s</span>
                                </div>
                                <div className="flex items-center justify-between p-2 rounded bg-blue-500/10">
                                    <span className="text-xs text-muted-foreground">📤 Ping Sent</span>
                                    <span className="text-lg font-bold font-mono text-blue-600 dark:text-blue-400">
                                        {pingCount}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between p-2 rounded bg-green-500/10">
                                    <span className="text-xs text-muted-foreground">📥 Pong Received</span>
                                    <span className="text-lg font-bold font-mono text-green-600 dark:text-green-400">
                                        {pongCount}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Manual Ping */}
                        <div className="pt-4">
                            <p className="text-sm font-semibold text-foreground mb-2">🔧 Manual Ping Test</p>
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-9 px-4 text-xs font-medium"
                                onClick={() =>
                                    send({ type: 'system', action: 'ping', data: { timestamp: Date.now() } })
                                }
                                disabled={!isConnected}
                            >
                                📤 Send Ping
                            </Button>
                        </div>

                        {/* Custom Message */}
                        <div className="pt-4">
                            <p className="text-sm font-semibold text-foreground mb-2">📝 Custom Message</p>
                            <div className="space-y-2">
                                {messageFields.map((field, idx) => (
                                    <div key={idx} className="flex gap-2">
                                        <input
                                            type="text"
                                            className="flex-1 h-8 px-2 text-xs rounded-md border bg-background"
                                            placeholder="Key"
                                            value={field.key}
                                            onChange={e => {
                                                const newFields = [...messageFields];
                                                newFields[idx].key = e.target.value;
                                                setMessageFields(newFields);
                                            }}
                                            disabled={!isConnected}
                                        />
                                        <input
                                            type="text"
                                            className="flex-1 h-8 px-2 text-xs rounded-md border bg-background"
                                            placeholder="Value"
                                            value={field.value}
                                            onChange={e => {
                                                const newFields = [...messageFields];
                                                newFields[idx].value = e.target.value;
                                                setMessageFields(newFields);
                                            }}
                                            disabled={!isConnected}
                                        />
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-8 px-2 text-xs"
                                            onClick={() => setMessageFields(messageFields.filter((_, i) => i !== idx))}
                                            disabled={!isConnected || messageFields.length === 1}
                                        >
                                            ✖
                                        </Button>
                                    </div>
                                ))}
                                <div className="flex gap-2">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-8 px-3 text-xs"
                                        onClick={() => setMessageFields([...messageFields, { key: '', value: '' }])}
                                        disabled={!isConnected}
                                    >
                                        + Add Field
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="default"
                                        className="h-9 px-4 text-xs font-medium"
                                        onClick={() => {
                                            const message = messageFields.reduce(
                                                (acc, field) => {
                                                    if (field.key) {
                                                        acc[field.key] = field.value;
                                                    }
                                                    return acc;
                                                },
                                                {} as Record<string, string>
                                            );
                                            send(message);
                                            toast.success('Message sent');
                                        }}
                                        disabled={!isConnected}
                                    >
                                        📤 Send Message
                                    </Button>
                                </div>
                            </div>
                        </div>

                        {/* Presence Status */}
                        <div className="pt-4">
                            <p className="text-sm font-semibold text-foreground mb-2">🎯 Presence Status Test</p>
                            <div className="mb-3 p-3 rounded-md bg-muted/30">
                                <div className="flex items-center gap-3">
                                    <span className="text-xs text-muted-foreground">Current Status:</span>
                                    <div className="flex items-center gap-2">
                                        <div
                                            className={`h-4 w-4 rounded-full ${
                                                localStatus === 'green'
                                                    ? 'bg-green-500'
                                                    : localStatus === 'yellow'
                                                      ? 'bg-yellow-500'
                                                      : 'bg-red-500'
                                            }`}
                                        />
                                        <span className="text-sm font-bold font-mono uppercase">{localStatus}</span>
                                    </div>
                                    <span className="text-xs text-muted-foreground ml-4">Tick:</span>
                                    <span className="text-sm font-bold font-mono">{getTick()}</span>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <Button
                                    size="sm"
                                    variant={localStatus === 'green' ? 'default' : 'outline'}
                                    className={`h-9 px-4 text-xs font-medium ${
                                        localStatus === 'green'
                                            ? 'bg-green-600 hover:bg-green-700 text-white'
                                            : 'border-green-500/50 hover:bg-green-500/10'
                                    }`}
                                    onClick={() => handleStatusChange('green')}
                                    disabled={!isConnected}
                                >
                                    🟢 GREEN
                                </Button>
                                <Button
                                    size="sm"
                                    variant={localStatus === 'yellow' ? 'default' : 'outline'}
                                    className={`h-9 px-4 text-xs font-medium ${
                                        localStatus === 'yellow'
                                            ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                                            : 'border-yellow-500/50 hover:bg-yellow-500/10'
                                    }`}
                                    onClick={() => handleStatusChange('yellow')}
                                    disabled={!isConnected}
                                >
                                    🟡 YELLOW
                                </Button>
                                <Button
                                    size="sm"
                                    variant={localStatus === 'red' ? 'default' : 'outline'}
                                    className={`h-9 px-4 text-xs font-medium ${
                                        localStatus === 'red'
                                            ? 'bg-red-600 hover:bg-red-700 text-white'
                                            : 'border-red-500/50 hover:bg-red-500/10'
                                    }`}
                                    onClick={() => handleStatusChange('red')}
                                    disabled={!isConnected}
                                >
                                    🔴 RED
                                </Button>
                            </div>
                        </div>

                        {/* Pointer Sync */}
                        <div className="pt-4">
                            <p className="text-sm font-semibold text-foreground mb-2">👆 Pointer Sync Test</p>
                            <div
                                ref={pointerCanvasRef}
                                className="relative border-2 border-dashed border-border rounded-lg bg-muted/20 cursor-crosshair overflow-hidden"
                                style={{ width: 600, height: 300 }}
                                onMouseMove={handlePointerMove}
                                onMouseLeave={handlePointerLeave}
                            >
                                {/* Grid pattern */}
                                <div
                                    className="absolute inset-0 opacity-10"
                                    style={{
                                        backgroundImage: `
                                            linear-gradient(to right, currentColor 1px, transparent 1px),
                                            linear-gradient(to bottom, currentColor 1px, transparent 1px)
                                        `,
                                        backgroundSize: '50px 50px',
                                    }}
                                />

                                {/* Center crosshair */}
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                    <div className="w-px h-full bg-border/30" />
                                </div>
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                    <div className="w-full h-px bg-border/30" />
                                </div>

                                {/* Local cursor indicator */}
                                {localPointerPosition.x > 0 && localPointerPosition.y > 0 && (
                                    <div
                                        className="absolute pointer-events-none"
                                        style={{
                                            left: localPointerPosition.x,
                                            top: localPointerPosition.y,
                                            transform: 'translate(-50%, -50%)',
                                        }}
                                    >
                                        <div className="w-4 h-4 rounded-full bg-blue-500/50 border-2 border-blue-500 animate-pulse" />
                                    </div>
                                )}

                                {/* Canvas label */}
                                <div className="absolute top-2 left-2 px-2 py-1 rounded bg-background/80 text-xs font-medium">
                                    Pointer Area (600 × 300)
                                </div>

                                {/* Coordinate display */}
                                {localPointerPosition.x > 0 && localPointerPosition.y > 0 && (
                                    <div className="absolute bottom-2 right-2 px-2 py-1 rounded bg-background/80 text-xs font-mono">
                                        X: {Math.round(localPointerPosition.x)} Y: {Math.round(localPointerPosition.y)}
                                    </div>
                                )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">
                                Move your mouse in the canvas to sync position (throttled to 20fps)
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
