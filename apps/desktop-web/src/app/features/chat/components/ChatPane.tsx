import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { runtime } from '@chatic/app-runtime';
import { placeScopeKey, usePinnedChannels } from '@chatic/shared';

import { Hash, PanelLeft, Plus, Search, Star, Ticket, User } from 'lucide-react';

import type { DomainChannel, DomainChat } from '@chatic/data';
import { cn } from '@chatic/lib/utils';
import { Button } from '@chatic/ui-kit/components/ui/button';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import {
    Hint,
    MOD_KEY,
    dmCounterpartId,
    displayName,
    isDmChannel,
    isSelfChannel,
    lastChatNoOf,
    useAuthorNames,
    useChatMutations,
    useChats,
    useMessageJumpStore,
    useOpenAtBottomStore,
    useReadCursorStore,
    useReadReceipts,
    PANE_HEADER,
    PANE_TITLE,
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
import { useShellSidebar } from './DesktopLayout';
import { JumpReturnBar } from './JumpReturnBar';
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
    /**
     * Where a jump brought the reader from, and how to go back. Supplied by the
     * host, which owns both the channel list (for the name) and the jump itself.
     */
    jumpReturn?: { originName: string; onReturn: () => void; onDismiss: () => void };
    /**
     * What the pane offers with no channel open. `pick` when the sidebar has
     * channels, `create` when this place has none, `join` on the Default Cloud,
     * which cannot create channels: there the only next step is an invite.
     */
    emptyState?: { mode: 'pick' | 'create' | 'join'; onAction?: () => void };
}

export const ChatPane = ({
    channel,
    members,
    membersLoading,
    readCountOf,
    jumpReturn,
    emptyState = { mode: 'pick' },
}: ChatPaneProps) => {
    const { t } = useTranslation();
    const channelId = channel?.id ?? null;
    const shell = useShellSidebar();
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
    // Favorites live on the shared `ui.pinnedChannels` record (the same one apps/web writes),
    // scoped to the active place. A null scope (cloud/place not settled) leaves the star a no-op
    // instead of writing a half-formed key.
    const { selectedCloudId, selectedSiteId } = runtime.session.useSessionSelection();
    const pinScope = placeScopeKey(selectedCloudId, selectedSiteId);
    const { pinnedIds, toggle: togglePinned } = usePinnedChannels(pinScope);
    const isFavorite = channelId ? pinnedIds.includes(channelId) : false;
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
                <p className="text-heading text-foreground">{t(`chat.empty.${emptyState.mode}.title`)}</p>
                <p className="max-w-xs text-caption text-muted-foreground">
                    {t(`chat.empty.${emptyState.mode}.hint`, { mod: MOD_KEY })}
                </p>
                {emptyState.mode !== 'pick' && emptyState.onAction && (
                    <Button className="focus-ring tactile mt-1 transition-colors" onClick={emptyState.onAction}>
                        {emptyState.mode === 'create' ? (
                            <Plus size={16} aria-hidden />
                        ) : (
                            <Ticket size={16} aria-hidden />
                        )}
                        {t(`chat.empty.${emptyState.mode}.action`)}
                    </Button>
                )}
                {/* A drawer hides the list this copy points at. */}
                {emptyState.mode === 'pick' && shell.isDrawer && (
                    <Button
                        variant="outline"
                        className="focus-ring tactile mt-1 transition-colors"
                        onClick={shell.open}
                    >
                        <PanelLeft size={16} aria-hidden />
                        {t('sidebar.show')}
                    </Button>
                )}
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
            isEmpty={messages.length === 0}
            onToggleFavorite={() => channelId && togglePinned(channelId)}
            onOpenSettings={introKind === 'channel' ? () => openSettings(channelId) : undefined}
        />
    );

    return (
        <>
            <header className={`${PANE_HEADER} px-6`}>
                {/* The chat screen had no h1 — its top heading was the sidebar's h2. The
                    open channel is what this screen is about, so it names the page. */}
                <h1 className="sr-only">{headerName}</h1>
                <div className="flex min-w-0 items-center gap-3.5">
                    {/* Only reachable route to the channel list once the sidebar is a
                        drawer; absent from the docked layout, where it would do nothing. */}
                    {shell.isDrawer && (
                        <Hint label={t('sidebar.show')}>
                            <button
                                type="button"
                                onClick={shell.open}
                                aria-label={t('sidebar.show')}
                                aria-expanded={shell.isOpen}
                                className={HEADER_ICON_BUTTON}
                            >
                                <PanelLeft size={16} aria-hidden />
                            </button>
                        </Hint>
                    )}
                    <Hint label={desc ? `${t('chat.header.settings')} — ${desc}` : t('chat.header.settings')}>
                        <button
                            type="button"
                            onClick={() => openSettings(channelId)}
                            className="focus-ring tactile flex min-w-0 items-center gap-1 rounded-md text-left"
                        >
                            {!isDmChannel(channel) && !isSelfChannel(channel) && (
                                <Hash size={16} aria-hidden className="shrink-0 text-foreground" />
                            )}
                            <span className={`${PANE_TITLE} hover:underline`}>{headerName}</span>
                        </button>
                    </Hint>
                    {memberCount > 0 && (
                        <button
                            type="button"
                            onClick={() => openSettings(channelId)}
                            aria-label={t('channels.settings.memberCount', { count: memberCount })}
                            className="focus-ring hit-target flex shrink-0 items-center gap-1 rounded-md bg-muted px-1.5 py-1 text-caption tabular-nums text-label transition-colors hover:bg-accent"
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
                            onClick={() => channelId && togglePinned(channelId)}
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
            {jumpReturn && (
                <JumpReturnBar
                    originName={jumpReturn.originName}
                    onReturn={jumpReturn.onReturn}
                    onDismiss={jumpReturn.onDismiss}
                />
            )}
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
