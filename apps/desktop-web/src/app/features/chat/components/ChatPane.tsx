import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useWebCoreStore } from '@chatic/web-core';

import type { DomainChannel } from '@chatic/data';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import { displayName, useChatMutations, useChats, useReadCursorStore, useReadReceipts } from '../../../shared';
import type { ChannelMember } from '../../channels';
import { useChannelSettingsStore } from '../../channels';
import { ChannelHeaderMenu } from './ChannelHeaderMenu';
import { Composer } from './Composer';
import { MessageList } from './MessageList';

interface ChatPaneProps {
    channel: DomainChannel | undefined;
    /** Roster for the open channel (lifted to HomePage so it's fetched once). */
    members: ChannelMember[];
}

export const ChatPane = ({ channel, members }: ChatPaneProps) => {
    const { t } = useTranslation();
    const channelId = channel?.id ?? null;
    const myUid = useWebCoreStore(s => s.profile?.uid ?? null);
    const myName = useWebCoreStore(s => s.profile?.$user?.name ?? '');
    const viewer = useMemo(() => ({ uid: myUid, name: myName }), [myUid, myName]);
    const { messages, isLoading, loadOlder, hasMore, isLoadingOlder } = useChats(channelId);
    const { sendMessage, retryMessage, isSending } = useChatMutations();
    const openSettings = useChannelSettingsStore(s => s.open);
    const [sendTick, setSendTick] = useState(0);

    // Snapshot the read position when the channel opens, before HomePage's
    // mark-read effect advances the cursor — this is where the "new messages"
    // divider sits. Captured during render so it precedes that post-commit effect.
    const baselineRef = useRef<{ id: string | null; no: number }>({ id: null, no: 0 });
    const serverJoinNo = channel?.$join?.chatNo ?? 0;
    // Re-capture once the channel's $join arrives (it can land a render after the
    // channelId flips), otherwise the divider would freeze at a stale 0 baseline.
    if (baselineRef.current.id !== channelId || (baselineRef.current.no === 0 && serverJoinNo > 0)) {
        const localCursor = channelId ? (useReadCursorStore.getState().cursors[channelId] ?? 0) : 0;
        baselineRef.current = { id: channelId, no: Math.max(localCursor, serverJoinNo) };
    }
    const baselineReadNo = baselineRef.current.no;

    // owner$ is often omitted on other users' messages; resolve author names from
    // the channel roster (id → name). Members are fetched once in HomePage.
    const memberNames = useMemo(() => {
        const map = new Map<string, string>();
        for (const member of members) map.set(member.id, displayName(member));
        return map;
    }, [members]);

    // Report read position while this channel is open + the window is focused.
    useReadReceipts(channelId, messages);

    if (!channelId || !channel) {
        return (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-2xl font-semibold text-primary">
                    #
                </div>
                <p className="text-sm font-medium text-foreground">{t('chat.empty')}</p>
                <p className="max-w-xs text-xs text-muted-foreground">{t('chat.emptyHint')}</p>
            </div>
        );
    }

    const handleSend = (content: string) => {
        setSendTick(tick => tick + 1);
        void sendMessage({ channelId, content }).catch(() =>
            toast({ variant: 'destructive', description: t('toast.messageFailed') })
        );
    };

    const memberCount = channel.memberNo ?? 0;
    const desc = channel.desc?.trim();

    return (
        <>
            <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
                <button
                    type="button"
                    onClick={() => openSettings(channelId)}
                    title={t('chat.header.settings')}
                    className="flex min-w-0 items-center gap-2 rounded-md py-1 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-sm font-bold text-primary">
                        #
                    </span>
                    <span className="truncate text-base font-bold text-foreground">{channel.name ?? channelId}</span>
                    {desc && <span className="truncate text-xs text-muted-foreground">{desc}</span>}
                    {memberCount > 0 && (
                        <span className="shrink-0 border-l border-border pl-2 text-xs tabular-nums text-muted-foreground">
                            {t('channels.settings.memberCount', { count: memberCount })}
                        </span>
                    )}
                </button>
                <ChannelHeaderMenu channel={channel} myUid={myUid} />
            </header>
            <MessageList
                key={channelId}
                messages={messages}
                isLoading={isLoading}
                viewer={viewer}
                names={memberNames}
                baselineReadNo={baselineReadNo}
                onRetry={retryMessage}
                onLoadOlder={() => void loadOlder()}
                hasMore={hasMore}
                isLoadingOlder={isLoadingOlder}
                scrollSignal={sendTick}
            />
            <Composer disabled={isSending} onSend={handleSend} />
        </>
    );
};
