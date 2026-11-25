import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { runtime, RELAY_CLOUD_ID } from '@chatic/runtime-react';
import { placeScopeKey, usePinnedChannels } from '@chatic/shared';

import { Hash, PanelLeft, Plus, Search, Star, Ticket, User } from 'lucide-react';
import type { ChatMentionBody, DomainChannel, DomainChat } from '@chatic/runtime-react';
import { cn, Button } from '@chatic/ui-kit';

import {
    Hint,
    MOD_KEY,
    channelKind,
    dmCounterpartId,
    displayName,
    isDmChannel,
    isSelfChannel,
    lastChatNoOf,
    MobileAppPointer,
    resolveDisplay,
    useAuthorNames,
    useChannelLabels,
    useChats,
    useComposerFocusStore,
    useMessageJumpStore,
    useOpenAtBottomStore,
    useChannelReadCounts,
    useReadCursorStore,
    useReadReceipts,
    useSelectedChannelStore,
    useSiteProfileMap,
    PANE_HEADER,
    PANE_TITLE,
} from '../../../shared';
import type { ChannelMember } from '../../channels';
import { useChannelActions, useChannelSettingsStore } from '../../channels';
import { useSearchDialogStore } from '../../search';
import { buildMemberNames, buildThreadIndex, foldReactions, isFeedVisible } from '../utils';
import {
    useComposerSend,
    useFileDrop,
    useImageAttachments,
    useMentionables,
    useMessageViewer,
    useNewReplyRule,
} from '../hooks';
import { useThreadStore } from '../stores';
import { ChannelHeaderMenu } from './ChannelHeaderMenu';
import { ChannelIntro } from './ChannelIntro';
import { useShellSidebar } from './DesktopLayout';
import { JumpReturnBar } from './JumpReturnBar';
import { MessageList } from './MessageList';
import { HEADER_ICON_BUTTON } from './headerStyles';
import { AttachmentDropOverlay } from './images';
import { LazyComposer } from './LazyComposer';

interface ChatPaneProps {
    channel: DomainChannel | undefined;
    members: ChannelMember[];
    membersLoading?: boolean;
    jumpReturn?: { originName?: string; onReturn: () => void; onDismiss: () => void };
    emptyState?: { mode: 'pick' | 'create' | 'join' | 'inbox'; onAction?: () => void };
}

