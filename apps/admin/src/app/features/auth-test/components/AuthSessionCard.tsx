import { AUTH_STATE_COLORS, AUTH_STATE_LABELS } from '../types';

import type { AuthSession } from '../types';
import type { JSX } from 'react';

interface AuthSessionCardProps {
    session: AuthSession;
    isOwnSession?: boolean;
}

/**
 * Auth Session Card Component
 * - Displays individual auth session info
 */
export const AuthSessionCard = ({ session, isOwnSession }: AuthSessionCardProps): JSX.Element => {
    const stateColor = AUTH_STATE_COLORS[session.state] || 'bg-gray-400';
    const stateLabel = AUTH_STATE_LABELS[session.state] || 'Unknown';

    const timeSinceUpdate = Date.now() - session.updatedAt;
    const isStale = timeSinceUpdate > 30000; // 30 seconds

    return (
        <div
            className={`p-3 rounded-lg border ${isOwnSession ? 'border-blue-500/50 bg-blue-500/5' : 'bg-card'} ${isStale ? 'opacity-50' : ''}`}
        >
            <div className="flex items-center justify-between mb-2">
                {/* Device ID */}
                <div className="flex items-center gap-2">
                    <span className="font-mono text-xs truncate max-w-[120px]" title={session.deviceId}>
                        {session.deviceId.slice(0, 8)}...
                    </span>
                    {isOwnSession && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-600">You</span>
                    )}
                </div>

                {/* State Badge */}
                <div className={`px-2 py-0.5 rounded-full text-white text-[10px] font-medium ${stateColor}`}>
                    {stateLabel}
                </div>
            </div>

            <div className="space-y-1 text-[10px]">
                {/* Auth ID */}
                <div className="flex justify-between">
                    <span className="text-muted-foreground">Auth ID</span>
                    <span className="font-mono truncate max-w-[100px]" title={session.authId}>
                        {session.authId ? `${session.authId.slice(0, 12)}...` : '-'}
                    </span>
                </div>

                {/* Member */}
                {session.memberId && (
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">Member</span>
                        <span>{session.member?.name || session.memberId}</span>
                    </div>
                )}

                {/* State Time */}
                <div className="flex justify-between">
                    <span className="text-muted-foreground">State At</span>
                    <span className="font-mono">{new Date(session.stateAt).toLocaleTimeString('ko-KR')}</span>
                </div>

                {/* Error */}
                {session.error && (
                    <div className="mt-1 p-1.5 rounded bg-red-500/10 text-red-600 dark:text-red-400">
                        Error: {session.error}
                    </div>
                )}
            </div>
        </div>
    );
};
