import { BellRing, CheckCircle2, Copy, FileText, RefreshCw, Trash2, XCircle } from 'lucide-react';

import { isNative } from '@chatic/bridges';

import { usePushRegistration, useReceivedPushLog } from '../../hooks';
import { copyText, formatRegisteredAt } from '../../lib';
import { debugOverlayActions } from '../overlayStore';

export const PushScreen = () => {
    const isOnNative = isNative();

    const { state, token, summary, error, check } = usePushRegistration();
    const { entries, clear } = useReceivedPushLog();

    return (
        <div className="flex h-full flex-col bg-background">
            <div className="flex-1 px-4">
                <div className="mb-6 mt-6">
                    <div className="flex items-center gap-2">
                        <BellRing size={20} className="text-foreground" />
                        <h1 className="text-[20px] font-semibold leading-[1.35]">Push</h1>
                    </div>
                    <p className="mt-1 text-[13px] text-muted-foreground">
                        {isOnNative ? 'Native bridge connected' : 'Browser mode — token requires the app shell'}
                    </p>
                </div>

                {/* Section 1: server registration check */}
                <div className="rounded-lg border border-border bg-card p-4">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <h2 className="text-[15px] font-semibold text-foreground">Server Registration</h2>
                            <p className="mt-1 text-[12px] text-muted-foreground">
                                state: <span className="font-medium">{state}</span>
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => void check()}
                            disabled={state === 'checking'}
                            className="flex h-10 items-center gap-1 rounded-full bg-primary px-4 text-[13px] font-semibold text-primary-foreground disabled:opacity-50"
                        >
                            <RefreshCw size={16} className={state === 'checking' ? 'animate-spin' : ''} />
                            <span>Check</span>
                        </button>
                    </div>

                    {summary && (
                        <div className="mt-3 flex items-center gap-2">
                            {summary.registered ? (
                                <CheckCircle2 size={18} className="text-emerald-600" />
                            ) : (
                                <XCircle size={18} className="text-destructive" />
                            )}
                            <span
                                className={
                                    summary.registered
                                        ? 'text-[13px] font-semibold text-emerald-600'
                                        : 'text-[13px] font-semibold text-destructive'
                                }
                            >
                                {summary.registered ? 'Registered on server' : 'Not registered'}
                            </span>
                        </div>
                    )}

                    <dl className="mt-3 flex flex-col gap-2">
                        <button
                            type="button"
                            onClick={() => copyText(token ?? null)}
                            className="flex items-start justify-between gap-2 text-left"
                        >
                            <dt className="w-[92px] shrink-0 text-[12px] text-muted-foreground">Token</dt>
                            <dd className="flex-1 break-all text-[12px] font-medium text-foreground">
                                {token ?? '(not fetched)'}
                            </dd>
                            <Copy size={13} className="mt-0.5 shrink-0 text-muted-foreground" />
                        </button>

                        {summary?.endpoint && (
                            <button
                                type="button"
                                onClick={() => copyText(summary.endpoint)}
                                className="flex items-start justify-between gap-2 text-left"
                            >
                                <dt className="w-[92px] shrink-0 text-[12px] text-muted-foreground">Endpoint</dt>
                                <dd className="flex-1 break-all text-[12px] font-medium text-foreground">
                                    {summary.endpoint}
                                </dd>
                                <Copy size={13} className="mt-0.5 shrink-0 text-muted-foreground" />
                            </button>
                        )}

                        <div className="flex items-start justify-between gap-2">
                            <dt className="w-[92px] shrink-0 text-[12px] text-muted-foreground">Registered</dt>
                            <dd className="flex-1 text-[12px] font-medium text-foreground">
                                {formatRegisteredAt(summary?.registeredAt)}
                            </dd>
                        </div>

                        {summary?.status && (
                            <div className="flex items-start justify-between gap-2">
                                <dt className="w-[92px] shrink-0 text-[12px] text-muted-foreground">Status</dt>
                                <dd className="flex-1 text-[12px] font-medium text-foreground">{summary.status}</dd>
                            </div>
                        )}
                    </dl>

                    {error && <p className="mt-3 text-[12px] font-medium text-destructive">{error}</p>}
                </div>

                {/* Section 2: received pushes (foreground) */}
                <div className="mt-4 rounded-lg border border-border bg-card p-4">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <h2 className="text-[15px] font-semibold text-foreground">Received ({entries.length})</h2>
                            <p className="mt-1 text-[12px] text-muted-foreground">Foreground pushes via bridge</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => debugOverlayActions.selectScreen('LogBuffer')}
                                className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-foreground"
                                aria-label="Open log buffer"
                            >
                                <FileText size={16} />
                            </button>
                            <button
                                type="button"
                                onClick={clear}
                                className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-foreground"
                                aria-label="Clear received list"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    </div>

                    <div className="mt-3 flex flex-col gap-2">
                        {entries.length === 0 ? (
                            <p className="text-[13px] text-muted-foreground">No pushes received yet.</p>
                        ) : (
                            entries.map(entry => (
                                <div key={entry.id} className="rounded-md bg-muted px-3 py-2">
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="text-[13px] font-semibold text-foreground">{entry.title}</span>
                                        <span className="text-[11px] text-muted-foreground">
                                            {new Date(entry.receivedAt).toLocaleTimeString()}
                                        </span>
                                    </div>
                                    <p className="mt-0.5 text-[12px] text-muted-foreground">{entry.body}</p>
                                    <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all text-[11px] text-muted-foreground">
                                        {JSON.stringify(entry.data)}
                                    </pre>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
