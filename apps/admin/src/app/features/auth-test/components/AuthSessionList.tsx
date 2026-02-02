import { Button } from '@chatic/ui-kit/components/ui/button';

import { useAuthMonitorStore } from '../stores';
import { AuthSessionCard } from './AuthSessionCard';

import type { JSX } from 'react';

/**
 * Auth Session List Component
 * - Displays all connected auth sessions
 */
export const AuthSessionList = (): JSX.Element => {
    const sessions = useAuthMonitorStore(state => state.sessions);
    const ownDeviceId = useAuthMonitorStore(state => state.ownDeviceId);
    const clearSessions = useAuthMonitorStore(state => state.clearSessions);

    const sessionList = Array.from(sessions.values()).sort((a, b) => b.updatedAt - a.updatedAt);

    return (
        <div className="rounded-xl border bg-card shadow-sm">
            {/* Header */}
            <div className="flex items-center justify-between border-b px-6 py-4">
                <div>
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        <span className="text-2xl">🔐</span> Auth Sessions
                    </h2>
                    <p className="text-sm text-muted-foreground mt-0.5">Real-time auth session monitoring</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                        </span>
                        <span className="text-sm font-medium">{sessions.size} session(s)</span>
                    </div>
                    <Button size="sm" variant="outline" onClick={clearSessions}>
                        Clear All
                    </Button>
                </div>
            </div>

            {/* Session Grid */}
            <div className="p-6">
                {sessionList.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                        <p>No auth sessions detected</p>
                        <p className="text-xs mt-1">Connect clients to see their auth states</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {sessionList.map(session => (
                            <AuthSessionCard
                                key={session.deviceId}
                                session={session}
                                isOwnSession={session.deviceId === ownDeviceId}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Legend */}
            <div className="border-t px-6 py-3">
                <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                    <span className="font-medium">States:</span>
                    <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-yellow-500" /> Pending
                    </span>
                    <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-blue-500" /> Validating
                    </span>
                    <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-green-500" /> Authenticated
                    </span>
                    <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-red-500" /> Failed
                    </span>
                    <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-gray-500" /> Disconnected
                    </span>
                </div>
            </div>
        </div>
    );
};
