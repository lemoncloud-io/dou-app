import { useState } from 'react';
import { useGlobalSession } from '@chatic/app-runtime';
import { useRuntimeRepositories } from '@chatic/app-runtime';
import type { DataRepositoriesV2 } from '@chatic/data';
import { encodeInvite, parseInviteLocation } from './inviteCode';

interface Props {
    channelId: string;
    onClose: () => void;
}

const inputClass =
    'w-full border border-border bg-background rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary';

/**
 * Creates an invite for the current channel via repos.user.requestInvite({ channelId, name, phone })
 * and shows a copyable bundle code (targets + endpoints) for the accepter to paste at /invite.
 */
export const InviteCreateDialog = ({ channelId, onClose }: Props) => {
    const repos = useRuntimeRepositories() as unknown as DataRepositoriesV2;
    const { activeServer, cloud } = useGlobalSession();

    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [code, setCode] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const handleCreate = async () => {
        setError(null);
        setCreating(true);
        try {
            const invite = await repos.user.requestInvite({ channelId, name: name.trim(), phone: phone.trim() });

            // The login-invite endpoint expects the code embedded in the server-built deeplink
            // (`Location`), NOT the raw InviteModel.code uuid — passing the uuid 400s as
            // "invalid (format)". Mirror apps/web: read code/_backend/_siteId from Location.
            const link = parseInviteLocation((invite as { Location?: string }).Location);

            // cid is the inviter's current cloud (MyInviteView may not carry it); endpoints/sid fall
            // back to the invite view / live session when the link omits them.
            const cid = activeServer.kind === 'cloud' ? activeServer.cloudId : (cloud.cloudId ?? '');
            const code = link.code ?? invite.code ?? '';
            if (!code) {
                throw new Error('초대 코드를 만들지 못했습니다 (Location/code 없음).');
            }
            const bundle = encodeInvite({
                code,
                cid,
                sid: link.siteId ?? invite.siteId ?? activeServer.siteId ?? '',
                channelId: invite.channelId ?? channelId,
                backend: link.backend ?? invite.$envs?.backend ?? activeServer.backend ?? undefined,
                wss: invite.$envs?.wss ?? activeServer.wss ?? undefined,
                // cloudName omitted — the accepter's login response carries the authoritative name.
            });
            setCode(bundle);
        } catch (e: any) {
            setError(e?.message ?? String(e));
        } finally {
            setCreating(false);
        }
    };

    const handleCopy = async () => {
        if (!code) return;
        try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
        } catch {
            // clipboard blocked — the readOnly textarea is selectable as a fallback
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
            <div
                className="w-full max-w-sm rounded-2xl bg-card border border-border p-4 space-y-3"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">초대 만들기</span>
                    <button
                        onClick={onClose}
                        className="text-muted-foreground hover:text-foreground text-lg leading-none"
                    >
                        ✕
                    </button>
                </div>

                {!code ? (
                    <div className="space-y-2">
                        <p className="text-xs text-muted-foreground font-mono truncate">채널: {channelId}</p>
                        <input
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="이름"
                            className={inputClass}
                        />
                        <input
                            value={phone}
                            onChange={e => setPhone(e.target.value)}
                            placeholder="전화번호"
                            className={inputClass}
                        />
                        {error && <p className="text-xs text-destructive">{error}</p>}
                        <button
                            onClick={() => void handleCreate()}
                            disabled={creating || !name.trim() || !phone.trim()}
                            className="px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground disabled:opacity-50 hover:opacity-80"
                        >
                            {creating ? '생성 중...' : '초대 코드 생성'}
                        </button>
                    </div>
                ) : (
                    <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">
                            아래 코드를 복사해 상대에게 전달하세요 (수락: /invite).
                        </p>
                        <textarea
                            readOnly
                            value={code}
                            onFocus={e => e.currentTarget.select()}
                            className="w-full h-28 border border-border bg-background rounded p-2 text-[10px] font-mono break-all"
                        />
                        <div className="flex gap-2">
                            <button
                                onClick={() => void handleCopy()}
                                className="px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground hover:opacity-80"
                            >
                                {copied ? '복사됨 ✓' : '복사'}
                            </button>
                            <button
                                onClick={onClose}
                                className="px-3 py-1.5 text-sm rounded border border-border text-muted-foreground hover:text-foreground"
                            >
                                닫기
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
