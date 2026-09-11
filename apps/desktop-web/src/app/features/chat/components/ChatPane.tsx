import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { runtime } from '@chatic/app-runtime';

import { Hash, Search, Star, User } from 'lucide-react';

import type { DomainChannel, DomainChat } from '@chatic/data';
import { cn } from '@chatic/lib/utils';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import {
    Hint,
    dmCounterpartId,
    displayName,
    isDmChannel,
    isSelfChannel,
    lastChatNoOf,
    useAuthorNames,
    useChatMutations,
    useChats,
    useFavoriteChannelsStore,
    useMessageJumpStore,
    useOpenAtBottomStore,
    useReadCursorStore,
    useReadReceipts,
} from '../../../shared';
import type { ChannelMember } from '../../channels';
import { useChannelSettingsStore } from '../../channels';
import { useSearchDialogStore } from '../../search';
import { buildMemberNames, buildThreadIndex, foldReactions, isFeedVisible } from '../utils';
import { useFileDrop, useImageAttachments, useMentionables, useMessageViewer, type ReadCountOf } from '../hooks';
import { useThreadStore } from '../stores';
import { ChannelHeaderMenu } from './ChannelHeaderMenu';
import { ChannelIntro } from './ChannelIntro';
import { Composer } from './Composer';
import { MessageList } from './MessageList';
import { HEADER_ICON_BUTTON } from './headerStyles';
import { AttachmentDropOverlay, AttachmentNoticeDialog } from './images';

interface ChatPaneProps {
    channel: DomainChannel | undefined;
    /** Roster for the open channel (lifted to HomePage so it's fetched once). */
    members: ChannelMember[];
    /** Roster still loading — message headers show a name skeleton, not "Unknown". */
    membersLoading?: boolean;
    /** Per-message read counts, from the one `useReadCounts` the host mounts per channel. */
    readCountOf?: ReadCountOf;
}

