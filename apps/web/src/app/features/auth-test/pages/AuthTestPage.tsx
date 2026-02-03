import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { ClipboardList, KeyRound } from 'lucide-react';

import { AuthEventLog, AuthStatusCard, AuthTestPanel } from '../components';
import { useDeviceId, useInitAuthWebSocket } from '../hooks';
import { useAuthStore } from '../stores';

import type { JSX } from 'react';

/**
 * Auth Test Page - Web App
 * - Tests WebSocket authentication scenarios
 */
export const AuthTestPage = (): JSX.Element => {
    const { t } = useTranslation();
    const { deviceId, regenerateDeviceId } = useDeviceId();
    const ws = useInitAuthWebSocket(deviceId);
    const setDeviceId = useAuthStore(state => state.setDeviceId);

    // Sync device ID to store
    useEffect(() => {
        setDeviceId(deviceId);
    }, [deviceId, setDeviceId]);

    return (
        <div className="h-full overflow-auto">
            <div className="max-w-6xl mx-auto p-6">
                {/* Page Header */}
                <div className="mb-6">
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <KeyRound className="h-6 w-6" /> {t('nav.authTest')}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">{t('authTest.help.scenario1')}</p>
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
                <div className="mt-6 p-4 rounded-lg border bg-card">
                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                        <ClipboardList className="h-4 w-4" /> {t('authTest.scenarios')}
                    </h3>
                    <div className="text-xs text-muted-foreground space-y-2">
                        <div className="flex gap-2">
                            <span className="font-semibold text-foreground">1.</span>
                            <span>{t('authTest.help.scenario1')}</span>
                        </div>
                        <div className="flex gap-2">
                            <span className="font-semibold text-foreground">2.</span>
                            <span>{t('authTest.help.scenario2')}</span>
                        </div>
                        <div className="flex gap-2">
                            <span className="font-semibold text-foreground">3.</span>
                            <span>{t('authTest.help.scenario3')}</span>
                        </div>
                        <div className="flex gap-2">
                            <span className="font-semibold text-foreground">4.</span>
                            <span>{t('authTest.help.scenario4')}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
