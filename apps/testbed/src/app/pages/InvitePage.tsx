import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginWithInviteCode, useSessionIdentity } from '@chatic/web-core';
import { useRuntimeRepositories } from '@chatic/app-runtime';
import type { DataRepositoriesV2 } from '@chatic/data';
import { decodeInvite } from '../features/invite/inviteCode';

/**
 * Invite accept screen. Decodes a pasted invite bundle and runs login-invite, then caches the
 * invited cloud (cloudType:'invited').
 *
 * Uses the raw API `loginWithInviteCode(code, delegatorId, backend)` (same as apps/web), NOT
 * useInviteFlow / the session-service variant: that variant applies the invite token via
 * buildCredentialsByToken, which destructures AWS creds (AccessKeyId) the invite token doesn't
 * carry → crash. Auto cloud/site/channel entry is also skipped (invited clouds aren't
 * broker-delegable); the user enters from ChatHome after accepting.
 * Accessible to a relay guest (delegatorId) before any cloud is active.
 */
export const InvitePage = () => {
    const navigate = useNavigate();
    const { delegatorId } = useSessionIdentity();
    const repos = useRuntimeRepositories() as unknown as DataRepositoriesV2;

    const [text, setText] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState<string | null>(null);
    const [accepting, setAccepting] = useState(false);
    const [done, setDone] = useState(false);

    const handleAccept = async () => {
        setError(null);
        const payload = decodeInvite(text);
        if (!payload) {
            setError('초대 코드가 올바르지 않습니다.');
            return;
        }
        if (!delegatorId) {
            setError('게스트 로그인 후 수락할 수 있습니다. (로그인 페이지에서 게스트로 입장하세요)');
            return;
        }

        setAccepting(true);
        try {
            setStatus('초대 수락 중...');
            const data = (await loginWithInviteCode(payload.code, delegatorId, payload.backend)) as {
                cloudId?: string;
                name?: string;
            };

            // Cache the invited cloud so it shows in ChatHome's invite list and can be entered.
            // Use the target cid from the bundle (the real, delegable cloud id) — NOT data.cloudId,
            // which is the AWS account-no that switchCloud's delegate exchange refuses.
            const invitedCloudId = payload.cid || data.cloudId;
            if (invitedCloudId) {
                await repos.cloud.cacheWrite({
                    id: invitedCloudId,
                    name: data.name ?? payload.cloudName,
                    backend: payload.backend,
                    wss: payload.wss,
                    cloudType: 'invited',
                });
            }

            setStatus('초대 수락 완료 — 홈에서 초대 클라우드를 선택해 입장하세요.');
            setDone(true);
        } catch (e: any) {
            setStatus(null);
            setError(e?.message ?? String(e));
        } finally {
            setAccepting(false);
        }
    };

    return (
        <div className="min-h-dvh flex items-center justify-center p-4">
            <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">초대 수락</span>
                    <button
                        onClick={() => navigate('/chat')}
                        className="text-muted-foreground hover:text-foreground text-xs"
                    >
                        채팅으로
                    </button>
                </div>

                <p className="text-xs text-muted-foreground">전달받은 초대 코드를 붙여넣고 수락하세요.</p>
                <textarea
                    value={text}
                    onChange={e => setText(e.target.value)}
                    placeholder="초대 코드 붙여넣기"
                    className="w-full h-28 border border-border bg-background rounded p-2 text-[10px] font-mono break-all focus:outline-none focus:ring-1 focus:ring-primary"
                />

                {error && <p className="text-xs text-destructive">{error}</p>}
                {status && <p className="text-xs text-muted-foreground">{status}</p>}

                {done ? (
                    <button
                        onClick={() => navigate('/chat')}
                        className="w-full px-3 py-2 text-sm rounded bg-primary text-primary-foreground hover:opacity-80"
                    >
                        홈으로 가기
                    </button>
                ) : (
                    <button
                        onClick={() => void handleAccept()}
                        disabled={accepting || !text.trim()}
                        className="w-full px-3 py-2 text-sm rounded bg-primary text-primary-foreground disabled:opacity-50 hover:opacity-80"
                    >
                        {accepting ? '수락 처리 중...' : '초대 수락'}
                    </button>
                )}
            </div>
        </div>
    );
};
