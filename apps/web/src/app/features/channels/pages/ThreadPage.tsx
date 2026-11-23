import { RoomMiniPlayer } from '../components/RoomMiniPlayer';
import { useRoomAudioSurface } from '../hooks/useRoomAudioSurface';
import { hiddenPartsOf } from '../lib/localMediaPrefs';
import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useParams, useSearchParams } from 'react-router-dom';

import { logger } from '@chatic/bridges';
import { useNavigateWithTransition } from '@chatic/shared';
import { runtime, canModifyMessage, isInJoinWindow } from '@chatic/runtime';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';
import {
    ChatRoomHeader,
    ComposerLockButton,
    DefaultAvatar,
    ImageAvatar,
    MessageInput,
    type MessageInputProps,
} from '@chatic/web-ui-kit';

import { ChannelMessageRow, type MessageSender } from '../components/ChannelMessageRow';
import { ComposerEditBar } from '../components/ComposerEditBar';
import { GapDivider } from '../components/GapDivider';
import { useChatImageAttach } from '../components/ChatImageAttach';
import { COMPOSER_PADDING_BOTTOM } from '../hooks/useAttachPanelSlot';
import { useVoiceMessage } from '../hooks/useVoiceMessage';
import { chatGapKey, type ChatGap, type ChatGapSide } from '../hooks/useChats';
import { useComposerDraft } from '../hooks/useComposerDraft';
import { useMentionComposer } from '../hooks/useMentionComposer';
import { MentionSuggestions } from '../components/MentionSuggestions';
import { mentionMarksFor, mentionViewerOf } from '../utils/mentionHighlight';
import { buildMentionCandidates } from '../utils/mentionInput';
import { useSendImages } from '../hooks/useSendImages';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ReactionChips } from '../components/ReactionChips';
import { MessageText } from '../components/MessageText';
import { MessageImages } from '../components/MessageImages';
import { MessageActionSheet } from '../components/MessageActionSheet';
import { MemberProfileDialog } from '../components/MemberProfileDialog';
import { MessageDetailDialog } from '../components/MessageDetailDialog';
import { ReactionDetailSheet } from '../components/ReactionDetailSheet';
import { EmojiPickerSheet } from '../components/EmojiPickerSheet';
import {
    useChannel,
    useChannelJoins,
    useChannelMembers,
    useChannelProfiles,
    useChatInputLock,
    useChatMutations,
    useMessageEditing,
    useMessageJump,
    useChats,
    useReactions,
    useStartDm,
} from '../hooks';
import { canStartDmFromProfile, channelKindOf, isRoomOwner, profilePlaceOf } from '../lib';
import type { ClientChatView, DomainChat } from '../types';
import { copyMessageToClipboard } from '../utils/copyMessageToClipboard';
import { canOpenMessageActions, hasMessageText } from '../utils/messageActions';
import { chatPlainText, deleteConfirmQuote } from '../utils/messagePlainText';
import { isSendKey } from '../utils/composerEnter';
import { resolveChatOwnerName, resolveUserName, type DisplayNameSources } from '../utils/displayName';
import { buildThread } from '../utils/buildThread';
import { foldReactions, hasMyReaction } from '../utils/foldReactions';
import { useRecentEmojiStore } from '../stores/useRecentEmojiStore';
import { useBottomChromeToastLift } from '../../../ui/hooks/useBottomChromeToastLift';
import { useChromeInsets } from '../../../ui/hooks/useChromeInsets';
import { useMessageJumpStore } from '../../../stores/useMessageJumpStore';
import { toCloudId, useSelectedCloudId } from '../../../hooks/useCloudScope';
import { useNotificationStore } from '../../../stores/useNotificationStore';
import { threadRootNo } from '../../../utils/notifications';
import { useDebugRoomMirror } from '../../debug';

const MAX_INPUT_LENGTH = 5000;

const LIST_COMPOSER_GAP = 16;

const FOLLOW_RESUME_PX = 80;

const THREAD_GAP_AUTO_PAGES = 4;

const clearComposer = (list: HTMLElement | null, height: number) => {
    if (!list) return;
    list.style.paddingBottom = `${height + LIST_COMPOSER_GAP}px`;
    list.scrollTo({ top: list.scrollHeight });
};

