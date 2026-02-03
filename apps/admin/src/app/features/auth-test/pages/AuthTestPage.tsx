import { useEffect } from 'react';
import { Link } from 'react-router-dom';

import { ArrowLeft } from 'lucide-react';

import { Button } from '@chatic/ui-kit/components/ui/button';

import { AdminAuthTestPanel, AuthEventLog, AuthSessionList } from '../components';
import { useDeviceId, useInitAuthWebSocket } from '../hooks';

import type { JSX } from 'react';

/**
 * Auth Test Page - Admin Dashboard
 * - Monitors all connected auth sessions
 */
export const AuthTestPage = (): JSX.Element => {
    const { deviceId, regenerateDeviceId } = useDeviceId();
    const ws = useInitAuthWebSocket(deviceId);
    const { connect } = ws;

    // Auto-connect on mount
    useEffect(() => {
        void connect();
    }, [connect]);

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
                            <h1 className="text-xl font-bold">Auth Dashboard</h1>
                            <p className="text-xs text-muted-foreground">Real-time auth session monitoring</p>
                        </div>
                    </div>
                </div>
            </header>

            <div className="flex">
                {/* Main Content - Session List */}
                <main className="flex-1 p-6 space-y-6">
                    <AuthSessionList />
                    <AuthEventLog />
                </main>

                {/* Sidebar - Controls */}
                <aside className="w-80 border-l bg-muted/10 p-4 space-y-4 overflow-y-auto max-h-[calc(100vh-57px)]">
                    <AdminAuthTestPanel deviceId={deviceId} ws={ws} onRegenerateDeviceId={regenerateDeviceId} />

                    {/* Info */}
                    <div className="rounded-lg border bg-muted/20 p-3">
                        <h3 className="text-xs font-semibold mb-2">How it works</h3>
                        <ol className="text-[10px] text-muted-foreground space-y-0.5 list-decimal list-inside">
                            <li>Web clients connect with deviceId</li>
                            <li>Server creates Auth session (pending)</li>
                            <li>Client sends token for validation</li>
                            <li>Server validates and updates state</li>
                            <li>Admin monitors all sessions here</li>
                        </ol>
                    </div>

                    {/* Legend */}
                    <div className="rounded-lg border bg-card p-3">
                        <h3 className="text-xs font-semibold mb-2">State Machine</h3>
                        <div className="text-[10px] text-muted-foreground space-y-1">
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-yellow-500" />
                                <span>pending - Connected, awaiting auth</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-blue-500" />
                                <span>validating - Token being verified</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-green-500" />
                                <span>authenticated - Valid member</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-red-500" />
                                <span>failed - Auth rejected</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-gray-500" />
                                <span>disconnected - Connection closed</span>
                            </div>
                        </div>
                    </div>
                </aside>
            </div>
        </div>
    );
};
