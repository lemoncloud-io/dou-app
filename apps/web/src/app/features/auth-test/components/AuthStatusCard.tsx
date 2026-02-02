import { useWebSocketStore } from '@chatic/socket';

import { useAuthStore } from '../stores';
import { AUTH_STATE_COLORS, AUTH_STATE_LABELS } from '../types';

import type { JSX } from 'react';

/**
 * Auth Status Card Component
 * - Displays current auth state, device ID, member info
 * - Visual state machine representation
 */
export const AuthStatusCard = (): JSX.Element => {
    const { connectionStatus, isConnected } = useWebSocketStore();
    const authState = useAuthStore(state => state.authState);
    const stateAt = useAuthStore(state => state.stateAt);
    const deviceId = useAuthStore(state => state.deviceId);
    const authId = useAuthStore(state => state.authId);
    const memberId = useAuthStore(state => state.memberId);
    const member = useAuthStore(state => state.member);
    const error = useAuthStore(state => state.error);

    const stateColor = AUTH_STATE_COLORS[authState] || 'bg-gray-400';
    const stateLabel = AUTH_STATE_LABELS[authState] || '알 수 없음';

    return (
        <div className="rounded-lg border bg-card p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <span>🔐</span> 인증 상태
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
                    웹소켓:{' '}
                    <span className="font-medium">
                        {connectionStatus === 'connected'
                            ? '연결됨'
                            : connectionStatus === 'connecting'
                              ? '연결중...'
                              : '연결 안됨'}
                    </span>
                </span>
            </div>

            {/* Auth State */}
            <div className="space-y-3">
                {/* State Badge */}
                <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">인증 상태</span>
                    <div className={`px-3 py-1 rounded-full text-white text-sm font-medium ${stateColor}`}>
                        {stateLabel}
                    </div>
                </div>

                {/* State Timestamp */}
                {stateAt && (
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">상태 변경 시간</span>
                        <span className="text-xs font-mono">{new Date(stateAt).toLocaleTimeString('ko-KR')}</span>
                    </div>
                )}

                {/* Device ID */}
                <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">디바이스 ID</span>
                    <span className="text-xs font-mono truncate max-w-[180px]" title={deviceId}>
                        {deviceId ? `${deviceId.slice(0, 8)}...${deviceId.slice(-4)}` : '-'}
                    </span>
                </div>

                {/* Auth ID */}
                <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">인증 ID</span>
                    <span className="text-xs font-mono truncate max-w-[180px]" title={authId || ''}>
                        {authId ? `${authId.slice(0, 16)}...` : '-'}
                    </span>
                </div>

                {/* Member ID */}
                <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">멤버 ID</span>
                    <span className="text-xs font-mono">{memberId || '-'}</span>
                </div>

                {/* Member Name */}
                {member && (
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">멤버 이름</span>
                        <span className="text-xs">{member.name || '-'}</span>
                    </div>
                )}

                {/* Error */}
                {error && (
                    <div className="mt-2 p-2 rounded bg-red-500/10 border border-red-500/20">
                        <span className="text-xs text-red-600 dark:text-red-400">오류: {error}</span>
                    </div>
                )}
            </div>

            {/* State Machine Visualization */}
            <div className="mt-4 pt-4 border-t">
                <span className="text-xs text-muted-foreground">상태 흐름</span>
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
                    <span className="text-muted-foreground text-[10px] mr-2">또는</span>
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
        </div>
    );
};
