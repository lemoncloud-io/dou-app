import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { ArrowLeft } from 'lucide-react';

import { useWebSocketStore } from '@chatic/socket';
import { Button } from '@chatic/ui-kit/components/ui/button';

import { useSessionId } from '../../socket-test/hooks/useSessionId';
import { RemotePointerCanvas } from '../components';
import { useInitPointerWebSocket, useRemotePointers } from '../hooks';
import { usePointerStore } from '../stores';

import type { ClientStatusType } from '../types';
import type { WebSocketMessage } from '@chatic/socket';
import type { JSX, MouseEvent } from 'react';

const REMOTE_CANVAS_WIDTH = 800;
const REMOTE_CANVAS_HEIGHT = 500;
const LOCAL_CANVAS_HEIGHT = 150;

/**
 * Admin Pointer Dashboard - Real-time remote pointer monitoring
 * Main feature: Remote Pointer Display (monitoring Web clients)
 * Secondary: Local Pointer broadcasting for testing
 */
export const PointerTestPage = (): JSX.Element => {
    const sessionId = useSessionId();
    const { isConnected, connectionStatus } = useWebSocketStore();
    const { connect, disconnect, send, pingCount, pongCount } = useInitPointerWebSocket(sessionId);
    const clearPointers = usePointerStore(state => state.clearPointers);
    const pointers = usePointerStore(state => state.pointers);

    // Local state for client-side values
    const [localStatus, setLocalStatus] = useState<ClientStatusType>('green');
    const [localPointerPosition, setLocalPointerPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const [serverData, setServerData] = useState<{
        tick: number;
        status: ClientStatusType;
        posX: number;
        posY: number;
        ts: number;
    } | null>(null);

    const pointerCanvasRef = useRef<HTMLDivElement>(null);
    const retryCountRef = useRef<number>(0);
    const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const unsubscribeRef = useRef<(() => void) | null>(null);

    // Refs for latest values (to avoid useEffect re-subscription)
    const localStatusRef = useRef(localStatus);

    useEffect(() => {
        localStatusRef.current = localStatus;
    }, [localStatus]);

    // Tick management
    const getTickKey = useCallback(() => `pointer_tick_${sessionId}`, [sessionId]);

    const getTick = useCallback((): number => {
        const stored = sessionStorage.getItem(getTickKey());
        return stored ? parseInt(stored, 10) : 0;
    }, [getTickKey]);

    const setTick = useCallback(
        (tick: number): void => {
            sessionStorage.setItem(getTickKey(), tick.toString());
        },
        [getTickKey]
    );

    const [displayTick, setDisplayTick] = useState<number>(0);

    // Update displayTick periodically
    useEffect(() => {
        setDisplayTick(getTick());
        const interval = setInterval(() => setDisplayTick(getTick()), 500);
        return () => clearInterval(interval);
    }, [getTick]);

    // Subscribe to remote pointer updates (filter out own messages)
    useRemotePointers(sessionId);

    // Subscribe to sync messages for tick comparison
    useEffect(() => {
        if (!isConnected) return;

        unsubscribeRef.current = useWebSocketStore.getState().subscribe((message: WebSocketMessage) => {
            if (message.data && typeof message.data === 'object') {
                const data = message.data as Record<string, unknown>;

                if (data.type === 'sync' && data.payload) {
                    const payload = data.payload as Record<string, unknown>;
                    const messageId = payload.id as string | undefined;

                    // Only process own messages (for tick sync)
                    // Other devices' messages are handled by useRemotePointers
                    if (messageId !== sessionId) {
                        return;
                    }

                    const serverTick = (payload.tick as number) ?? 0;
                    const myTick = getTick();

                    // Update server data for comparison UI (own data only)
                    setServerData({
                        tick: serverTick,
                        status: (payload.status as ClientStatusType) ?? '',
                        posX: (payload.posX as number) ?? 0,
                        posY: (payload.posY as number) ?? 0,
                        ts: (payload.ts as number) ?? Date.now(),
                    });

                    if (serverTick > myTick) {
                        // Server tick is greater - apply server state
                        retryCountRef.current = 0;
                        if (retryTimeoutRef.current) {
                            clearTimeout(retryTimeoutRef.current);
                            retryTimeoutRef.current = null;
                        }
                        setTick(serverTick);
                        if (payload.status) {
                            setLocalStatus(payload.status as ClientStatusType);
                        }
                    } else {
                        // Server tick is smaller or equal - exponential backoff retry
                        if (retryTimeoutRef.current) return;

                        const delay = Math.min(1000 * Math.pow(2, retryCountRef.current), 30000);
                        retryCountRef.current += 1;

                        retryTimeoutRef.current = setTimeout(() => {
                            retryTimeoutRef.current = null;
                            send({
                                type: 'sync',
                                action: 'update',
                                payload: {
                                    id: sessionId,
                                    status: localStatusRef.current,
                                    posX: 0,
                                    posY: 0,
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
    }, [isConnected, send, sessionId, getTick, setTick]);

    // Initial connection
    useEffect(() => {
        void connect();
    }, [connect]);

    // Ref for throttling pointer broadcasts
    const lastSentPointerRef = useRef<number>(0);

    // Pointer position handler - updates local state AND broadcasts
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
        [isConnected, send, localStatus, sessionId, getTick]
    );

    const handlePointerLeave = useCallback(() => {
        setLocalPointerPosition({ x: 0, y: 0 });
    }, []);

    // Status change handler
    const handleStatusChange = useCallback(
        (status: ClientStatusType) => {
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
        [send, localPointerPosition, sessionId, getTick, setTick]
    );

    return (
        <div className="min-h-screen bg-background">
            {/* Header */}
            <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="flex items-center justify-between px-6 py-3">
                    <div className="flex items-center gap-4">
                        <Link to="/socket-test">
                            <Button variant="ghost" size="icon">
                                <ArrowLeft className="h-5 w-5" />
                            </Button>
                        </Link>
                        <div>
                            <h1 className="text-xl font-bold">Pointer Dashboard</h1>
                            <p className="text-xs text-muted-foreground">Real-time remote pointer monitoring</p>
                        </div>
                    </div>

                    {/* Connection Status */}
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-muted/50">
                            <div
                                className={`h-2.5 w-2.5 rounded-full ${
                                    isConnected
                                        ? 'bg-green-500 animate-pulse'
                                        : connectionStatus === 'connecting'
                                          ? 'bg-yellow-500 animate-pulse'
                                          : 'bg-red-500'
                                }`}
                            />
                            <span className="text-sm font-medium">
                                {connectionStatus === 'connected'
                                    ? 'Connected'
                                    : connectionStatus === 'connecting'
                                      ? 'Connecting...'
                                      : connectionStatus === 'error'
                                        ? 'Error'
                                        : 'Disconnected'}
                            </span>
                        </div>
                        <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-muted/30 text-xs">
                            <span className="text-muted-foreground">ID:</span>
                            <span className="font-mono">{sessionId?.slice(0, 8)}...</span>
                        </div>
                        {connectionStatus === 'connected' ? (
                            <Button size="sm" variant="destructive" className="h-8" onClick={disconnect}>
                                Disconnect
                            </Button>
                        ) : connectionStatus === 'disconnected' || connectionStatus === 'error' ? (
                            <Button size="sm" variant="default" className="h-8" onClick={() => void connect()}>
                                Reconnect
                            </Button>
                        ) : null}
                    </div>
                </div>
            </header>

            <div className="flex">
                {/* Main Content - Remote Pointer Display */}
                <main className="flex-1 p-6">
                    <div className="rounded-xl border bg-card shadow-sm">
                        {/* Remote Canvas Header */}
                        <div className="flex items-center justify-between border-b px-6 py-4">
                            <div>
                                <h2 className="text-lg font-semibold flex items-center gap-2">
                                    <span className="text-2xl">📍</span> Remote Pointer Display
                                </h2>
                                <p className="text-sm text-muted-foreground mt-0.5">
                                    Web App clients&apos; mouse positions in real-time
                                </p>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary">
                                    <span className="relative flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                                    </span>
                                    <span className="text-sm font-medium">{pointers.size} device(s)</span>
                                </div>
                                <Button size="sm" variant="outline" onClick={clearPointers}>
                                    Clear All
                                </Button>
                            </div>
                        </div>

                        {/* Remote Canvas */}
                        <div className="p-6">
                            <RemotePointerCanvas width={REMOTE_CANVAS_WIDTH} height={REMOTE_CANVAS_HEIGHT} />
                        </div>

                        {/* Connected Devices List */}
                        {pointers.size > 0 && (
                            <div className="border-t px-6 py-4">
                                <h3 className="text-sm font-semibold text-foreground mb-3">Connected Devices</h3>
                                <div className="grid grid-cols-2 gap-2">
                                    {Array.from(pointers.values()).map(pointer => (
                                        <div
                                            key={pointer.deviceId}
                                            className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border"
                                        >
                                            <div className="flex items-center gap-2">
                                                <div
                                                    className={`h-3 w-3 rounded-full ${
                                                        pointer.status === 'green'
                                                            ? 'bg-green-500'
                                                            : pointer.status === 'yellow'
                                                              ? 'bg-yellow-500'
                                                              : pointer.status === 'red'
                                                                ? 'bg-red-500'
                                                                : 'bg-gray-400'
                                                    }`}
                                                />
                                                <span className="font-mono text-sm">
                                                    {pointer.deviceId.slice(0, 12)}...
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                                <span>
                                                    ({pointer.posX}, {pointer.posY})
                                                </span>
                                                <span className="font-mono">tick: {pointer.tick}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Empty State */}
                        {pointers.size === 0 && (
                            <div className="border-t px-6 py-8 text-center">
                                <p className="text-muted-foreground">No remote pointers detected</p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Open the Web App and move your mouse on the canvas
                                </p>
                            </div>
                        )}
                    </div>
                </main>

                {/* Sidebar - Controls & Local Pointer */}
                <aside className="w-80 border-l bg-muted/10 p-4 space-y-4 overflow-y-auto max-h-[calc(100vh-57px)]">
                    {/* Server vs Client Comparison */}
                    <div className="rounded-lg border bg-card p-4">
                        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                            <span>📊</span> Server vs Client
                        </h3>
                        <div className="space-y-3">
                            {/* Server Data */}
                            <div className="p-2.5 rounded-md bg-blue-500/10 border border-blue-500/20">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400">
                                        🖥️ SERVER
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                        {serverData?.ts ? new Date(serverData.ts).toLocaleTimeString('ko-KR') : '-'}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-2xl font-bold font-mono">{serverData?.tick ?? '-'}</span>
                                    <div className="flex items-center gap-1.5">
                                        <div
                                            className={`h-2.5 w-2.5 rounded-full ${
                                                serverData?.status === 'green'
                                                    ? 'bg-green-500'
                                                    : serverData?.status === 'yellow'
                                                      ? 'bg-yellow-500'
                                                      : serverData?.status === 'red'
                                                        ? 'bg-red-500'
                                                        : 'bg-gray-400'
                                            }`}
                                        />
                                        <span className="text-xs font-mono">{serverData?.status || '-'}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Client Data */}
                            <div className="p-2.5 rounded-md bg-green-500/10 border border-green-500/20">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[10px] font-semibold text-green-600 dark:text-green-400">
                                        💻 CLIENT
                                    </span>
                                    <span className="text-xs font-mono text-muted-foreground">
                                        ({Math.round(localPointerPosition.x)}, {Math.round(localPointerPosition.y)})
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-2xl font-bold font-mono">{displayTick}</span>
                                    <div className="flex items-center gap-1.5">
                                        <div
                                            className={`h-2.5 w-2.5 rounded-full ${
                                                localStatus === 'green'
                                                    ? 'bg-green-500'
                                                    : localStatus === 'yellow'
                                                      ? 'bg-yellow-500'
                                                      : 'bg-red-500'
                                            }`}
                                        />
                                        <span className="text-xs font-mono">{localStatus}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Tick Diff */}
                            {serverData && (
                                <div className="p-2 rounded bg-muted/50 text-center">
                                    <span className="text-[10px] text-muted-foreground">DIFF: </span>
                                    <span
                                        className={`font-mono font-bold ${
                                            displayTick > serverData.tick
                                                ? 'text-green-600'
                                                : displayTick < serverData.tick
                                                  ? 'text-red-600'
                                                  : 'text-yellow-600'
                                        }`}
                                    >
                                        {displayTick - serverData.tick > 0 ? '+' : ''}
                                        {displayTick - serverData.tick}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Status Control */}
                    <div className="rounded-lg border bg-card p-4">
                        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                            <span>🎯</span> Status Control
                        </h3>
                        <div className="flex gap-1.5">
                            <Button
                                size="sm"
                                variant={localStatus === 'green' ? 'default' : 'outline'}
                                className={`flex-1 h-8 text-xs ${
                                    localStatus === 'green'
                                        ? 'bg-green-600 hover:bg-green-700'
                                        : 'hover:bg-green-500/10'
                                }`}
                                onClick={() => handleStatusChange('green')}
                                disabled={!isConnected}
                            >
                                🟢
                            </Button>
                            <Button
                                size="sm"
                                variant={localStatus === 'yellow' ? 'default' : 'outline'}
                                className={`flex-1 h-8 text-xs ${
                                    localStatus === 'yellow'
                                        ? 'bg-yellow-600 hover:bg-yellow-700'
                                        : 'hover:bg-yellow-500/10'
                                }`}
                                onClick={() => handleStatusChange('yellow')}
                                disabled={!isConnected}
                            >
                                🟡
                            </Button>
                            <Button
                                size="sm"
                                variant={localStatus === 'red' ? 'default' : 'outline'}
                                className={`flex-1 h-8 text-xs ${
                                    localStatus === 'red' ? 'bg-red-600 hover:bg-red-700' : 'hover:bg-red-500/10'
                                }`}
                                onClick={() => handleStatusChange('red')}
                                disabled={!isConnected}
                            >
                                🔴
                            </Button>
                        </div>
                    </div>

                    {/* Ping/Pong Stats */}
                    <div className="rounded-lg border bg-card p-4">
                        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                            <span>📡</span> Ping/Pong
                        </h3>
                        <div className="grid grid-cols-2 gap-2">
                            <div className="flex flex-col items-center p-2 rounded bg-blue-500/10">
                                <span className="text-[10px] text-muted-foreground">PING</span>
                                <span className="text-xl font-bold font-mono text-blue-600 dark:text-blue-400">
                                    {pingCount}
                                </span>
                            </div>
                            <div className="flex flex-col items-center p-2 rounded bg-green-500/10">
                                <span className="text-[10px] text-muted-foreground">PONG</span>
                                <span className="text-xl font-bold font-mono text-green-600 dark:text-green-400">
                                    {pongCount}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Local Pointer Area */}
                    <div className="rounded-lg border bg-card p-4">
                        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                            <span>👆</span> Local Pointer (Admin)
                        </h3>
                        <div
                            ref={pointerCanvasRef}
                            className="relative border-2 border-dashed border-border rounded-lg bg-muted/20 cursor-crosshair overflow-hidden"
                            style={{ width: '100%', height: LOCAL_CANVAS_HEIGHT }}
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
                                    backgroundSize: '30px 30px',
                                }}
                            />

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
                                    <div className="w-3 h-3 rounded-full bg-blue-500/50 border-2 border-blue-500 animate-pulse" />
                                </div>
                            )}

                            {/* Coordinate display */}
                            {localPointerPosition.x > 0 && localPointerPosition.y > 0 && (
                                <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-background/80 text-[10px] font-mono">
                                    {Math.round(localPointerPosition.x)}, {Math.round(localPointerPosition.y)}
                                </div>
                            )}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-2 text-center">
                            Move mouse to broadcast (20fps)
                        </p>
                    </div>

                    {/* Info */}
                    <div className="rounded-lg border bg-muted/20 p-3">
                        <h3 className="text-xs font-semibold mb-2">How it works</h3>
                        <ol className="text-[10px] text-muted-foreground space-y-0.5 list-decimal list-inside">
                            <li>Web App users move mouse</li>
                            <li>Position sent via WebSocket</li>
                            <li>Server broadcasts to Admin</li>
                            <li>Admin displays remote cursors</li>
                        </ol>
                    </div>
                </aside>
            </div>
        </div>
    );
};
