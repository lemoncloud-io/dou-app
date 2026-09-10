import { BellRing, CheckCircle2, Copy, FileText, RefreshCw, Trash2, XCircle } from 'lucide-react';

import { isNative } from '@chatic/bridges';

import { useDebugOperation, usePushRegistration, useReceivedPushLog } from '../../hooks';
import { buildAppDeeplink, copyText, formatRegisteredAt } from '../../lib';
import { debugOverlayActions } from '../overlayStore';
import { appBridge } from '../../../../bridge';

/**
 * The operations the app's own Notification Test screen used to own (ADR-0080 결정 11). Each is one
 * bridge command; the app executes and answers, the result lands in the line below the buttons.
 *
 * A push tap is reproduced with `openURL` on the app's own scheme rather than a dedicated command:
 * the OS hands the URL straight back as an inbound deeplink, which is the round trip a real tap
 * makes (see `OpenURLPayload`'s note on the withdrawn `SimulateInboundDeeplink`).
 *
 * The scheme is resolved per build (`buildAppDeeplink`), not written literally — a dev build
 * registers `chatic-dev:`, so a hardcoded `chatic://` would open the other channel's app on a
 * device that has both.
 */
const PUSH_TAP_PATH = '/chats';

export const PushScreen = () => {
    const isOnNative = isNative();

    const { state, token, summary, error, check } = usePushRegistration();
    const { entries, clear } = useReceivedPushLog();
    // `fire` is for the two `post`-based commands here (`openURL`, `setBadgeCount`): they get no
    // answer, so the shared hook labels them "확인 없음" instead of implying one (결정 10).
    const { result, run, fire } = useDebugOperation();

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

                {/* Section 2: operations moved off the app's Notification Test screen */}
                <div className="mt-4 rounded-lg border border-border bg-card p-4">
                    <h2 className="text-[15px] font-semibold text-foreground">조작</h2>
                    <p className="mt-1 text-[12px] text-muted-foreground">
                        앱이 실행하고 결과를 돌려줍니다{isOnNative ? '' : ' — 앱 셸 안에서만 동작합니다'}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => void run('토큰 삭제', () => appBridge.deleteFcmToken())}
                            className="rounded-md border border-border px-2 py-1 text-xs"
                        >
                            토큰 삭제
                        </button>
                        <button
                            type="button"
                            onClick={() =>
                                void run('알림 권한 요청', () => appBridge.requestPermission('NOTIFICATIONS'))
                            }
                            className="rounded-md border border-border px-2 py-1 text-xs"
                        >
                            알림 권한 요청
                        </button>
                        <button
                            type="button"
                            onClick={() =>
                                void run('로컬 알림', () =>
                                    appBridge.showNotification({
                                        title: '디버그 알림',
                                        body: '웹 패널에서 띄운 로컬 알림입니다',
                                        deeplink: buildAppDeeplink(PUSH_TAP_PATH),
                                    })
                                )
                            }
                            className="rounded-md border border-border px-2 py-1 text-xs"
                        >
                            로컬 알림 띄우기
                        </button>
                        <button
                            type="button"
                            onClick={() => void run('뱃지 조회', () => appBridge.fetchBadgeCount())}
                            className="rounded-md border border-border px-2 py-1 text-xs"
                        >
                            뱃지 조회
                        </button>
                        <button
                            type="button"
                            onClick={() => fire('뱃지 0으로', () => appBridge.setBadgeCount(0))}
                            className="rounded-md border border-border px-2 py-1 text-xs"
                        >
                            뱃지 0으로
                        </button>
                        <button
                            type="button"
                            onClick={() =>
                                fire('푸시 탭 재현', () => appBridge.openURL(buildAppDeeplink(PUSH_TAP_PATH)))
                            }
                            className="rounded-md border border-border px-2 py-1 text-xs"
                        >
                            푸시 탭 재현
                        </button>
                    </div>
                    {result && <p className="mt-3 break-all font-mono text-[12px] text-muted-foreground">{result}</p>}
                </div>

                {/* Section 3: received pushes (foreground) */}
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
