import { useEffect } from 'react';
import { Link } from 'react-router-dom';

import { ArrowLeft } from 'lucide-react';

import { Button } from '@chatic/ui-kit/components/ui/button';

import { AuthEventLog, AuthStatusCard, AuthTestPanel } from '../components';
import { useDeviceId, useInitAuthWebSocket } from '../hooks';
import { useAuthStore } from '../stores';

import type { JSX } from 'react';

/**
 * Auth Test Page - Web App
 * - Tests WebSocket authentication scenarios
 */
export const AuthTestPage = (): JSX.Element => {
    const { deviceId, regenerateDeviceId } = useDeviceId();
    const ws = useInitAuthWebSocket(deviceId);
    const setDeviceId = useAuthStore(state => state.setDeviceId);

    // Sync device ID to store
    useEffect(() => {
        setDeviceId(deviceId);
    }, [deviceId, setDeviceId]);

    return (
        <div className="min-h-screen bg-background p-6">
            <div className="max-w-5xl mx-auto">
                {/* Header */}
                <div className="flex items-center gap-4 mb-6">
                    <Link to="/">
                        <Button variant="ghost" size="icon">
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold">웹소켓 인증 테스트</h1>
                        <p className="text-sm text-muted-foreground">웹소켓 인증 시나리오 테스트</p>
                    </div>
                </div>

                {/* Main Content */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left Column - Status & Test Panel */}
                    <div className="space-y-4">
                        <AuthStatusCard />
                        <AuthTestPanel deviceId={deviceId} ws={ws} onRegenerateDeviceId={regenerateDeviceId} />
                    </div>

                    {/* Right Column - Event Log */}
                    <div className="lg:col-span-2">
                        <AuthEventLog />
                    </div>
                </div>

                {/* Info Section */}
                <div className="mt-6 p-4 rounded-lg border bg-muted/20">
                    <h3 className="text-sm font-medium mb-2">테스트 시나리오</h3>
                    <div className="text-xs text-muted-foreground space-y-2">
                        <div>
                            <strong>1. 최초 연결 및 인증:</strong> &quot;연결&quot; 클릭 → state가
                            &apos;pending&apos;으로 변경 → &quot;인증&quot; 클릭 → state가 &apos;validating&apos; →
                            &apos;authenticated&apos;로 전이
                        </div>
                        <div>
                            <strong>2. 인증 실패:</strong> &quot;잘못된 토큰 전송&quot; 클릭 (dryRun OFF 상태에서) →
                            state가 &apos;failed&apos;로 변경
                        </div>
                        <div>
                            <strong>3. 멀티 디바이스:</strong> 여러 탭에서 이 페이지 열기 → 각 탭마다 고유한 deviceId
                            생성 → 모두 같은 서버에 연결
                        </div>
                        <div>
                            <strong>4. 재연결:</strong> &quot;연결 해제&quot; 클릭 → &quot;재연결&quot; 클릭 → 동일한
                            deviceId 유지 → 재인증 가능
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