export const ChatPane = ({
    channel,
    members,
    membersLoading,
    jumpReturn,
    emptyState = { mode: 'pick' },
}: ChatPaneProps) => {
    const { t } = useTranslation();
    const channelId = channel?.id ?? null;
    const shell = useShellSidebar();
    const myUid = runtime.session.useSessionIdentity().userId;
    const viewer = useMessageViewer(channel);
    const placeProfiles = useSiteProfileMap();
    const { messages, isLoading, loadFailed, retryLoad, loadOlder, loadOlderFailed, hasMore, isLoadingOlder } =
        useChats(channelId, channel ? lastChatNoOf(channel) : undefined);
    const handleLoadOlder = useCallback(() => void loadOlder(), [loadOlder]);
    const openSettings = useChannelSettingsStore(s => s.open);
    const clearIfOpen = useSelectedChannelStore(s => s.clearIfOpen);
    const channelActions = useChannelActions(channelId, { onRemoved: () => clearIfOpen(channelId) });
    const openSearch = useSearchDialogStore(s => s.setOpen);
    const { selectedCloudId, selectedSiteId } = runtime.session.useSessionSelection();
    const pinScope = placeScopeKey(selectedCloudId, selectedSiteId);
    const { pinnedIds, toggle: togglePinned } = usePinnedChannels(pinScope);
    const isFavorite = channelId ? pinnedIds.includes(channelId) : false;
    const openThreadIn = useThreadStore(s => s.open);
    const openThread = useCallback(
        (rootId: string) => {
            if (channelId) openThreadIn(rootId, channelId);
        },
        [openThreadIn, channelId]
    );
    const labeled = useMemo(() => (channel ? [channel] : []), [channel]);
    const labelOf = useChannelLabels(labeled);
    const jumpRequest = useMessageJumpStore(s => s.target);
    const clearJump = useMessageJumpStore(s => s.clear);
    const jumpTarget = useMemo(
        () =>
            jumpRequest && jumpRequest.channelId === channelId
                ? { chatNo: jumpRequest.chatNo, nonce: jumpRequest.nonce, restore: jumpRequest.restore }
                : undefined,
        [jumpRequest, channelId]
    );
    const requestJump = useMessageJumpStore(s => s.request);
    const showMessage = useCallback(
        (message: DomainChat) => {
            if (channelId && typeof message.chatNo === 'number') requestJump(channelId, message.chatNo);
        },
        [requestJump, channelId]
    );
    const setReadingPosition = useMessageJumpStore(s => s.setPosition);
    const reportPosition = useCallback(
        (chatNo: number | null) => {
            if (channelId) setReadingPosition({ channelId, chatNo });
        },
        [channelId, setReadingPosition]
    );
    const topLevel = useMemo(() => messages.filter(isFeedVisible), [messages]);
    const reactions = useMemo(() => foldReactions(messages, viewer), [messages, viewer]);
    const [sendTick, setSendTick] = useState(0);

    const baselineRef = useRef<{ id: string | null; no: number }>({ id: null, no: 0 });
    const serverJoinNo = channel?.$join?.chatNo ?? 0;
    const localCursor = useReadCursorStore(s => (channelId ? (s.cursors[channelId] ?? 0) : 0));
    if (baselineRef.current.id !== channelId || (baselineRef.current.no === 0 && serverJoinNo > 0)) {
        baselineRef.current = { id: channelId, no: Math.max(localCursor, serverJoinNo) };
    }
    const baselineReadNo = baselineRef.current.no;
    const newReplyRule = useNewReplyRule(channelId, messages, baselineReadNo, viewer);
    const threadIndex = useMemo(() => buildThreadIndex(messages, newReplyRule), [messages, newReplyRule]);

    const authorIds = useMemo(() => messages.map(m => m.ownerId), [messages]);
    const cachedNames = useAuthorNames(authorIds);
    const memberNames = useMemo(() => buildMemberNames(members, cachedNames), [members, cachedNames]);

    const mentionables = useMentionables(members, viewer, channel);

    const tray = useImageAttachments(channelId ?? '');
    const { isDragging, dropHandlers } = useFileDrop(tray.addFiles);
    const composer = useComposerSend({
        cid: channel ? channel.cid || RELAY_CLOUD_ID : '',
        channelId: channel ? (channelId ?? '') : '',
    });

    useReadReceipts(channelId, messages, channel ? channel.cid || RELAY_CLOUD_ID : '');
    const { readCountOf, cursors: readCursors } = useChannelReadCounts(channel);

    const openAtBottom = useOpenAtBottomStore(s => s.channelId === channelId && !!channelId);
    const clearOpenAtBottom = useOpenAtBottomStore(s => s.clear);
    useEffect(() => {
        if (openAtBottom) clearOpenAtBottom();
    }, [openAtBottom, clearOpenAtBottom]);

    const focusRemovedId = useComposerFocusStore(s => s.removedId);
    const consumeComposerFocus = useComposerFocusStore(s => s.consume);
    const hasRoom = !!channelId && !!channel;
    const refocusComposer = focusRemovedId !== null && hasRoom && channelId !== focusRemovedId;
    const refocusEmptyState = focusRemovedId !== null && !hasRoom && emptyState.mode !== 'pick';
    const emptyActionRef = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        if (refocusEmptyState) emptyActionRef.current?.focus();
        if (refocusComposer || refocusEmptyState) consumeComposerFocus();
    }, [refocusComposer, refocusEmptyState, consumeComposerFocus]);

    if (!hasRoom) {
        return (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-display font-semibold text-label">
                    #
                </div>
                <p className="text-heading text-foreground">{t(`chat.empty.${emptyState.mode}.title`)}</p>
                <p className="max-w-xs text-caption text-muted-foreground">
                    {t(`chat.empty.${emptyState.mode}.hint`, { mod: MOD_KEY })}
                </p>
                {emptyState.mode !== 'pick' && emptyState.onAction && (
                    <Button
                        ref={emptyActionRef}
                        className="focus-ring tactile mt-1 transition-colors"
                        onClick={emptyState.onAction}
                    >
                        {emptyState.mode === 'create' ? (
                            <Plus size={16} aria-hidden />
                        ) : (
                            <Ticket size={16} aria-hidden />
                        )}
                        {t(`chat.empty.${emptyState.mode}.action`)}
                    </Button>
                )}
                {emptyState.mode === 'join' && <MobileAppPointer className="mt-2 max-w-xs" />}
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

    const handleSend = (content: string, files: File[], mention?: ChatMentionBody) => {
        setSendTick(tick => tick + 1);
        if (mention) composer.send(content, files, mention);
        else composer.send(content, files);
        tray.clear();
    };

    const memberCount = channel.memberIds?.length ?? channel.memberNo ?? 0;
    const desc = channel.desc?.trim();
    const introKind = channelKind(channel);
    let headerName = labelOf(channel);
    let dmAvatar: string | undefined;
    const counterpartId = isDmChannel(channel) ? dmCounterpartId(channel, viewer.uid, viewer.cloudUid) : undefined;
    if (introKind === 'dm') {
        const counterpart = members.find(m => m.id === counterpartId);
        const display = resolveDisplay(
            counterpartId ? placeProfiles[counterpartId] : undefined,
            counterpart ? displayName(counterpart) : headerName,
            counterpart?.thumbnail
        );
        headerName = display.name;
        dmAvatar = display.thumbnail;
    }
    const composerPlaceholder =
        introKind === 'self'
            ? t('chat.composer.placeholderSelf')
            : introKind === 'dm'
              ? t('chat.composer.placeholderDm', { name: headerName })
              : t('chat.composer.placeholderChannel', { name: headerName });
    const intro = (
        <ChannelIntro
            kind={introKind}
            name={headerName}
            avatar={dmAvatar}
            description={introKind === 'channel' ? desc : undefined}
            colorSeed={counterpartId ?? undefined}
            isFavorite={isFavorite}
            isEmpty={messages.length === 0}
            onToggleFavorite={() => channelId && togglePinned(channelId)}
            onOpenSettings={introKind === 'channel' ? () => openSettings(channelId) : undefined}
            onAddMembers={introKind === 'channel' ? () => channelActions.openDialog('add-members') : undefined}
        />
    );

    return (
        <>
            <header className={`${PANE_HEADER} px-6`}>
                <h1 className="sr-only">{headerName}</h1>
                <div className="flex min-w-0 items-center gap-3.5">
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
                            onClick={() => openSettings(channelId, 'members')}
                            aria-label={t('channels.settings.memberCount', { count: memberCount })}
                            className="focus-ring hit-target flex shrink-0 items-center gap-1 rounded-md bg-muted px-1.5 py-1 text-caption tabular-nums text-label transition-colors hover:bg-accent"
                        >
                            <User size={16} aria-hidden />
                            {memberCount}
                        </button>
                    )}
                </div>
                <div className="flex shrink-0 items-center gap-4">
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
                    <ChannelHeaderMenu channel={channel} myUid={myUid} actions={channelActions} />
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
                    mentionables={mentionables}
                    membersLoading={membersLoading}
                    baselineReadNo={baselineReadNo}
                    readCountOf={readCountOf}
                    readCursors={readCursors}
                    onRetry={composer.retry}
                    canRetry={composer.canRetry}
                    onDiscard={composer.discard}
                    onCancelUpload={composer.cancelUpload}
                    onLoadOlder={handleLoadOlder}
                    hasMore={hasMore}
                    isLoadingOlder={isLoadingOlder}
                    loadOlderFailed={loadOlderFailed}
                    scrollSignal={sendTick}
                    openAtBottom={openAtBottom}
                    threadMeta={threadIndex}
                    onOpenThread={openThread}
                    onShowMessage={showMessage}
                    jumpTarget={jumpTarget}
                    onJumpConsumed={clearJump}
                    onReadingPosition={reportPosition}
                    intro={intro}
                    loadFailed={loadFailed}
                    onRetryLoad={retryLoad}
                />
                <LazyComposer
                    onSend={handleSend}
                    channelId={channelId}
                    placeholder={composerPlaceholder}
                    mentionables={mentionables}
                    attachments={tray.attachments}
                    onAddFiles={tray.addFiles}
                    onRemoveAttachment={tray.remove}
                    capturesTyping
                    autoFocus={refocusComposer}
                />
                {isDragging && <AttachmentDropOverlay />}
            </div>
        </>
    );
};
