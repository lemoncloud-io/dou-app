import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AUTH_STATE_COLORS, AUTH_STATE_LABELS } from '../types';

import type { AuthSession } from '../stores/useAuthMonitorStore';
import type { TFunction } from 'i18next';
import type { JSX } from 'react';

interface AuthSessionCardProps {
    session: AuthSession;
    isOwnSession?: boolean;
}

/**
 * Format relative time (e.g., "5s ago", "2m ago") with i18n support
 */
const formatRelativeTime = (timestamp: number, t: TFunction): string => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);

    if (seconds < 5) return t('authTest.sessions.time.justNow');
    if (seconds < 60) return t('authTest.sessions.time.secondsAgo', { count: seconds });
    if (seconds < 3600) return t('authTest.sessions.time.minutesAgo', { count: Math.floor(seconds / 60) });
    if (seconds < 86400) return t('authTest.sessions.time.hoursAgo', { count: Math.floor(seconds / 3600) });
    return t('authTest.sessions.time.daysAgo', { count: Math.floor(seconds / 86400) });
};

/**
 * Auth Session Card Component
 * - Displays individual auth session info
 * - Shows state transition history
 * - Real-time relative time updates
 */
export const AuthSessionCard = ({ session, isOwnSession }: AuthSessionCardProps): JSX.Element => {
    const { t } = useTranslation();
    const stateColor = AUTH_STATE_COLORS[session.state] || 'bg-gray-400';
    const stateLabel = AUTH_STATE_LABELS[session.state] || 'Unknown';

    // Force re-render every second for relative time
    const [, setTick] = useState(0);
    useEffect(() => {
        const interval = setInterval(() => setTick(t => t + 1), 1000);
        return () => clearInterval(interval);
    }, []);

    const timeSinceUpdate = Date.now() - session.updatedAt;
    const isStale = timeSinceUpdate > 30000; // 30 seconds
    const isRecent = timeSinceUpdate < 3000; // 3 seconds - just updated

    return (
        <div
            className={`p-3 rounded-lg border transition-all duration-300 ${
                isOwnSession ? 'border-blue-500/50 bg-blue-500/5' : 'bg-card'
            } ${isStale ? 'opacity-50' : ''} ${isRecent ? 'ring-2 ring-green-500/50' : ''}`}
        >
            <div className="flex items-center justify-between mb-2">
                {/* Device ID */}
                <div className="flex items-center gap-2">
                    <span className="font-mono text-xs truncate max-w-[120px]" title={session.deviceId}>
                        {session.deviceId.slice(0, 8)}...
                    </span>
                    {isOwnSession && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-600">
                            {t('authTest.eventLog.you', '(you)')}
                        </span>
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
                    <span className="text-muted-foreground">{t('authTest.sessions.card.authId')}</span>
                    <span className="font-mono truncate max-w-[100px]" title={session.authId}>
                        {session.authId ? `${session.authId.slice(0, 12)}...` : '-'}
                    </span>
                </div>

                {/* Member */}
                {session.memberId && (
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('authTest.sessions.card.member')}</span>
                        <span>{session.member?.name || session.memberId}</span>
                    </div>
                )}

                {/* Last Update - Relative Time */}
                <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('authTest.sessions.card.updated')}</span>
                    <span className={`font-mono ${isRecent ? 'text-green-500 font-medium' : ''}`}>
                        {formatRelativeTime(session.updatedAt, t)}
                    </span>
                </div>

                {/* State History */}
                {session.stateHistory.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-dashed">
                        <div className="text-muted-foreground mb-1">{t('authTest.sessions.card.history')}</div>
                        <div className="flex flex-wrap gap-1">
                            {session.stateHistory.slice(-5).map((transition, idx) => (
                                <div
                                    key={`${transition.timestamp}-${idx}`}
                                    className="flex items-center gap-0.5 text-[8px]"
                                    title={new Date(transition.timestamp).toLocaleTimeString()}
                                >
                                    <span
                                        className={`w-1.5 h-1.5 rounded-full ${AUTH_STATE_COLORS[transition.from] || 'bg-gray-400'}`}
                                    />
                                    <span className="text-muted-foreground">→</span>
                                    <span
                                        className={`w-1.5 h-1.5 rounded-full ${AUTH_STATE_COLORS[transition.to] || 'bg-gray-400'}`}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                )}

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