export const ThreadPage = () => {
    const navigate = useNavigateWithTransition();
    const { t } = useTranslation();
    const { channelId, rootNo } = useParams<{ channelId: string; rootNo: string }>();
    const seededRoot = (useLocation().state as { rootChat?: DomainChat } | null)?.rootChat;
    const stableChannelId = channelId || 'default';
    const draftScope = `${stableChannelId}#${rootNo ?? ''}`;

    const notifyCloudId = useSelectedCloudId();
    const unreadThreadItems = useNotificationStore(state =>
        rootNo
            ? Object.values(state.items).filter(
                  item =>
                      !item.read &&
                      item.cloudId === notifyCloudId &&
                      item.channelId === stableChannelId &&
                      !!item.parentId &&
                      threadRootNo(item.parentId) === rootNo
              ).length
            : 0
    );
    useEffect(() => {
        if (!rootNo || unreadThreadItems === 0) return;
        useNotificationStore.getState().markThreadRead(notifyCloudId, stableChannelId, rootNo);
    }, [notifyCloudId, stableChannelId, rootNo, unreadThreadItems]);

    const [content, setContent] = useComposerDraft(draftScope);
    const [actionMessage, setActionMessage] = useState<ClientChatView | null>(null);
    const [expandedMessage, setExpandedMessage] = useState<{ content: string } | null>(null);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [reactorTarget, setReactorTarget] = useState<{ messageId: string; key: string } | null>(null);
    const [isCopying, setIsCopying] = useState(false);
    const [profileTarget, setProfileTarget] = useState<MessageSender | null>(null);
    const [profileOpen, setProfileOpen] = useState(false);

    const inputRef = useRef<HTMLTextAreaElement>(null);
    const restoreCaptionPicksRef = useRef<(() => void) | null>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const {
        headerRef,
        footerRef: composerRef,
        headerHeight,
        footerHeight: composerHeight,
        followFooter: followComposer,
    } = useChromeInsets();
    useBottomChromeToastLift(composerHeight);

    const { selectedCloudId, selectedSiteId } = runtime.session.useSessionSelection();
    const { channel } = useChannel(channelId || null);
    const threadCid = toCloudId(channel?.cid || selectedCloudId);
    const userId = runtime.session.useUidInCloud(threadCid);
    const { startDm, isAvailable: canStartDm } = useStartDm();
    const { joins, myJoin, activeMemberIds } = useChannelJoins(channelId || null);
    const { members } = useChannelMembers({
        channelId: stableChannelId,
        detail: true,
        memberIds: channel?.memberIds,
        joins,
    });
    const { profileMap } = useChannelProfiles(profilePlaceOf(channel, selectedSiteId), activeMemberIds);

    const chatParams = useMemo(
        () => ({
            channelId: stableChannelId,
            limit: 100,
            joinedNo: myJoin?.joinedNo,
            channelChatNo: channel?.id === stableChannelId ? channel.chatNo : undefined,
        }),
        [stableChannelId, myJoin?.joinedNo, channel?.id, channel?.chatNo]
    );
    const {
        rawChats,
        isLoading,
        hasMore,
        isLoadingMore,
        loadMore,
        canLoadMore,
        loadUntil,
        fetchThrough,
        isFetched,
        gaps,
        gapStatus,
        fillGap,
    } = useChats(chatParams);

    const { hiddenMedia } = useRoomAudioSurface({
        cid: threadCid,
        uid: userId ?? undefined,
        channelId: stableChannelId,
        messages: rawChats,
    });

    const rootOutsideJoinWindow = useMemo(() => {
        const parsed = Number(rootNo);
        if (!Number.isInteger(parsed) || parsed <= 0) return false;
        return !isInJoinWindow({ chatNo: parsed }, myJoin?.joinedNo);
    }, [rootNo, myJoin?.joinedNo]);
    const { sendMessage } = useChatMutations();
    const editing = useMessageEditing(`${stableChannelId}/${rootNo ?? ''}`);
    const inputLock = useChatInputLock(channelId);
    const unlockInput = useCallback(() => {
        inputLock.setLocked(false);
        toast({ title: t('chat.inputLock.unlocked') });
    }, [inputLock.setLocked, t]);
    const { toggleReaction, failedId } = useReactions();
    const remember = useRecentEmojiStore(s => s.remember);

    const thread = useMemo(() => buildThread(rawChats, rootNo ?? ''), [rawChats, rootNo]);
    const hasRoot = !!thread.root;

    const rootNumber = Number(rootNo);
    const rootUnfetched =
        !hasRoot && !rootOutsideJoinWindow && Number.isInteger(rootNumber) && rootNumber > 0 && !isFetched(rootNumber);
    const [isFetchingRoot, setIsFetchingRoot] = useState(false);
    const askedRootRef = useRef<number | null>(null);
    const fetchRootPage = useCallback(() => {
        setIsFetchingRoot(true);
        fetchThrough(rootNumber)
            .catch(() => undefined)
            .finally(() => setIsFetchingRoot(false));
    }, [fetchThrough, rootNumber]);
    useEffect(() => {
        if (hasRoot || rootOutsideJoinWindow) return;
        if (!Number.isInteger(rootNumber) || rootNumber <= 0) return;
        if (loadUntil(rootNumber) || isLoading || !rootUnfetched || !canLoadMore) return;
        if (askedRootRef.current === rootNumber) return;
        askedRootRef.current = rootNumber;
        fetchRootPage();
    }, [
        hasRoot,
        rootNumber,
        rootOutsideJoinWindow,
        loadUntil,
        rawChats,
        isLoading,
        rootUnfetched,
        canLoadMore,
        fetchRootPage,
    ]);

    const [searchParams, setSearchParams] = useSearchParams();
    const followHeldRef = useRef(false);
    const [autoGapPagesLeft, setAutoGapPagesLeft] = useState(THREAD_GAP_AUTO_PAGES);
    useEffect(() => {
        followHeldRef.current = false;
        setAutoGapPagesLeft(THREAD_GAP_AUTO_PAGES);
    }, [rootNo]);
    useEffect(() => {
        const raw = searchParams.get('chatNo');
        if (!raw || !channelId || !rootNo) return;
        const chatNo = Number(raw);
        if (!Number.isInteger(chatNo) || chatNo <= 0) return;

        followHeldRef.current = true;
        useMessageJumpStore.getState().request(channelId, chatNo, { threadRootNo: rootNo });
        setSearchParams(
            params => {
                const next = new URLSearchParams(params);
                next.delete('chatNo');
                return next;
            },
            { replace: true }
        );
    }, [searchParams, channelId, rootNo, setSearchParams]);
    const imageSend = useSendImages({
        cid: toCloudId(thread.root?.cid || threadCid),
        channelId: stableChannelId,
        parentId: thread.root?.id,
    });
    const imageLocked = editing.isEditing || rootOutsideJoinWindow || !thread.root?.id || inputLock.isLocked;
    const voice = useVoiceMessage({ sendImages: imageSend.sendImages, disabled: imageLocked, scope: draftScope });
    const attach = useChatImageAttach({
        sendImages: imageSend.sendImages,
        disabled: imageLocked,
        scope: draftScope,
        onVoice: voice.canRecord ? voice.open : undefined,
        inputRef,
        composerRef,
        onComposerSlide: sliding => followComposer(sliding ? height => clearComposer(listRef.current, height) : null),
        onUnsentText: text => {
            setContent(current => (current.trim() ? current : text));
            restoreCaptionPicksRef.current?.();
        },
    });
    const reactions = useMemo(() => foldReactions(rawChats, userId ?? null), [rawChats, userId]);

    const memberById = useMemo(() => {
        const map = new Map<string, (typeof members)[number]>();
        for (const member of members) if (member.id) map.set(member.id, member);
        return map;
    }, [members]);

    const nameSources: DisplayNameSources = useMemo(
        () => ({
            profileMap,
            memberById,
            userId,
            unknownLabel: t('chat.unknownUser'),
            meLabel: t('chat.me'),
        }),
        [profileMap, memberById, userId, t]
    );
    const displayNameOf = useMemo(() => (chat: DomainChat) => resolveChatOwnerName(chat, nameSources), [nameSources]);
    const nameOfUser = useMemo(() => (id: string) => resolveUserName(id, nameSources), [nameSources]);

    const avatarOfUser = useMemo(
        () => (id: string) => profileMap.get(id)?.thumbnail ?? memberById.get(id)?.thumbnail,
        [profileMap, memberById]
    );

    const isGroupChat = !!channel && channelKindOf(channel.stereo) === 'group';
    const mentionCandidates = useMemo(
        () =>
            isGroupChat
                ? buildMentionCandidates({
                      memberIds: activeMemberIds,
                      me: userId,
                      nameOf: nameOfUser,
                      avatarOf: avatarOfUser,
                      unknownLabel: t('chat.unknownUser'),
                      everyoneKeyword: t('chat.mention.everyone'),
                      everyoneLabel: t('chat.mention.everyoneWord'),
                  })
                : [],
        [isGroupChat, activeMemberIds, userId, nameOfUser, avatarOfUser, t]
    );
    const mentionComposer = useMentionComposer({
        enabled: isGroupChat && !editing.isEditing,
        candidates: mentionCandidates,
        content,
        setContent,
        inputRef,
        scope: draftScope,
    });
    useEffect(() => {
        restoreCaptionPicksRef.current = mentionComposer.restoreClearedPicks;
    }, [mentionComposer.restoreClearedPicks]);

    const { userId: sessionUid } = runtime.session.useSessionIdentity();
    const mentionViewer = useMemo(() => {
        const me = userId ? memberById.get(userId) : undefined;
        const names = [userId ? profileMap.get(userId)?.nick : undefined, me?.nick, me?.name];
        const memberNames = isGroupChat
            ? [
                  ...mentionCandidates.filter(row => !row.everyone).map(row => row.label),
                  userId ? nameOfUser(userId) : undefined,
              ]
            : undefined;
        const people = mentionCandidates
            .filter(row => !row.everyone)
            .map(row => ({ id: row.id, name: row.label, avatar: row.thumbnail }));
        return mentionViewerOf({ roomUid: userId, sessionUid, names, memberNames, people });
    }, [userId, sessionUid, memberById, profileMap, isGroupChat, mentionCandidates, nameOfUser]);

    const toClientView = useMemo(
        () =>
            (chat: DomainChat): ClientChatView => ({
                ...chat,
                isOwner: !!chat.ownerId && chat.ownerId === userId,
                isSystem: chat.stereo === 'system',
                ownerName: displayNameOf(chat),
                timestamp: new Date(chat.createdAtMs ?? chat.createdAt ?? 0),
            }),
        [userId, displayNameOf]
    );

    const rootSource = thread.root ?? seededRoot;
    const root = useMemo(() => (rootSource ? toClientView(rootSource) : undefined), [rootSource, toClientView]);
    const replies = useMemo(() => thread.replies.map(toClientView), [thread.replies, toClientView]);

    const debugRendered = useMemo(() => (root ? [root, ...replies] : replies), [root, replies]);
    useDebugRoomMirror('thread', {
        channelId,
        channel,
        rendered: debugRendered,
        rows: rawChats,
        focused: actionMessage,
    });

    const rootFetched = Number.isInteger(rootNumber) && rootNumber > 0 && isFetched(rootNumber);
    const { gapsAboveReplyId, trailingGaps } = useMemo(() => {
        const above = new Map<string, ChatGap[]>();
        const trailing: ChatGap[] = [];
        let index = 0;
        for (const gap of gaps) {
            if (!Number.isInteger(rootNumber) || gap.newerNo <= rootNumber) continue;
            if (gap.olderNo < rootNumber && !rootFetched) continue;
            while (index < replies.length && (replies[index].chatNo ?? 0) > 0) {
                if ((replies[index].chatNo ?? 0) >= gap.newerNo) break;
                index += 1;
            }
            const reply = replies[index];
            if (reply?.id) above.set(reply.id, [...(above.get(reply.id) ?? []), gap]);
            else trailing.push(gap);
        }
        return { gapsAboveReplyId: above, trailingGaps: trailing };
    }, [gaps, replies, rootNumber, rootFetched]);
    const hasTrailingGap = trailingGaps.length > 0;

    useEffect(() => {
        if (followHeldRef.current) return;
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    }, [replies.length, composerHeight, hasTrailingGap]);

    const wasEditingRef = useRef(editing.isEditing);
    useEffect(() => {
        if (wasEditingRef.current === editing.isEditing) return;
        wasEditingRef.current = editing.isEditing;
        if (editing.isEditing) {
            followHeldRef.current = true;
            return;
        }
        const list = listRef.current;
        if (list && list.scrollHeight - list.scrollTop - list.clientHeight <= FOLLOW_RESUME_PX) {
            followHeldRef.current = false;
        }
    }, [editing.isEditing]);

    const resumeFollow = useCallback(() => {
        followHeldRef.current = false;
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    }, []);
    const handleListScroll = useCallback(() => {
        const list = listRef.current;
        if (!followHeldRef.current || !list) return;
        if (list.scrollHeight - list.scrollTop - list.clientHeight <= FOLLOW_RESUME_PX) {
            followHeldRef.current = false;
        }
    }, []);

    const fillThreadGap = useCallback(
        (gap: ChatGap, side: ChatGapSide, byTap: boolean) => {
            setAutoGapPagesLeft(left => (byTap ? THREAD_GAP_AUTO_PAGES : Math.max(0, left - 1)));
            const list = listRef.current;
            if (list && list.scrollHeight - list.scrollTop - list.clientHeight > FOLLOW_RESUME_PX) {
                followHeldRef.current = true;
            }
            void fillGap(gap, side);
        },
        [fillGap]
    );
    const renderGap = (gap: ChatGap) => {
        const key = chatGapKey(gap);
        return (
            <GapDivider
                key={`gap-${key}-${gap.missing}`}
                status={gapStatus.get(key)}
                canFill={canLoadMore}
                autoFill={autoGapPagesLeft > 0}
                onFill={(side, byTap) => fillThreadGap(gap, side, byTap)}
            />
        );
    };

    useMessageJump({
        channelId: stableChannelId,
        containerRef: listRef,
        messages: replies,
        hasMore,
        isLoadingMore,
        loadMore,
        canLoadMore: canLoadMore && !isLoading,
        loadUntil,
        joinedNo: myJoin?.joinedNo,
        threadRootNo: rootNo,
        onGiveUp: resumeFollow,
        isFetched,
        fetchThrough,
    });

    const formatTime = (date: Date) => {
        const hours = date.getHours();
        const minutes = date.getMinutes();
        const period = hours < 12 ? t('chat.room.am') : t('chat.room.pm');
        const displayHours = hours % 12 || 12;
        return `${period} ${displayHours}:${minutes.toString().padStart(2, '0')}`;
    };

    const handleSend = (raw: string) => {
        if (inputLock.isLocked) return;
        followHeldRef.current = false;
        const trimmed = raw.trim().slice(0, MAX_INPUT_LENGTH);
        const mention = mentionComposer.mentionFor(trimmed);
        if (attach.sendReady && attach.sendPicked(trimmed, mention)) {
            mentionComposer.clearPicks();
            setContent('');
            return;
        }
        if (!trimmed || !stableChannelId || !thread.root?.id) return;

        mentionComposer.clearPicks();
        setContent('');
        const cid = toCloudId(thread.root.cid || threadCid);
        sendMessage(cid, {
            channelId: stableChannelId,
            content: trimmed,
            parentId: thread.root.id,
            ...(mention ? { mention } : {}),
        })
            .then(newChat => {
                if (newChat?.chatNo) {
                    runtime.data
                        .getCloudRepositories(cid)
                        .join.readChat({ channelId: stableChannelId, chatNo: newChat.chatNo })
                        .then(receipt => receipt.delivered)
                        .catch(readError => {
                            logger.error('CHAT', 'Failed to read sent thread reply', {
                                error: readError,
                                data: { channelId: stableChannelId, cid },
                            });
                        });
                }
            })
            .catch(error => {
                logger.error('CHAT', 'Failed to send thread reply', {
                    error,
                    data: { channelId: stableChannelId, rootNo, cid },
                });
                toast({ title: t('chat.room.sendFailed'), variant: 'destructive' });
            });
    };

    const composerFieldProps: Omit<MessageInputProps, 'inputRef' | 'onKeyDown'> = editing.composer
        ? {
              value: editing.composer.draft,
              onChange: editing.composer.onDraftChange,
              onSend: editing.composer.onSave,
              label: t('chat.room.editMessage'),
              placeholder: t('chat.room.editMessage'),
              sendLabel: t('chat.room.editSave'),
              disabled: editing.composer.isSaving,
          }
        : {
              value: content,
              onChange: mentionComposer.onChange,
              onSend: handleSend,
              sendReady: attach.sendReady,
              placeholder: inputLock.isLocked ? t('chat.inputLock.placeholder') : t('chat.thread.inputPlaceholder'),
              sendLabel: t('common.send'),
              disabled: rootOutsideJoinWindow || inputLock.isLocked,
              leadingSlot: inputLock.isLocked ? (
                  <ComposerLockButton onClick={unlockInput} label={t('chat.inputLock.unlock')} />
              ) : (
                  attach.button
              ),
          };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (!isSendKey(e.nativeEvent)) return;
        e.preventDefault();
        if (editing.composer) {
            editing.composer.onSave();
            return;
        }
        handleSend(content);
    };

    const handleCopy = async () => {
        const text = actionMessage ? chatPlainText(actionMessage) : '';
        if (!text || isCopying) return;
        setIsCopying(true);
        try {
            await copyMessageToClipboard(text);
            toast({ title: t('chat.room.messageCopied') });
            setActionMessage(null);
        } catch (error) {
            logger.error('CHAT', 'Failed to copy message', { error });
            toast({ title: t('chat.room.copyFailed'), variant: 'destructive' });
        } finally {
            setIsCopying(false);
        }
    };

    const handlePickEmoji = (emoji: string) => {
        if (!actionMessage?.id) return;
        remember(emoji);
        const mine = hasMyReaction(reactions.get(actionMessage.id), emoji);
        toggleReaction(actionMessage.id, emoji, mine);
        setActionMessage(null);
        setPickerOpen(false);
    };

    const canReact = !!actionMessage?.chatNo;

    const canModify = !!actionMessage && canModifyMessage(actionMessage, actionMessage.isOwner);

    const handleEditAction = () => {
        const target = actionMessage;
        setActionMessage(null);
        if (target) editing.startEdit(target);
    };

    const handleDeleteAction = () => {
        const target = actionMessage;
        setActionMessage(null);
        if (target) editing.requestDelete(target);
    };

    const deleteConfirmPreview = deleteConfirmQuote(editing.deleteTarget?.content);

    const handleAddReaction = (message: ClientChatView) => {
        setActionMessage(message);
        setPickerOpen(true);
    };

    const openMemberProfile = (sender: MessageSender) => {
        if (!sender.id || sender.id === userId) return;
        setProfileTarget(sender);
        setProfileOpen(true);
    };

    const renderRoot = (message: ClientChatView) => {
        const avatarSrc = message.ownerId
            ? (profileMap.get(message.ownerId)?.thumbnail ?? memberById.get(message.ownerId)?.thumbnail)
            : undefined;
        const isDeleted = !!message.hidden;
        const tallies = !isDeleted && message.id ? reactions.get(message.id) : undefined;
        const rootAuthor = (
            <>
                {avatarSrc ? <ImageAvatar src={avatarSrc} alt="" size={36} /> : <DefaultAvatar size={36} />}
                <span className="min-w-0 flex-1 truncate text-[15px] font-medium leading-[18px] tracking-[-0.075px] text-foreground">
                    {message.ownerName}
                </span>
            </>
        );
        return (
            <div data-testid="thread-root" className="flex flex-col px-3">
                {!message.isOwner && message.ownerId ? (
                    <button
                        type="button"
                        onClick={() =>
                            openMemberProfile({
                                id: message.ownerId as string,
                                name: message.ownerName,
                                avatar: avatarSrc,
                            })
                        }
                        aria-label={t('chat.room.openProfile', { name: message.ownerName })}
                        className="flex items-center gap-2.5 px-1 py-1.5 text-left"
                    >
                        {rootAuthor}
                    </button>
                ) : (
                    <div className="flex items-center gap-2.5 px-1 py-1.5">{rootAuthor}</div>
                )}
                <div className="flex flex-col gap-3 px-1 py-1.5">
                    {isDeleted ? (
                        <p className="text-base italic leading-normal tracking-[-0.08px] text-muted-foreground">
                            {t('chat.room.deletedMessage')}
                        </p>
                    ) : (
                        hasMessageText(message) && (
                            <p className="whitespace-pre-wrap break-words text-base leading-normal tracking-[-0.08px] text-foreground">
                                <MessageText
                                    text={chatPlainText(message)}
                                    mentions={mentionMarksFor(message, mentionViewer)}
                                    onMentionClick={person =>
                                        openMemberProfile({ id: person.id, name: person.name, avatar: person.avatar })
                                    }
                                    onPage
                                />
                            </p>
                        )
                    )}
                    {!isDeleted && (message.upload$$?.length ?? 0) > 0 && (
                        <MessageImages
                            uploads={message.upload$$}
                            chatId={message.id}
                            cid={message.cid}
                            align="start"
                            hiddenSlots={hiddenPartsOf(message, hiddenMedia)?.slots}
                            audio={{
                                channelId: message.channelId,
                                chatNo: message.chatNo,
                                senderName: message.ownerName,
                                sentAt: message.timestamp?.getTime?.(),
                                mine: message.isOwner,
                            }}
                        />
                    )}
                    {tallies && tallies.length > 0 && (
                        <ReactionChips
                            tallies={tallies}
                            nameOf={nameOfUser}
                            onToggle={(emoji, isMine) => message.id && toggleReaction(message.id, emoji, isMine)}
                            onAdd={message.chatNo ? () => handleAddReaction(message) : undefined}
                            onShowReactors={key => message.id && setReactorTarget({ messageId: message.id, key })}
                        />
                    )}
                </div>
            </div>
        );
    };

    const renderRow = (message: ClientChatView) => (
        <div key={message.id} data-chat-no={message.chatNo}>
            <ChannelMessageRow
                message={message}
                mentionViewer={mentionViewer}
                hiddenMedia={hiddenMedia}
                threadRootNo={rootNo}
                showProfileAndName={!message.isOwner}
                showTimeAndStatus
                ownerDisplayName={message.ownerName}
                ownerAvatar={
                    message.ownerId
                        ? (profileMap.get(message.ownerId)?.thumbnail ?? memberById.get(message.ownerId)?.thumbnail)
                        : undefined
                }
                time={formatTime(message.timestamp)}
                read={{ show: false, isReady: false, readCount: 0, unreadCount: 0 }}
                onLongPress={() => canOpenMessageActions(message) && setActionMessage(message)}
                onExpand={() => setExpandedMessage({ content: chatPlainText(message) })}
                onRetry={() => undefined}
                onDelete={() => undefined}
                reactions={message.id ? reactions.get(message.id) : undefined}
                onToggleReaction={(emoji, isMine) => message.id && toggleReaction(message.id, emoji, isMine)}
                reactionFailed={!!message.id && failedId === message.id}
                nameOf={nameOfUser}
                onAddReaction={message.chatNo ? () => handleAddReaction(message) : undefined}
                onShowReactors={key => message.id && setReactorTarget({ messageId: message.id, key })}
                isEditTarget={editing.isEditTarget(message)}
                onOpenProfile={openMemberProfile}
            />
        </div>
    );

    return (
        <div className="relative flex h-full flex-col overflow-hidden bg-background">
            <div ref={headerRef} className="absolute inset-x-0 top-0 z-20">
                <ChatRoomHeader
                    title={t('chat.thread.title')}
                    hideAvatar
                    onBack={() => navigate(-1)}
                    className="border-b border-border"
                />
            </div>

            <RoomMiniPlayer
                channelId={stableChannelId}
                threadRootNo={rootNo}
                containerRef={listRef}
                rowsVersion={rawChats}
                top={headerHeight + 16}
            />

            <div
                ref={listRef}
                onScroll={handleListScroll}
                className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-none"
                style={{ paddingTop: headerHeight + 8, paddingBottom: composerHeight + LIST_COMPOSER_GAP }}
            >
                {isLoading && !root ? (
                    <div data-testid="thread-loading" className="flex min-h-full items-center justify-center">
                        <Loader2 size={24} className="animate-spin text-muted-foreground" />
                    </div>
                ) : (
                    <div className="flex flex-col px-0 py-2">
                        {root ? (
                            renderRoot(root)
                        ) : (
                            <div className="flex flex-col items-center gap-2 px-6 py-8 text-center text-sm text-muted-foreground">
                                <span>
                                    {rootOutsideJoinWindow
                                        ? t('chat.thread.rootOutsideJoinWindow')
                                        : t('chat.thread.unavailable')}
                                </span>
                                {(hasMore || rootUnfetched) && !rootOutsideJoinWindow && (
                                    <button
                                        type="button"
                                        onClick={() =>
                                            rootUnfetched ? fetchRootPage() : void loadMore({ immediate: true })
                                        }
                                        disabled={isLoadingMore || isFetchingRoot || !canLoadMore}
                                        className="text-primary underline"
                                    >
                                        {isLoadingMore || isFetchingRoot ? (
                                            <Loader2 size={14} className="animate-spin" />
                                        ) : (
                                            t('chat.thread.loadOlder')
                                        )}
                                    </button>
                                )}
                            </div>
                        )}
                        <div className="py-4">
                            <div aria-hidden className="h-1 w-full bg-avatar-ring" />
                        </div>
                        {replies.length > 0 && (
                            <p className="px-4 py-1 text-[15px] font-semibold leading-normal tracking-[-0.075px] text-foreground">
                                {t('chat.thread.replyCount', { count: replies.length })}
                            </p>
                        )}
                        <div className="flex flex-col gap-3 pt-4">
                            {replies.flatMap(reply => [
                                ...(gapsAboveReplyId.get(reply.id ?? '') ?? []).map(renderGap),
                                renderRow(reply),
                            ])}
                            {trailingGaps.map(renderGap)}
                        </div>
                    </div>
                )}
            </div>

            <div
                ref={composerRef}
                onFocus={event => {
                    if ((event.target as EventTarget) === inputRef.current) attach.closePanel();
                }}
                className="absolute inset-x-0 bottom-0 z-20 bg-transparent px-4 pt-2"
                style={{
                    paddingBottom: COMPOSER_PADDING_BOTTOM,
                }}
            >
                {editing.composer ? (
                    <ComposerEditBar edit={editing.composer} inputRef={inputRef} />
                ) : (
                    <>
                        {attach.strip}
                        <MentionSuggestions candidates={mentionComposer.suggestions} onPick={mentionComposer.pick} />
                    </>
                )}
                <MessageInput inputRef={inputRef} onKeyDown={handleKeyDown} {...composerFieldProps} />
            </div>
            {attach.overlays}
            {voice.sheet}

            <MessageDetailDialog message={expandedMessage} onClose={() => setExpandedMessage(null)} />

            {profileTarget && (
                <MemberProfileDialog
                    open={profileOpen}
                    onOpenChange={setProfileOpen}
                    member={profileTarget}
                    memberIsOwner={isRoomOwner(
                        channel,
                        joins.find(join => join.userId === profileTarget.id),
                        profileTarget.id
                    )}
                    canKick={false}
                    onStartDm={
                        canStartDm &&
                        canStartDmFromProfile({
                            room: channel,
                            sessionCloudId: selectedCloudId,
                            sessionPlaceId: selectedSiteId,
                            memberId: profileTarget.id,
                            isMe: id => id === userId || id === sessionUid,
                        })
                            ? () => {
                                  setProfileOpen(false);
                                  void startDm(profileTarget.id);
                              }
                            : undefined
                    }
                />
            )}

            <MessageActionSheet
                open={!!actionMessage && !pickerOpen}
                fileMessage={actionMessage}
                onOpenChange={open => !open && setActionMessage(null)}
                tallies={actionMessage?.id ? reactions.get(actionMessage.id) : undefined}
                canReact={canReact}
                canReply={false}
                canModify={canModify}
                hasText={!!actionMessage && hasMessageText(actionMessage)}
                isCopying={isCopying}
                onPickEmoji={handlePickEmoji}
                onMoreEmoji={() => setPickerOpen(true)}
                onCopy={() => void handleCopy()}
                onReply={() => undefined}
                onEdit={handleEditAction}
                onDelete={handleDeleteAction}
            />
            <ConfirmDialog
                open={!!editing.deleteTarget}
                onOpenChange={open => !open && editing.cancelDelete()}
                title={t('chat.room.deleteMessageTitle')}
                description={deleteConfirmPreview || t('chat.room.deleteMessageDescription')}
                confirmLabel={t('chat.room.deleteMessageConfirm')}
                onConfirm={() => void editing.confirmDelete()}
                isPending={editing.isDeleting}
                closeOnConfirm={false}
            />
            <ConfirmDialog
                open={editing.discardOpen}
                onOpenChange={open => !open && editing.setDiscardOpen(false)}
                title={t('chat.room.editDiscardTitle')}
                description={t('chat.room.editDiscardDescription')}
                confirmLabel={t('chat.room.editDiscardConfirm')}
                onConfirm={editing.closeEdit}
                variant="warning"
            />
            <ReactionDetailSheet
                open={!!reactorTarget}
                onOpenChange={open => !open && setReactorTarget(null)}
                tallies={(reactorTarget && reactions.get(reactorTarget.messageId)) || []}
                initialKey={reactorTarget?.key}
                nameOf={nameOfUser}
                avatarOf={avatarOfUser}
            />
            <EmojiPickerSheet
                open={pickerOpen}
                onOpenChange={open => {
                    setPickerOpen(open);
                    if (!open) setActionMessage(null);
                }}
                onPick={handlePickEmoji}
            />
        </div>
    );
};
