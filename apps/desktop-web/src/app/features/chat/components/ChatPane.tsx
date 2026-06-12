import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useWebCoreStore } from '@chatic/web-core';
import { useWebSocketV2Store } from '@chatic/socket';

import type { DomainChannel } from '@chatic/data';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import {
    dmCounterpartId,
    displayName,
    isDmChannel,
    isSelfChannel,
    useAuthorNames,
    useChatMutations,
    useChats,
    useReadCursorStore,
    useReadReceipts,
} from '../../../shared';
import type { ChannelMember } from '../../channels';
import { useChannelSettingsStore } from '../../channels';
import { buildMemberNames, buildThreadIndex } from '../utils';
import { useMentionables, useMessageViewer } from '../hooks';
import { useThreadStore } from '../stores';
import { ChannelHeaderMenu } from './ChannelHeaderMenu';
import { Composer } from './Composer';
import { MessageList } from './MessageList';

interface ChatPaneProps {
    channel: DomainChannel | undefined;
    /** Roster for the open channel (lifted to HomePage so it's fetched once). */
    members: ChannelMember[];
    /** Roster still loading — message headers show a name skeleton, not "Unknown". */
    membersLoading?: boolean;
}

export const ChatPane = ({ channel, members, membersLoading }: ChatPaneProps) => {
    const { t } = useTranslation();
    const channelId = channel?.id ?? null;
    const myUid = useWebCoreStore(s => s.profile?.uid ?? null);
    // Identity for naming own/optimistic messages (guest-UUID guard + per-channel
    // cloud id) — shared with the thread panel via useMessageViewer.
    const viewer = useMessageViewer(channel);
    const { messages, isLoading, loadOlder, hasMore, isLoadingOlder } = useChats(channelId);
    const { sendMessage, retryMessage, discardMessage, isSending } = useChatMutations();
    const openSettings = useChannelSettingsStore(s => s.open);
    const openThread = useThreadStore(s => s.open);
    // Threads are hidden from the main feed (ADR 0008): show only top-level
    // messages, but count replies from the full set so a root's "N replies"
    // footer is correct. Replies still arrive in the cache via chat:create.
    const topLevel = useMemo(() => messages.filter(m => !m.parentId), [messages]);
    const threadIndex = useMemo(() => buildThreadIndex(messages), [messages]);
    const isVerified = useWebSocketV2Store(s => s.isVerified);
    const [sendTick, setSendTick] = useState(0);

    // Snapshot the read position when the channel opens, before HomePage's
    // mark-read effect advances the cursor — this is where the "new messages"
    // divider sits. Captured during render so it precedes that post-commit effect.
    const baselineRef = useRef<{ id: string | null; no: number }>({ id: null, no: 0 });
    const serverJoinNo = channel?.$join?.chatNo ?? 0;
    // Subscribe to the cursor (rather than reading getState() in render) so the
    // baseline captures a consistent value; the ref guard below freezes it after
    // the first capture, so the later mark-read advance doesn't move the divider.
    const localCursor = useReadCursorStore(s => (channelId ? (s.cursors[channelId] ?? 0) : 0));
    // Re-capture once the channel's $join arrives (it can land a render after the
    // channelId flips), otherwise the divider would freeze at a stale 0 baseline.
    if (baselineRef.current.id !== channelId || (baselineRef.current.no === 0 && serverJoinNo > 0)) {
        baselineRef.current = { id: channelId, no: Math.max(localCursor, serverJoinNo) };
    }
    const baselineReadNo = baselineRef.current.no;

    // owner$ is often omitted on other users' messages, so resolve author names
    // from the `user` cache keyed by owner id (useAuthorNames) — that paints a
    // previously-seen author instantly, with no roster-reload flicker. The channel
    // roster is only a fallback for members not yet held individually. Until either
    // resolves, the header shows a skeleton (namePending) rather than "Unknown".
    const authorIds = useMemo(() => messages.map(m => m.ownerId), [messages]);
    const cachedNames = useAuthorNames(authorIds);
    const memberNames = useMemo(() => buildMemberNames(members, cachedNames), [members, cachedNames]);

    const mentionables = useMentionables(members);

    // Report read position while this channel is open + the window is focused.
    useReadReceipts(channelId, messages);

    if (!channelId || !channel) {
        return (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-2xl font-semibold text-primary-ink">
                    #
                </div>
                <p className="text-heading text-foreground">{t('chat.empty')}</p>
                <p className="max-w-xs text-caption text-muted-foreground">{t('chat.emptyHint')}</p>
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
    // DM headers carry the other party's name (roster is already loaded here);
    // the self channel reads as "You".
    let headerName = channel.name ?? channelId;
    if (isSelfChannel(channel)) {
        headerName = t('dm.you');
    } else if (isDmChannel(channel)) {
        const counterpart = members.find(m => m.id === dmCounterpartId(channel, viewer.uid, viewer.cloudUid));
        if (counterpart) headerName = displayName(counterpart);
    }

    return (
        <>
            <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-hairline border-b px-4">
                <button
                    type="button"
                    onClick={() => openSettings(channelId)}
                    title={t('chat.header.settings')}
                    className="focus-ring tactile flex min-w-0 items-center gap-2 rounded-md py-1 text-left transition-colors ease-tactile hover:bg-accent"
                >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-heading text-primary-ink">
                        #
                    </span>
                    <span className="truncate text-title text-foreground">{headerName}</span>
                    {desc && <span className="truncate text-caption text-muted-foreground">{desc}</span>}
                    {memberCount > 0 && (
                        <span className="border-hairline shrink-0 border-l pl-2 text-caption tabular-nums text-muted-foreground">
                            {t('channels.settings.memberCount', { count: memberCount })}
                        </span>
                    )}
                </button>
                <div className="flex shrink-0 items-center gap-2">
                    {!isVerified && (
                        <span
                            role="status"
                            className="flex items-center gap-1.5 rounded-full bg-warning/15 px-2 py-0.5 text-caption font-medium text-warning-foreground"
                        >
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-warning motion-reduce:animate-none" />
                            {t('chat.connecting')}
                        </span>
                    )}
                    <ChannelHeaderMenu channel={channel} myUid={myUid} />
                </div>
            </header>
            <MessageList
                key={channelId}
                messages={topLevel}
                isLoading={isLoading}
                viewer={viewer}
                names={memberNames}
                membersLoading={membersLoading}
                baselineReadNo={baselineReadNo}
                onRetry={retryMessage}
                onDiscard={message => void discardMessage(message)}
                onLoadOlder={() => void loadOlder()}
                hasMore={hasMore}
                isLoadingOlder={isLoadingOlder}
                scrollSignal={sendTick}
                threadMeta={threadIndex}
                onOpenThread={openThread}
            />
            <Composer
                disabled={isSending}
                onSend={handleSend}
                channelId={channelId}
                placeholder={t('chat.composer.placeholderChannel', { name: headerName })}
                mentionables={mentionables}
            />
        </>
    );
};
