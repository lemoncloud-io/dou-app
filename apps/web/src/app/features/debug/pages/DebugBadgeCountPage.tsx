import { Bell, ChevronLeft, Minus, Plus, RefreshCw, RotateCcw, Send } from 'lucide-react';
import { useCallback, useState } from 'react';

import { isNative, webClient } from '@chatic/bridges';
import { useNavigateWithTransition } from '@chatic/shared';

type BadgeAction = 'fetch' | 'set' | 'clear';
type ActionStatus = 'idle' | 'pending' | 'success' | 'error';

type ActionLog = {
    id: number;
    action: BadgeAction;
    status: Exclude<ActionStatus, 'idle'>;
    message: string;
    createdAt: string;
};

const clampBadgeCount = (value: number) => Math.max(0, Math.min(9999, Math.trunc(value)));

const getResponseCount = (response: { data?: unknown }): number | null => {
    const data = response.data as { count?: unknown } | undefined;
    return typeof data?.count === 'number' ? data.count : null;
};

export const DebugBadgeCountPage = () => {
    const navigate = useNavigateWithTransition();
    const isOnNative = isNative();

    const [inputCount, setInputCount] = useState('1');
    const [nativeBadgeCount, setNativeBadgeCount] = useState<number | null>(null);
    const [status, setStatus] = useState<ActionStatus>('idle');
    const [logs, setLogs] = useState<ActionLog[]>([]);

    const appendLog = useCallback((action: BadgeAction, logStatus: Exclude<ActionStatus, 'idle'>, message: string) => {
        setLogs(prev =>
            [
                {
                    id: Date.now(),
                    action,
                    status: logStatus,
                    message,
                    createdAt: new Date().toLocaleTimeString(),
                },
                ...prev,
            ].slice(0, 8)
        );
    }, []);

    const runAction = useCallback(
        async (action: BadgeAction, count?: number) => {
            if (!isNative()) {
                setStatus('error');
                appendLog(action, 'error', 'Native bridge is not available.');
                return;
            }

            setStatus('pending');
            try {
                if (action === 'fetch') {
                    const response = await webClient.request({ type: 'FetchBadgeCount', data: {} });
                    const nextCount = getResponseCount(response);
                    setNativeBadgeCount(nextCount);
                    setStatus('success');
                    appendLog(action, 'success', `Fetched native badge count: ${nextCount ?? 'unknown'}`);
                    return;
                }

                const nextCount = clampBadgeCount(count ?? 0);
                const response = await webClient.request({ type: 'SetBadgeCount', data: { count: nextCount } });
                setNativeBadgeCount(nextCount);
                setStatus('success');
                appendLog(action, 'success', `Set native badge count to ${nextCount}. success=${response.success}`);
            } catch (error: any) {
                setStatus('error');
                appendLog(action, 'error', error?.message ?? 'Badge bridge request failed.');
            }
        },
        [appendLog]
    );

    const parsedInputCount = clampBadgeCount(Number(inputCount) || 0);

    return (
        <div className="flex h-full flex-col bg-background pt-safe-top">
            <header className="flex items-center px-[6px]">
                <button onClick={() => navigate(-1)} className="rounded-full p-[9px]">
                    <ChevronLeft size={26} strokeWidth={2} />
                </button>
                <span className="ml-2 text-[14px] font-medium text-muted-foreground">Debug</span>
            </header>

            <div className="flex-1 overflow-y-auto overscroll-none px-4 pb-safe-bottom">
                <div className="mb-6 mt-6">
                    <div className="flex items-center gap-2">
                        <Bell size={20} className="text-foreground" />
                        <h1 className="text-[20px] font-semibold leading-[1.35]">Badge Count</h1>
                    </div>
                    <p className="mt-1 text-[13px] text-muted-foreground">
                        {isOnNative ? 'Native bridge connected' : 'Browser mode'}
                    </p>
                </div>

                <div className="rounded-lg border border-border bg-card p-4">
                    <p className="text-[12px] font-medium text-muted-foreground">Native Badge</p>
                    <p className="mt-2 text-[28px] font-semibold text-foreground">{nativeBadgeCount ?? '-'}</p>
                </div>

                <div className="mt-4 rounded-lg border border-border bg-card p-4">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <h2 className="text-[15px] font-semibold text-foreground">Bridge Requests</h2>
                            <p className="mt-1 text-[12px] text-muted-foreground">
                                status: <span className="font-medium">{status}</span>
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => void runAction('fetch')}
                            disabled={status === 'pending'}
                            className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-foreground disabled:opacity-50"
                            aria-label="Fetch native badge count"
                        >
                            <RefreshCw size={18} />
                        </button>
                    </div>

                    <div className="mt-4 flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setInputCount(String(clampBadgeCount(parsedInputCount - 1)))}
                            className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-foreground"
                            aria-label="Decrease badge count"
                        >
                            <Minus size={18} />
                        </button>
                        <input
                            type="number"
                            min={0}
                            max={9999}
                            value={inputCount}
                            onChange={event => setInputCount(event.target.value)}
                            className="h-11 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-center text-[16px] font-semibold text-foreground outline-none focus:border-primary"
                        />
                        <button
                            type="button"
                            onClick={() => setInputCount(String(clampBadgeCount(parsedInputCount + 1)))}
                            className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-foreground"
                            aria-label="Increase badge count"
                        >
                            <Plus size={18} />
                        </button>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                            type="button"
                            onClick={() => void runAction('set', parsedInputCount)}
                            disabled={status === 'pending'}
                            className="flex h-11 items-center justify-center gap-1 rounded-lg bg-primary px-3 text-[13px] font-semibold text-primary-foreground disabled:opacity-50"
                        >
                            <Send size={15} />
                            <span>Set</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => void runAction('clear', 0)}
                            disabled={status === 'pending'}
                            className="flex h-11 items-center justify-center gap-1 rounded-lg bg-muted px-3 text-[13px] font-semibold text-foreground disabled:opacity-50"
                        >
                            <RotateCcw size={15} />
                            <span>Clear</span>
                        </button>
                    </div>
                </div>

                <div className="mt-4 rounded-lg border border-border bg-card p-4">
                    <h2 className="text-[15px] font-semibold text-foreground">Request Log</h2>
                    <div className="mt-3 flex flex-col gap-2">
                        {logs.length === 0 ? (
                            <p className="text-[13px] text-muted-foreground">No requests yet.</p>
                        ) : (
                            logs.map(log => (
                                <div key={log.id} className="rounded-md bg-muted px-3 py-2">
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="text-[12px] font-semibold text-foreground">{log.action}</span>
                                        <span
                                            className={
                                                log.status === 'success'
                                                    ? 'text-[12px] font-medium text-emerald-600'
                                                    : 'text-[12px] font-medium text-destructive'
                                            }
                                        >
                                            {log.status}
                                        </span>
                                    </div>
                                    <p className="mt-1 text-[12px] text-muted-foreground">
                                        {log.createdAt} - {log.message}
                                    </p>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
