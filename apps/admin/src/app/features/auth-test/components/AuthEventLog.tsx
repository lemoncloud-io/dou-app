import { useTranslation } from 'react-i18next';

import { ClipboardList } from 'lucide-react';

import { Button } from '@chatic/ui-kit/components/ui/button';

import { useAuthMonitorStore } from '../stores';

import type { JSX } from 'react';

/**
 * Auth Event Log Component for Admin
 * - Displays all auth events from all devices
 */
export const AuthEventLog = (): JSX.Element => {
    const { t } = useTranslation();
    const eventLog = useAuthMonitorStore(state => state.eventLog);
    const clearEventLog = useAuthMonitorStore(state => state.clearEventLog);
    const ownDeviceId = useAuthMonitorStore(state => state.ownDeviceId);

    return (
        <div className="rounded-lg border bg-card">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                    <ClipboardList className="h-4 w-4" /> {t('authTest.eventLog.title')}
                    <span className="text-xs text-muted-foreground font-normal">({eventLog.length})</span>
                </h3>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={clearEventLog}>
                    {t('authTest.eventLog.clear')}
                </Button>
            </div>

            {/* Log Entries */}
            <div className="max-h-[400px] overflow-y-auto">
                {eventLog.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                        {t('authTest.eventLog.noEvents')}
                    </div>
                ) : (
                    <div className="divide-y">
                        {eventLog.map(entry => {
                            const isOwnEvent = entry.sourceDeviceId === ownDeviceId;

                            return (
                                <div
                                    key={entry.id}
                                    className={`px-4 py-2 hover:bg-muted/30 ${isOwnEvent ? 'bg-blue-500/5' : ''}`}
                                >
                                    <div className="flex items-center gap-2 mb-1">
                                        {/* Timestamp */}
                                        <span className="text-[10px] font-mono text-muted-foreground">
                                            {new Date(entry.timestamp).toLocaleTimeString('ko-KR')}
                                        </span>

                                        {/* Direction */}
                                        <span
                                            className={`text-xs font-medium ${
                                                entry.direction === 'sent' ? 'text-blue-500' : 'text-green-500'
                                            }`}
                                        >
                                            {entry.direction === 'sent'
                                                ? `→ ${t('authTest.eventLog.sent')}`
                                                : `← ${t('authTest.eventLog.received')}`}
                                        </span>

                                        {/* Type:Action */}
                                        <span className="text-xs font-mono">
                                            {entry.type}:{entry.action}
                                        </span>

                                        {/* Source Device */}
                                        {entry.sourceDeviceId && (
                                            <span className="text-[10px] text-muted-foreground font-mono">
                                                [{entry.sourceDeviceId.slice(0, 8)}...]
                                                {isOwnEvent && (
                                                    <span className="text-blue-500 ml-1">
                                                        {t('authTest.eventLog.you')}
                                                    </span>
                                                )}
                                            </span>
                                        )}
                                    </div>

                                    {/* Payload */}
                                    <div className="pl-4">
                                        <pre className="text-[10px] font-mono text-muted-foreground whitespace-pre-wrap break-all">
                                            {JSON.stringify(entry.payload, null, 2)}
                                        </pre>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};