export const ChatPane = ({ channel, members, membersLoading, readCountOf }: ChatPaneProps) => {
    const { t } = useTranslation();
    const channelId = channel?.id ?? null;
    const myUid = runtime.session.useSessionIdentity().userId;
    // Identity for naming own/optimistic messages (guest-UUID guard + per-channel
    // cloud id) — shared with the thread panel via useMessageViewer.
    const viewer = useMessageViewer(channel);
    // The channel record's newest chatNo drives the feed's freshness bridge (see useChats).
    const { messages, isLoading, loadOlder, hasMore, isLoadingOlder } = useChats(
        channelId,
        channel ? lastChatNoOf(channel) : undefined
    );
    const { sendMessage, retryMessage, discardMessage } = useChatMutations();
    // Stable identities: MessageRow is memo'd, and an inline closure here would
    // re-render every visible row on each ChatPane render.
    const handleDiscard = useCallback((message: DomainChat) => void discardMessage(message), [discardMessage]);
    const handleLoadOlder = useCallback(() => void loadOlder(), [loadOlder]);
    const openSettings = useChannelSettingsStore(s => s.open);
    const openSearch = useSearchDialogStore(s => s.setOpen);
    const isFavorite = useFavoriteChannelsStore(s => (channelId ? !!s.ids[channelId] : false));
    const toggleFavorite = useFavoriteChannelsStore(s => s.toggle);
    const openThread = useThreadStore(s => s.open);
    // Saved-item / search jump: forward a target to MessageList only when it
    // belongs to the open channel; clear it once the list has consumed it.
    const jumpRequest = useMessageJumpStore(s => s.target);
    const clearJump = useMessageJumpStore(s => s.clear);
    const jumpTarget = useMemo(
        () =>
            jumpRequest && jumpRequest.channelId === channelId
                ? { chatNo: jumpRequest.chatNo, nonce: jumpRequest.nonce }
                : undefined,
        [jumpRequest, channelId]
    );
    // Thread replies belong to the panel (ADR 0008) and reaction events are chips, not
    // rows — `isFeedVisible` owns both rules. Deleted messages stay and render as a
    // tombstone, so the filter no longer needs the thread index to decide.
    // Reply counts come from the full set so a root's "N replies" footer is correct;
    // replies keep arriving in the cache via chat:create.
    const threadIndex = useMemo(() => buildThreadIndex(messages), [messages]);
    const topLevel = useMemo(() => messages.filter(isFeedVisible), [messages]);
    // Reactions fold from the UNFILTERED list on purpose: `isFeedVisible` removes exactly
    // the events this reads, so folding `topLevel` would always come back empty.
    const reactions = useMemo(() => foldReactions(messages, myUid), [messages, myUid]);
    const { isVerified } = runtime.connection.useRuntimeSocketState();
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

    // The image tray belongs to the open channel: switching channels drops it (and its
    // object URLs) the way a thread switch does in ThreadPanel.
    const tray = useImageAttachments(channelId ?? '');
    const { isDragging, dropHandlers } = useFileDrop(tray.addFiles);

    // Report read position while this channel is open + the window is focused.
    useReadReceipts(channelId, messages);

    // A notification click asks this channel to open at its latest message (the pinged
    // one) rather than the unread divider. Read the one-shot flag for THIS channel and
    // clear it once consumed so a later plain open keeps the divider behaviour.
    const openAtBottom = useOpenAtBottomStore(s => s.channelId === channelId && !!channelId);
    const clearOpenAtBottom = useOpenAtBottomStore(s => s.clear);
    useEffect(() => {
        if (openAtBottom) clearOpenAtBottom();
    }, [openAtBottom, clearOpenAtBottom]);

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

    // memberNo is deprecated server-side (back-filled from memberIds for compat) —
    // count the ids directly and keep memberNo as the last resort.
    const memberCount = channel.memberIds?.length ?? channel.memberNo ?? 0;
    const desc = channel.desc?.trim();
    // DM headers carry the other party's name (roster is already loaded here);
    // the self channel reads as "You".
    let headerName = channel.name ?? channelId;
    const counterpartId = isDmChannel(channel) ? dmCounterpartId(channel, viewer.uid, viewer.cloudUid) : undefined;
    if (isSelfChannel(channel)) {
        headerName = t('dm.you');
    } else if (isDmChannel(channel)) {
        const counterpart = members.find(m => m.id === counterpartId);
        if (counterpart) headerName = displayName(counterpart);
    }
    const introKind = isSelfChannel(channel) ? 'self' : isDmChannel(channel) ? 'dm' : 'channel';
    const intro = (
        <ChannelIntro
            kind={introKind}
            name={headerName}
            description={introKind === 'channel' ? desc : undefined}
            colorSeed={counterpartId ?? undefined}
            isFavorite={isFavorite}
            onToggleFavorite={() => toggleFavorite(channelId)}
            onOpenSettings={introKind === 'channel' ? () => openSettings(channelId) : undefined}
        />
    );

    return (
        <>
            <header className="flex h-[68px] shrink-0 items-center justify-between gap-2 border-b border-hairline px-6 py-2">
                <div className="flex min-w-0 items-center gap-3.5">
                    <Hint label={desc ? `${t('chat.header.settings')} — ${desc}` : t('chat.header.settings')}>
                        <button
                            type="button"
                            onClick={() => openSettings(channelId)}
                            className="focus-ring tactile flex min-w-0 items-center gap-1 rounded-md text-left"
                        >
                            {!isDmChannel(channel) && !isSelfChannel(channel) && (
                                <Hash size={16} aria-hidden className="shrink-0 text-foreground" />
                            )}
                            <span className="truncate text-[18px] font-semibold tracking-[-0.01em] text-foreground hover:underline">
                                {headerName}
                            </span>
                        </button>
                    </Hint>
                    {memberCount > 0 && (
                        <button
                            type="button"
                            onClick={() => openSettings(channelId)}
                            aria-label={t('channels.settings.memberCount', { count: memberCount })}
                            className="focus-ring flex shrink-0 items-center gap-1 rounded-md bg-muted px-1.5 py-1 text-[13px] tabular-nums tracking-[-0.01em] text-label transition-colors hover:bg-accent"
                        >
                            <User size={16} aria-hidden />
                            {memberCount}
                        </button>
                    )}
                </div>
                <div className="flex shrink-0 items-center gap-4">
                    {!isVerified && (
                        <span
                            role="status"
                            className="flex items-center gap-1.5 rounded-full bg-warning/15 px-2 py-0.5 text-caption font-medium text-warning-foreground"
                        >
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-warning motion-reduce:animate-none" />
                            {t('chat.connecting')}
                        </span>
                    )}
                    <Hint label={t(isFavorite ? 'chat.header.unfavorite' : 'chat.header.favorite')}>
                        <button
                            type="button"
                            onClick={() => toggleFavorite(channelId)}
                            aria-pressed={isFavorite}
                            aria-label={t(isFavorite ? 'chat.header.unfavorite' : 'chat.header.favorite')}
                            className={HEADER_ICON_BUTTON}
                        >
                            <Star size={18} aria-hidden className={cn(isFavorite && 'fill-favorite text-favorite')} />
                        </button>
                    </Hint>
                    <Hint label={t('chat.header.search')}>
                        <button
                            type="button"
                            onClick={() => openSearch(true)}
                            aria-label={t('chat.header.search')}
                            className={HEADER_ICON_BUTTON}
                        >
                            <Search size={18} aria-hidden />
                        </button>
                    </Hint>
                    <ChannelHeaderMenu channel={channel} myUid={myUid} />
                </div>
            </header>
            <div className="relative flex min-h-0 flex-1 flex-col" {...dropHandlers}>
                <MessageList
                    key={channelId}
                    messages={topLevel}
                    reactions={reactions}
                    isLoading={isLoading}
                    viewer={viewer}
                    names={memberNames}
                    membersLoading={membersLoading}
                    baselineReadNo={baselineReadNo}
                    onRetry={retryMessage}
                    onDiscard={handleDiscard}
                    onLoadOlder={handleLoadOlder}
                    hasMore={hasMore}
                    isLoadingOlder={isLoadingOlder}
                    scrollSignal={sendTick}
                    openAtBottom={openAtBottom}
                    threadMeta={threadIndex}
                    onOpenThread={openThread}
                    jumpTarget={jumpTarget}
                    onJumpConsumed={clearJump}
                    readCountOf={readCountOf}
                    intro={intro}
                />
                <Composer
                    onSend={handleSend}
                    channelId={channelId}
                    placeholder={t('chat.composer.placeholderChannel', { name: headerName })}
                    mentionables={mentionables}
                    attachments={tray.attachments}
                    onAddFiles={tray.addFiles}
                    onRemoveAttachment={tray.remove}
                    capturesTyping
                />
                {isDragging && <AttachmentDropOverlay />}
            </div>
            <AttachmentNoticeDialog notice={tray.notice} onDismiss={tray.dismissNotice} />
        </>
    );
};
