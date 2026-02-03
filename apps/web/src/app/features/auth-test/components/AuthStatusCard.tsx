import { useTranslation } from 'react-i18next';

import { History, KeyRound } from 'lucide-react';

import { useWebSocketStore } from '@chatic/socket';
import { Button } from '@chatic/ui-kit/components/ui/button';

import { useAuthStore } from '../stores';
import { AUTH_STATE_COLORS, AUTH_STATE_LABELS } from '../types';

import type { AuthState } from '../types';
import type { TFunction } from 'i18next';
import type { JSX } from 'react';

/**
 * Format relative time with i18n support
 */
const formatRelativeTime = (timestamp: number, t: TFunction): string => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);

    if (seconds < 5) return t('authTest.time.justNow');
    if (seconds < 60) return t('authTest.time.secondsAgo', { count: seconds });
    if (seconds < 3600) return t('authTest.time.minutesAgo', { count: Math.floor(seconds / 60) });
    if (seconds < 86400) return t('authTest.time.hoursAgo', { count: Math.floor(seconds / 3600) });
    return t('authTest.time.daysAgo', { count: Math.floor(seconds / 86400) });
};

/**
 * Auth Status Card Component
 * - Displays current auth state, device ID, member info
 * - Visual state machine representation
 * - State transition history
 */
export const AuthStatusCard = (): JSX.Element => {
    const { t } = useTranslation();
    const { connectionStatus, isConnected } = useWebSocketStore();
    const authState = useAuthStore(state => state.authState);
    const stateAt = useAuthStore(state => state.stateAt);
    const deviceId = useAuthStore(state => state.deviceId);
    const authId = useAuthStore(state => state.authId);
    const memberId = useAuthStore(state => state.memberId);
    const member = useAuthStore(state => state.member);
    const error = useAuthStore(state => state.error);
    const stateHistory = useAuthStore(state => state.stateHistory);
    const clearStateHistory = useAuthStore(state => state.clearStateHistory);

    const stateColor = AUTH_STATE_COLORS[authState] || 'bg-gray-400';
    const stateLabel = AUTH_STATE_LABELS[authState] || 'Unknown';

    return (
        <div className="rounded-lg border bg-card p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <KeyRound className="h-4 w-4" /> {t('authTest.status.title')}
            </h3>

            {/* Connection Status */}
            <div className="flex items-center gap-2 mb-4">
                <div
                    className={`h-3 w-3 rounded-full ${
                        isConnected
                            ? 'bg-green-500 animate-pulse'
                            : connectionStatus === 'connecting'
                              ? 'bg-yellow-500 animate-pulse'
                              : 'bg-red-500'
                    }`}
                />
                <span className="text-sm">
                    {t('authTest.status.websocket')}:{' '}
                    <span className="font-medium">
                        {connectionStatus === 'connected'
                            ? t('authTest.connected')
                            : connectionStatus === 'connecting'
                              ? t('authTest.connecting')
                              : t('authTest.disconnected')}
                    </span>
                </span>
            </div>

            {/* Auth State */}
            <div className="space-y-3">
                {/* State Badge */}
                <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{t('authTest.status.authState')}</span>
                    <div className={`px-3 py-1 rounded-full text-white text-sm font-medium ${stateColor}`}>
                        {stateLabel}
                    </div>
                </div>

                {/* State Timestamp */}
                {stateAt && (
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">{t('authTest.status.stateTime')}</span>
                        <span className="text-xs font-mono">{new Date(stateAt).toLocaleTimeString('ko-KR')}</span>
                    </div>
                )}

                {/* Device ID */}
                <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{t('authTest.deviceId')}</span>
                    <span className="text-xs font-mono truncate max-w-[180px]" title={deviceId}>
                        {deviceId ? `${deviceId.slice(0, 8)}...${deviceId.slice(-4)}` : '-'}
                    </span>
                </div>

                {/* Auth ID */}
                <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{t('authTest.status.authId')}</span>
                    <span className="text-xs font-mono truncate max-w-[180px]" title={authId || ''}>
                        {authId ? `${authId.slice(0, 16)}...` : '-'}
                    </span>
                </div>

                {/* Member ID */}
                <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{t('authTest.status.memberId')}</span>
                    <span className="text-xs font-mono">{memberId || '-'}</span>
                </div>

                {/* Member Name */}
                {member && (
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">{t('authTest.status.memberName')}</span>
                        <span className="text-xs">{member.name || '-'}</span>
                    </div>
                )}

                {/* Error */}
                {error && (
                    <div className="mt-2 p-2 rounded bg-red-500/10 border border-red-500/20">
                        <span className="text-xs text-red-600 dark:text-red-400">
                            {t('authTest.status.error')}: {error}
                        </span>
                    </div>
                )}
            </div>

            {/* State Machine Visualization */}
            <div className="mt-4 pt-4 border-t">
                <span className="text-xs text-muted-foreground">{t('authTest.status.stateFlow')}</span>
                <div className="flex items-center gap-1 mt-2 flex-wrap">
                    {(['pending', 'validating', 'authenticated'] as const).map((state, idx) => (
                        <div key={state} className="flex items-center">
                            <div
                                className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                                    authState === state
                                        ? `${AUTH_STATE_COLORS[state]} text-white`
                                        : 'bg-muted text-muted-foreground'
                                }`}
                            >
                                {AUTH_STATE_LABELS[state]}
                            </div>
                            {idx < 2 && <span className="text-muted-foreground mx-1">→</span>}
                        </div>
                    ))}
                </div>
                <div className="flex items-center gap-1 mt-1">
                    <span className="text-muted-foreground text-[10px] mr-2">{t('authTest.status.or')}</span>
                    <div
                        className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                            authState === 'failed'
                                ? `${AUTH_STATE_COLORS['failed']} text-white`
                                : 'bg-muted text-muted-foreground'
                        }`}
                    >
                        Failed
                    </div>
                </div>
            </div>

            {/* State History */}
            {stateHistory.length > 0 && (
                <div className="mt-4 pt-4 border-t">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <History className="h-3 w-3" /> {t('authTest.status.history')}
                        </span>
                        <Button
                            size="sm"
                            variant="ghost"
                            className="h-5 text-[10px] px-1.5"
                            onClick={clearStateHistory}
                        >
                            {t('authTest.status.clearHistory')}
                        </Button>
                    </div>
                    <div className="space-y-1.5">
                        {stateHistory.slice(-5).map((transition, idx) => (
                            <div key={`${transition.timestamp}-${idx}`} className="flex items-center gap-2 text-[10px]">
                                <span className="text-muted-foreground font-mono w-14">
                                    {formatRelativeTime(transition.timestamp, t)}
                                </span>
                                <div className="flex items-center gap-1">
                                    <span
                                        className={`px-1.5 py-0.5 rounded ${AUTH_STATE_COLORS[transition.from] || 'bg-gray-400'} text-white`}
                                    >
                                        {AUTH_STATE_LABELS[transition.from as AuthState] || transition.from || 'init'}
                                    </span>
                                    <span className="text-muted-foreground">→</span>
                                    <span
                                        className={`px-1.5 py-0.5 rounded ${AUTH_STATE_COLORS[transition.to] || 'bg-gray-400'} text-white`}
                                    >
                                        {AUTH_STATE_LABELS[transition.to as AuthState] || transition.to}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
