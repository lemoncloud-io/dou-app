import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { KeyRound } from 'lucide-react';

import { Button } from '@chatic/ui-kit/components/ui/button';

import { useAuthMonitorStore } from '../stores';
import { AUTH_STATE_COLORS } from '../types';
import { AuthSessionCard } from './AuthSessionCard';

import type { SessionFilter } from '../stores/useAuthMonitorStore';
import type { AuthState } from '../types';
import type { JSX } from 'react';

const FILTER_OPTIONS: { value: SessionFilter; labelKey: string; color?: string }[] = [
    { value: 'all', labelKey: 'authTest.sessions.filters.all' },
    { value: 'pending', labelKey: 'authTest.sessions.filters.pending', color: 'bg-yellow-500' },
    { value: 'validating', labelKey: 'authTest.sessions.filters.validating', color: 'bg-blue-500' },
    { value: 'authenticated', labelKey: 'authTest.sessions.filters.authenticated', color: 'bg-green-500' },
    { value: 'failed', labelKey: 'authTest.sessions.filters.failed', color: 'bg-red-500' },
    { value: 'disconnected', labelKey: 'authTest.sessions.filters.disconnected', color: 'bg-gray-500' },
];

/**
 * Auth Session List Component
 * - Displays all connected auth sessions
 * - State statistics and filtering
 */
export const AuthSessionList = (): JSX.Element => {
    const { t } = useTranslation();
    const sessions = useAuthMonitorStore(state => state.sessions);
    const ownDeviceId = useAuthMonitorStore(state => state.ownDeviceId);
    const clearSessions = useAuthMonitorStore(state => state.clearSessions);
    const sessionFilter = useAuthMonitorStore(state => state.sessionFilter);
    const setSessionFilter = useAuthMonitorStore(state => state.setSessionFilter);
    const getSessionStats = useAuthMonitorStore(state => state.getSessionStats);

    const stats = getSessionStats();

    // Filter and sort sessions
    const filteredSessions = useMemo(() => {
        const allSessions = Array.from(sessions.values());

        const filtered = sessionFilter === 'all' ? allSessions : allSessions.filter(s => s.state === sessionFilter);

        return filtered.sort((a, b) => b.updatedAt - a.updatedAt);
    }, [sessions, sessionFilter]);

    return (
        <div className="rounded-xl border bg-card shadow-sm">
            {/* Header */}
            <div className="flex items-center justify-between border-b px-6 py-4">
                <div>
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        <KeyRound className="h-5 w-5" /> {t('authTest.sessions.title', 'Auth Sessions')}
                    </h2>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        {t('authTest.sessions.subtitle', 'Real-time auth session monitoring')}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                        </span>
                        <span className="text-sm font-medium">
                            {filteredSessions.length}
                            {sessionFilter !== 'all' && ` / ${sessions.size}`} session(s)
                        </span>
                    </div>
                    <Button size="sm" variant="outline" onClick={clearSessions}>
                        {t('authTest.sessions.clearAll', 'Clear All')}
                    </Button>
                </div>
            </div>

            {/* Statistics Bar */}
            <div className="px-6 py-3 border-b bg-muted/30">
                <div className="flex items-center gap-4">
                    <span className="text-xs font-medium text-muted-foreground">
                        {t('authTest.sessions.stats', 'Statistics')}:
                    </span>
                    <div className="flex items-center gap-3">
                        {(['pending', 'validating', 'authenticated', 'failed', 'disconnected'] as AuthState[]).map(
                            state => (
                                <button
                                    key={state}
                                    type="button"
                                    onClick={() => setSessionFilter(sessionFilter === state ? 'all' : state)}
                                    className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors ${
                                        sessionFilter === state
                                            ? 'bg-primary/20 text-primary'
                                            : 'hover:bg-muted text-muted-foreground'
                                    }`}
                                >
                                    <span className={`w-2 h-2 rounded-full ${AUTH_STATE_COLORS[state]}`} />
                                    <span className="font-medium">{stats[state]}</span>
                                </button>
                            )
                        )}
                    </div>
                </div>
            </div>

            {/* Filter Tabs */}
            <div className="px-6 py-2 border-b">
                <div className="flex items-center gap-1">
                    {FILTER_OPTIONS.map(option => (
                        <button
                            key={option.value}
                            type="button"
                            onClick={() => setSessionFilter(option.value)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                                sessionFilter === option.value
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                            }`}
                        >
                            {option.color && <span className={`w-2 h-2 rounded-full ${option.color}`} />}
                            {t(option.labelKey)}
                            {option.value !== 'all' && (
                                <span className="ml-0.5 opacity-70">({stats[option.value as AuthState] || 0})</span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Session Grid */}
            <div className="p-6">
                {filteredSessions.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                        {sessionFilter === 'all' ? (
                            <>
                                <p>{t('authTest.sessions.noSessions', 'No auth sessions detected')}</p>
                                <p className="text-xs mt-1">
                                    {t('authTest.sessions.connectClients', 'Connect clients to see their auth states')}
                                </p>
                            </>
                        ) : (
                            <p>{t('authTest.sessions.noMatchingFilter', 'No sessions match the current filter')}</p>
                        )}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {filteredSessions.map(session => (
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
                    <span className="font-medium">{t('authTest.sessions.legend', 'Legend')}:</span>
                    <span className="flex items-center gap-1">
                        <span className="w-4 h-4 rounded border-2 border-blue-500/50 bg-blue-500/5" />
                        {t('authTest.sessions.ownSession', 'Your session')}
                    </span>
                    <span className="flex items-center gap-1">
                        <span className="w-4 h-4 rounded ring-2 ring-green-500/50" />
                        {t('authTest.sessions.recentUpdate', 'Recently updated')}
                    </span>
                    <span className="flex items-center gap-1">
                        <span className="w-4 h-4 rounded bg-muted/50 opacity-50" />
                        {t('authTest.sessions.staleSession', 'Stale (>30s)')}
                    </span>
                </div>
            </div>
        </div>
    );
};
