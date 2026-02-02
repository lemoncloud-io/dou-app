import { useCallback, useState } from 'react';

import { useWebSocketStore } from '@chatic/socket';
import { Button } from '@chatic/ui-kit/components/ui/button';
import { webCore } from '@chatic/web-core';

import { useAuthStore } from '../stores';

import type { UseInitAuthWebSocketReturn } from '../hooks/useInitAuthWebSocket';
import type { JSX } from 'react';

interface AuthTestPanelProps {
    deviceId: string;
    ws: UseInitAuthWebSocketReturn;
    onRegenerateDeviceId: () => string;
}

/**
 * Auth Test Panel Component
 * - Provides test buttons for each scenario
 * - dryRun toggle
 * - Custom token input
 */
export const AuthTestPanel = ({ deviceId, ws, onRegenerateDeviceId }: AuthTestPanelProps): JSX.Element => {
    const { isConnected } = useWebSocketStore();
    const { connect, disconnect, sendAuthUpdate } = ws;

    const dryRun = useAuthStore(state => state.dryRun);
    const setDryRun = useAuthStore(state => state.setDryRun);
    const authState = useAuthStore(state => state.authState);
    const reset = useAuthStore(state => state.reset);

    const [customToken, setCustomToken] = useState<string>('');
    const [isLoadingToken, setIsLoadingToken] = useState(false);

    /**
     * Scenario 1: Connect and authenticate
     */
    const handleConnect = useCallback(async () => {
        reset();
        await connect();
    }, [connect, reset]);

    /**
     * Send auth update with token
     */
    const handleAuthenticate = useCallback(async () => {
        setIsLoadingToken(true);
        try {
            let token = customToken;

            // If no custom token, get from webCore
            if (!token) {
                const tokenData = await webCore.getTokenSignature();
                token = tokenData?.originToken?.identityToken || '';
            }

            sendAuthUpdate({
                token,
                dryRun,
            });
        } catch (error) {
            console.error('Failed to get token:', error);
        } finally {
            setIsLoadingToken(false);
        }
    }, [customToken, dryRun, sendAuthUpdate]);

    /**
     * Scenario 2: Send invalid token (force failure)
     */
    const handleSendInvalidToken = useCallback(() => {
        sendAuthUpdate({
            token: 'invalid-token',
            dryRun,
        });
    }, [sendAuthUpdate, dryRun]);

    /**
     * Scenario 4: Disconnect and reconnect
     */
    const handleDisconnect = useCallback(() => {
        disconnect();
    }, [disconnect]);

    const handleReconnect = useCallback(async () => {
        reset(); // Reset auth state on reconnect
        await connect();
    }, [connect, reset]);

    /**
     * Scenario 3: New device (regenerate deviceId)
     */
    const handleNewDevice = useCallback(() => {
        disconnect();
        reset();
        onRegenerateDeviceId();
    }, [disconnect, reset, onRegenerateDeviceId]);

    return (
        <div className="rounded-lg border bg-card p-4 space-y-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
                <span>🧪</span> 테스트 패널
            </h3>

            {/* Device ID Display */}
            <div className="p-2 rounded bg-muted/50">
                <span className="text-[10px] text-muted-foreground">디바이스 ID</span>
                <div className="font-mono text-xs truncate" title={deviceId}>
                    {deviceId}
                </div>
            </div>

            {/* dryRun Toggle */}
            <div className="flex items-center justify-between p-2 rounded bg-muted/30">
                <div>
                    <span className="text-sm font-medium">Dry Run 모드</span>
                    <p className="text-[10px] text-muted-foreground">토큰 검증 생략 (테스트용)</p>
                </div>
                <button
                    type="button"
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        dryRun ? 'bg-green-500' : 'bg-gray-300'
                    }`}
                    onClick={() => setDryRun(!dryRun)}
                >
                    <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            dryRun ? 'translate-x-6' : 'translate-x-1'
                        }`}
                    />
                </button>
            </div>

            {/* Custom Token Input */}
            <div className="space-y-1">
                <label className="text-xs text-muted-foreground">커스텀 토큰 (선택)</label>
                <input
                    type="text"
                    value={customToken}
                    onChange={e => setCustomToken(e.target.value)}
                    placeholder="비워두면 webCore 토큰 사용"
                    className="w-full px-2 py-1.5 text-xs rounded border bg-background"
                />
            </div>

            {/* Scenario Buttons */}
            <div className="space-y-2">
                <div className="text-xs text-muted-foreground font-medium">시나리오</div>

                {/* Scenario 1: Connect */}
                <div className="flex gap-2">
                    <Button
                        size="sm"
                        className="flex-1 h-8 text-xs"
                        onClick={handleConnect}
                        disabled={isConnected}
                        variant={isConnected ? 'outline' : 'default'}
                    >
                        1. 연결
                    </Button>
                    <Button
                        size="sm"
                        className="flex-1 h-8 text-xs"
                        onClick={handleAuthenticate}
                        disabled={!isConnected || authState === 'authenticated' || isLoadingToken}
                        variant="default"
                    >
                        {isLoadingToken ? '로딩중...' : '2. 인증'}
                    </Button>
                </div>

                {/* Scenario 2: Invalid Token */}
                <Button
                    size="sm"
                    className="w-full h-8 text-xs"
                    onClick={handleSendInvalidToken}
                    disabled={!isConnected}
                    variant="destructive"
                >
                    3. 잘못된 토큰 전송 (실패 테스트)
                </Button>

                {/* Scenario 4: Disconnect/Reconnect */}
                <div className="flex gap-2">
                    <Button
                        size="sm"
                        className="flex-1 h-8 text-xs"
                        onClick={handleDisconnect}
                        disabled={!isConnected}
                        variant="outline"
                    >
                        4a. 연결 해제
                    </Button>
                    <Button
                        size="sm"
                        className="flex-1 h-8 text-xs"
                        onClick={handleReconnect}
                        disabled={isConnected}
                        variant="outline"
                    >
                        4b. 재연결
                    </Button>
                </div>

                {/* Scenario 3: Multi-device */}
                <Button size="sm" className="w-full h-8 text-xs" onClick={handleNewDevice} variant="secondary">
                    5. 새 디바이스 (ID 재생성)
                </Button>
            </div>

            {/* Help Text */}
            <div className="pt-2 border-t">
                <div className="text-[10px] text-muted-foreground space-y-1">
                    <p>
                        <strong>시나리오 1:</strong> 연결 → state가 &apos;pending&apos;으로 변경
                    </p>
                    <p>
                        <strong>시나리오 2:</strong> 인증 → dryRun 시 &apos;authenticated&apos;, 아니면
                        &apos;validating&apos; → &apos;authenticated/failed&apos;
                    </p>
                    <p>
                        <strong>시나리오 3:</strong> 멀티 디바이스 테스트 - 여러 탭 열기
                    </p>
                    <p>
                        <strong>시나리오 4:</strong> 연결 해제/재연결 - 동일한 deviceId 유지
                    </p>
                </div>
            </div>
        </div>
    );
};
