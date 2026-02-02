import { Button } from '@chatic/ui-kit/components/ui/button';

import { useAuthStore } from '../stores';

import type { JSX } from 'react';

/**
 * Auth Event Log Component
 * - Displays sent/received events
 * - Shows timestamp, direction, type, action, payload
 */
export const AuthEventLog = (): JSX.Element => {
    const eventLog = useAuthStore(state => state.eventLog);
    const clearEventLog = useAuthStore(state => state.clearEventLog);

    return (
        <div className="rounded-lg border bg-card">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                    <span>📋</span> 이벤트 로그
                    <span className="text-xs text-muted-foreground font-normal">({eventLog.length})</span>
                </h3>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={clearEventLog}>
                    초기화
                </Button>
            </div>

            {/* Log Entries */}
            <div className="max-h-[calc(100vh-200px)] overflow-y-auto">
                {eventLog.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-muted-foreground">이벤트가 없습니다</div>
                ) : (
                    <div className="divide-y">
                        {eventLog.map(entry => (
                            <div key={entry.id} className="px-4 py-2 hover:bg-muted/30">
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
                                        {entry.direction === 'sent' ? '→ 송신' : '← 수신'}
                                    </span>

                                    {/* Type:Action */}
                                    <span className="text-xs font-mono">
                                        {entry.type}:{entry.action}
                                    </span>
                                </div>

                                {/* Payload */}
                                <div className="pl-4">
                                    <pre className="text-[10px] font-mono text-muted-foreground whitespace-pre-wrap break-all">
                                        {JSON.stringify(entry.payload, null, 2)}
                                    </pre>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
