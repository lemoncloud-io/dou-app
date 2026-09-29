import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { runtime } from '@chatic/app-runtime';
import type { DataRepositories } from '@chatic/data';
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
    const { delegatorId } = runtime.session.useSessionIdentity();
    const repos = runtime.data.useRuntimeRepositories() as unknown as DataRepositories;

    const [text, setText] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState<string | null>(null);
    const [accepting, setAccepting] = useState(false);
    const [done, setDone] = useState(false);

    const handleAccept = async () => {
        setError(null);
        const payload = decodeInvite(text);
        if (!payload) {
            setError('The invite code is invalid.');
            return;
        }
        if (!delegatorId) {
            setError('You can accept only after a guest login. (Enter as a guest on the login page)');
            return;
        }

        setAccepting(true);
        try {
            setStatus('Accepting invite...');
            const data = (await runtime.session.registerUserWithInviteCode(
                payload.code,
                delegatorId,
                payload.backend
            )) as {
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

            setStatus('Invite accepted — select the invited cloud on the home screen to enter.');
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
                    <span className="font-semibold text-sm">Accept invite</span>
                    <button
                        onClick={() => navigate('/chat')}
                        className="text-muted-foreground hover:text-foreground text-xs"
                    >
                        To chat
                    </button>
                </div>

                <p className="text-xs text-muted-foreground">Paste the invite code you received and accept it.</p>
                <textarea
                    value={text}
                    onChange={e => setText(e.target.value)}
                    placeholder="Paste invite code"
                    className="w-full h-28 border border-border bg-background rounded p-2 text-[10px] font-mono break-all focus:outline-none focus:ring-1 focus:ring-primary"
                />

                {error && <p className="text-xs text-destructive">{error}</p>}
                {status && <p className="text-xs text-muted-foreground">{status}</p>}

                {done ? (
                    <button
                        onClick={() => navigate('/chat')}
                        className="w-full px-3 py-2 text-sm rounded bg-primary text-primary-foreground hover:opacity-80"
                    >
                        Go home
                    </button>
                ) : (
                    <button
                        onClick={() => void handleAccept()}
                        disabled={accepting || !text.trim()}
                        className="w-full px-3 py-2 text-sm rounded bg-primary text-primary-foreground disabled:opacity-50 hover:opacity-80"
                    >
                        {accepting ? 'Accepting...' : 'Accept invite'}
                    </button>
                )}
            </div>
        </div>
    );
};
