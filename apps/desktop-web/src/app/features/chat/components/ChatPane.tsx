import { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { useWebCoreStore } from '@chatic/web-core';

import type { DomainChannel } from '@chatic/data';

import { displayName, useChatMutations, useChats, useReadCursorStore, useReadReceipts } from '../../../shared';
import { useChannelMembers } from '../../channels';
import { ChannelHeaderMenu } from './ChannelHeaderMenu';
import { Composer } from './Composer';
import { MessageList } from './MessageList';

interface ChatPaneProps {
    channel: DomainChannel | undefined;
}

export const ChatPane = ({ channel }: ChatPaneProps) => {
    const { t } = useTranslation();
    const channelId = channel?.id ?? null;
    const myUid = useWebCoreStore(s => s.profile?.uid ?? null);
    const myName = useWebCoreStore(s => s.profile?.$user?.name ?? '');
    const viewer = useMemo(() => ({ uid: myUid, name: myName }), [myUid, myName]);
    const { messages, isLoading, loadOlder, hasMore, isLoadingOlder } = useChats(channelId);
    const { sendMessage, retryMessage, isSending } = useChatMutations();

    // Snapshot the read position when the channel opens, before HomePage's
    // mark-read effect advances the cursor — this is where the "new messages"
    // divider sits. Captured during render so it precedes that post-commit effect.
    const baselineRef = useRef<{ id: string | null; no: number }>({ id: null, no: 0 });
    if (baselineRef.current.id !== channelId) {
        const localCursor = channelId ? (useReadCursorStore.getState().cursors[channelId] ?? 0) : 0;
        baselineRef.current = { id: channelId, no: Math.max(localCursor, channel?.$join?.chatNo ?? 0) };
    }
    const baselineReadNo = baselineRef.current.no;

    // The server frequently omits owner$ on other users' messages, so resolve
    // author names from the channel roster (id → name) for the message list.
    const { members } = useChannelMembers(channelId, channel?.ownerId);
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
        void sendMessage({ channelId, content });
    };

    const memberCount = channel.memberNo ?? 0;

    return (
        <>
            <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
                <div className="flex min-w-0 items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-sm font-bold text-primary">
                        #
                    </span>
                    <span className="truncate text-base font-bold text-foreground">{channel.name ?? channelId}</span>
                    {memberCount > 0 && (
                        <span className="shrink-0 border-l border-border pl-2 text-xs tabular-nums text-muted-foreground">
                            {t('channels.settings.memberCount', { count: memberCount })}
                        </span>
                    )}
                </div>
                <ChannelHeaderMenu channel={channel} myUid={myUid} />
            </header>
            <MessageList
                messages={messages}
                isLoading={isLoading}
                viewer={viewer}
                names={memberNames}
                baselineReadNo={baselineReadNo}
                onRetry={retryMessage}
                onLoadOlder={() => void loadOlder()}
                hasMore={hasMore}
                isLoadingOlder={isLoadingOlder}
            />
            <Composer disabled={isSending} onSend={handleSend} />
        </>
    );
};
