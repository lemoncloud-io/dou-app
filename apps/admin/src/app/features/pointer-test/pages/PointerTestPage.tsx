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

const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 400;

/**
 * Admin Pointer Test Page - Displays remote mouse positions
 * Receives pointer positions from Web App via WebSocket
 * Now includes tick/status management and server vs client comparison
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

    const lastSentPointerRef = useRef<number>(0);
    const pointerCanvasRef = useRef<HTMLDivElement>(null);
    const retryCountRef = useRef<number>(0);
    const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const unsubscribeRef = useRef<(() => void) | null>(null);

    // Refs for latest values (to avoid useEffect re-subscription)
    const localStatusRef = useRef(localStatus);
    const localPointerPositionRef = useRef(localPointerPosition);

    useEffect(() => {
        localStatusRef.current = localStatus;
    }, [localStatus]);

    useEffect(() => {
        localPointerPositionRef.current = localPointerPosition;
    }, [localPointerPosition]);

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
                    const serverTick = (payload.tick as number) ?? 0;
                    const myTick = getTick();

                    // Update server data for comparison UI
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
                        if (payload.posX !== undefined && payload.posY !== undefined) {
                            setLocalPointerPosition({
                                x: payload.posX as number,
                                y: payload.posY as number,
                            });
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
                                    posX: Math.round(localPointerPositionRef.current.x),
                                    posY: Math.round(localPointerPositionRef.current.y),
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
        <div className="min-h-screen bg-background p-6">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="flex items-center gap-4 mb-6">
                    <Link to="/socket-test">
                        <Button variant="ghost" size="icon">
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold">Remote Pointer Viewer</h1>
                        <p className="text-sm text-muted-foreground">
                            View real-time mouse positions from connected Web App clients
                        </p>
                    </div>
                </div>

                {/* Connection Status */}
                <div className="flex items-center gap-3 mb-6">
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

                    {connectionStatus === 'connected' ? (
                        <Button size="sm" variant="destructive" className="h-8" onClick={disconnect}>
                            Disconnect
                        </Button>
                    ) : connectionStatus === 'disconnected' || connectionStatus === 'error' ? (
                        <Button size="sm" variant="default" className="h-8" onClick={() => void connect()}>
                            Reconnect
                        </Button>
                    ) : null}

                    <Button size="sm" variant="outline" className="h-8" onClick={clearPointers}>
                        Clear Pointers
                    </Button>
                </div>

                {/* Tick/Status Comparison Panel */}
                <div className="p-4 rounded-lg border bg-card mb-6">
                    <h2 className="text-sm font-medium text-muted-foreground mb-4">📊 Server vs Client Comparison</h2>
                    <div className="grid grid-cols-2 gap-4">
                        {/* Server Data */}
                        <div className="p-3 rounded-md bg-blue-500/10 border border-blue-500/30">
                            <h3 className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-2">
                                🖥️ Server (Last Received)
                            </h3>
                            <div className="space-y-2 text-xs">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Tick:</span>
                                    <span className="font-mono font-bold text-lg">{serverData?.tick ?? '-'}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-muted-foreground">Status:</span>
                                    <div className="flex items-center gap-2">
                                        <div
                                            className={`h-3 w-3 rounded-full ${
                                                serverData?.status === 'green'
                                                    ? 'bg-green-500'
                                                    : serverData?.status === 'yellow'
                                                      ? 'bg-yellow-500'
                                                      : serverData?.status === 'red'
                                                        ? 'bg-red-500'
                                                        : 'bg-gray-400'
                                            }`}
                                        />
                                        <span className="font-mono">{serverData?.status || '-'}</span>
                                    </div>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Position:</span>
                                    <span className="font-mono">
                                        ({serverData?.posX ?? '-'}, {serverData?.posY ?? '-'})
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Timestamp:</span>
                                    <span className="font-mono text-[10px]">
                                        {serverData?.ts ? new Date(serverData.ts).toLocaleTimeString('ko-KR') : '-'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Client Data */}
                        <div className="p-3 rounded-md bg-green-500/10 border border-green-500/30">
                            <h3 className="text-xs font-semibold text-green-600 dark:text-green-400 mb-2">
                                💻 Client (Local)
                            </h3>
                            <div className="space-y-2 text-xs">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Tick:</span>
                                    <span className="font-mono font-bold text-lg">{displayTick}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-muted-foreground">Status:</span>
                                    <div className="flex items-center gap-2">
                                        <div
                                            className={`h-3 w-3 rounded-full ${
                                                localStatus === 'green'
                                                    ? 'bg-green-500'
                                                    : localStatus === 'yellow'
                                                      ? 'bg-yellow-500'
                                                      : 'bg-red-500'
                                            }`}
                                        />
                                        <span className="font-mono">{localStatus}</span>
                                    </div>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Position:</span>
                                    <span className="font-mono">
                                        ({Math.round(localPointerPosition.x)}, {Math.round(localPointerPosition.y)})
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Session ID:</span>
                                    <span className="font-mono text-[10px]">{sessionId?.slice(0, 8) ?? '-'}...</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Tick Diff */}
                    {serverData && (
                        <div className="mt-3 p-2 rounded bg-muted/50 text-center">
                            <span className="text-xs text-muted-foreground">Tick Diff: </span>
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
                            <span className="text-xs text-muted-foreground ml-2">
                                (
                                {displayTick > serverData.tick
                                    ? 'Client ahead'
                                    : displayTick < serverData.tick
                                      ? 'Server ahead'
                                      : 'In sync'}
                                )
                            </span>
                        </div>
                    )}
                </div>

                {/* Status Change Buttons */}
                <div className="p-4 rounded-lg border bg-card mb-6">
                    <h2 className="text-sm font-medium text-muted-foreground mb-3">🎯 Status Control</h2>
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

                {/* Ping/Pong Stats */}
                <div className="p-4 rounded-lg border bg-card mb-6">
                    <h2 className="text-sm font-medium text-muted-foreground mb-3">📡 Ping/Pong Statistics</h2>
                    <div className="grid grid-cols-2 gap-3">
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

                {/* Local Pointer Sync Area */}
                <div className="p-4 rounded-lg border bg-card mb-6">
                    <h2 className="text-sm font-medium text-muted-foreground mb-3">👆 Local Pointer Sync</h2>
                    <div
                        ref={pointerCanvasRef}
                        className="relative border-2 border-dashed border-border rounded-lg bg-muted/20 cursor-crosshair overflow-hidden"
                        style={{ width: CANVAS_WIDTH, height: 200 }}
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
                            Local Pointer Area ({CANVAS_WIDTH} × 200)
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

                {/* Remote Pointer Canvas */}
                <div className="p-6 rounded-lg border bg-card">
                    <h2 className="text-sm font-medium text-muted-foreground mb-4">📍 Remote Pointer Display</h2>

                    <RemotePointerCanvas width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />

                    {/* Remote pointers list */}
                    {pointers.size > 0 && (
                        <div className="mt-4 p-3 rounded bg-muted/30">
                            <h3 className="text-xs font-semibold text-foreground mb-2">
                                Connected Devices ({pointers.size})
                            </h3>
                            <div className="space-y-1 text-xs">
                                {Array.from(pointers.values()).map(pointer => (
                                    <div
                                        key={pointer.deviceId}
                                        className="flex items-center justify-between p-1 rounded bg-background/50"
                                    >
                                        <span className="font-mono">{pointer.deviceId.slice(0, 8)}...</span>
                                        <div className="flex items-center gap-3">
                                            <span className="text-muted-foreground">
                                                pos: ({pointer.posX}, {pointer.posY})
                                            </span>
                                            <span className="text-muted-foreground">tick: {pointer.tick}</span>
                                            <div
                                                className={`h-2 w-2 rounded-full ${
                                                    pointer.status === 'green'
                                                        ? 'bg-green-500'
                                                        : pointer.status === 'yellow'
                                                          ? 'bg-yellow-500'
                                                          : pointer.status === 'red'
                                                            ? 'bg-red-500'
                                                            : 'bg-gray-400'
                                                }`}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="mt-4 text-xs text-muted-foreground">
                        <p>• Remote cursors appear when Web App users move their mouse</p>
                        <p>• Each device gets a unique color</p>
                        <p>• Stale pointers (no update for 5s) are dimmed</p>
                    </div>
                </div>

                {/* Info */}
                <div className="mt-6 p-4 rounded-lg border bg-muted/20">
                    <h3 className="text-sm font-medium mb-2">How it works</h3>
                    <div className="text-xs text-muted-foreground space-y-1">
                        <p>1. Web App users move their mouse on their canvas</p>
                        <p>2. Position is sent via WebSocket: {'{ type: "sync", action: "update", payload: {...} }'}</p>
                        <p>3. Server adds payload.id (deviceId) and broadcasts to Admin channel</p>
                        <p>
                            4. Admin receives and displays cursor at position ({CANVAS_WIDTH}×{CANVAS_HEIGHT})
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
