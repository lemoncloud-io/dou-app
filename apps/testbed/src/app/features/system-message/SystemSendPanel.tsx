import { useState } from 'react';
import { runtime } from '@chatic/app-runtime';
import type { DataRepositories } from '@chatic/data';
import { sendSystemChat, type SystemSubType } from './sendSystemChat';

interface Props {
    channelId: string;
    onClose: () => void;
}

// Testbed-only panel to emit a system message over the socket `chat.send` event. The owner is the
// current socket user, so this exercises self enter/exit. Pick join or leave and send.
export const SystemSendPanel = ({ channelId, onClose }: Props) => {
    const repos = runtime.data.useRuntimeRepositories() as unknown as DataRepositories;

    const [subType, setSubType] = useState<SystemSubType>('join');
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sentAt, setSentAt] = useState<number | null>(null);

    const handleSend = async () => {
        setError(null);
        setSending(true);
        try {
            await sendSystemChat(payload => repos.chat.sendChat(payload), channelId, subType);
            // The created chat arrives back through the normal stream/sync, so we only flag success.
            setSentAt(Date.now());
        } catch (e: any) {
            setError(e?.message ?? String(e));
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
            <div
                className="w-full max-w-sm rounded-2xl bg-card border border-border p-4 space-y-3"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">Send system message</span>
                    <button
                        onClick={onClose}
                        className="text-muted-foreground hover:text-foreground text-lg leading-none"
                    >
                        ✕
                    </button>
                </div>

                <p className="text-xs text-muted-foreground font-mono truncate">Channel: {channelId}</p>
                <p className="text-xs text-muted-foreground">
                    The owner is the current logged-in user (socket session).
                </p>

                <div className="flex gap-2">
                    {(['join', 'leave'] as const).map(option => (
                        <button
                            key={option}
                            onClick={() => setSubType(option)}
                            className={`flex-1 px-3 py-1.5 text-sm rounded border ${
                                subType === option
                                    ? 'border-primary bg-primary/10 text-primary'
                                    : 'border-border text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            {option === 'join' ? 'Join' : 'Leave'}
                        </button>
                    ))}
                </div>

                {error && <p className="text-xs text-destructive break-words">{error}</p>}
                {sentAt && !error && <p className="text-xs text-primary">Sent ✓ (reflected shortly via the stream)</p>}

                <button
                    onClick={() => void handleSend()}
                    disabled={sending}
                    className="px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground disabled:opacity-50 hover:opacity-80"
                >
                    {sending ? 'Sending...' : 'Send'}
                </button>
            </div>
        </div>
    );
};
