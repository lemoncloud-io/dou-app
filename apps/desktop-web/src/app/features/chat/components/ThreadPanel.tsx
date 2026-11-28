import { useEffect, useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { X } from 'lucide-react';

import { isEventChat, RELAY_CLOUD_ID } from '@chatic/runtime-react';
import type { ChatMentionBody, DomainChannel } from '@chatic/runtime-react';
import { Button } from '@chatic/ui-kit';
import { Hint, PANE_HEADER, PANEL_TITLE } from '@chatic/design-system-components-desktop';

import {
    chatSenderName,
    lastChatNoOf,
    messagePreview,
    outgoingMessagePreview,
    myThreadKey,
    threadChannel,
    threadRootNo,
    useMyThreadsStore,
    useAuthorNames,
    useChannelReadCounts,
    useChats,
    ResizablePanel,
} from '../../../shared';
import type { ChannelMember } from '../../channels';
import { buildMemberNames, buildThread, foldReactions } from '../utils';
import {
    useComposerSend,
    useFileDrop,
    useImageAttachments,
    useMentionables,
    useMessageViewer,
    useThreadRoot,
} from '../hooks';
import { useThreadStore } from '../stores';
import { LazyComposer } from './LazyComposer';
import { MessageList } from './MessageList';
import { AttachmentDropOverlay } from './images';

interface ThreadPanelProps {
    channel: DomainChannel;
    rootId: string;
    members: ChannelMember[];
    membersLoading?: boolean;
}

const Spinner = () => (
    <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground motion-reduce:animate-none" />
);

const ROOT_NOTICE = {
    loading: 'chat.thread.loading',
    beforeJoin: 'chat.thread.beforeJoin',
    gone: 'chat.thread.gone',
    failed: 'chat.thread.failed',
    found: 'chat.thread.loading',
} as const;

export const ThreadPanel = ({ channel, rootId, members, membersLoading }: ThreadPanelProps) => {
    const { t } = useTranslation();
    const channelId = channel.id ?? '';
    const closeThread = useThreadStore(s => s.close);
    const { messages, isLoading, loadOlder, hasMore, isLoadingOlder } = useChats(channelId, lastChatNoOf(channel), {
        persist: false,
    });

    const { readCountOf } = useChannelReadCounts(channel);

    const viewer = useMessageViewer(channel);
    const mentionables = useMentionables(members, viewer, channel);
    const tray = useImageAttachments(`${channelId}::thread::${rootId}`);
    const { isDragging, dropHandlers } = useFileDrop(tray.addFiles);

    const thread = useMemo(() => buildThread(messages, rootId), [messages, rootId]);
    const {
        status,
        root,
        replies: repliesStatus,
        retryRoot,
        loadOlderReplies,
    } = useThreadRoot({
        channelId,
        rootId,
        windowRoot: thread.root,
        joinedNo: channel.$join?.joinedNo,
        feedLoading: isLoading,
        messages,
        loadOlder,
        hasMore,
        isLoadingOlder,
    });
    const { threadMessages, replyCount } = useMemo(() => {
        const replies = thread.replies.filter(reply => !isEventChat(reply));
        return {
            threadMessages: root ? [root, ...replies] : replies,
            replyCount: replies.length,
        };
    }, [thread, root]);

    const reactions = useMemo(() => foldReactions(messages, viewer), [messages, viewer]);

    const authorIds = useMemo(() => threadMessages.map(m => m.ownerId), [threadMessages]);
    const cachedNames = useAuthorNames(authorIds);
    const names = useMemo(() => buildMemberNames(members, cachedNames), [members, cachedNames]);

    const composer = useComposerSend({
        cid: channel.cid || RELAY_CLOUD_ID,
        channelId: root?.id ? channelId : '',
        ...(root?.id ? { parentId: root.id } : {}),
    });

    const cid = channel.cid || RELAY_CLOUD_ID;
    const rootNo = root?.chatNo != null ? String(root.chatNo) : threadRootNo(rootId);
    const recordThread = useMyThreadsStore(s => s.record);
    const markThreadSeen = useMyThreadsStore(s => s.markSeen);
    const threadKey = myThreadKey(cid, channelId, rootNo);
    const listedReplyNo = useMyThreadsStore(s => s.threads[threadKey]?.lastReplyNo);
    useEffect(() => {
        if (listedReplyNo !== undefined) markThreadSeen(cid, channelId, rootNo);
    }, [cid, channelId, rootNo, listedReplyNo, markThreadSeen]);

    const handleReply = (content: string, files: File[], mention?: ChatMentionBody) => {
        if (!root?.id) return;
        if (mention) composer.send(content, files, mention);
        else composer.send(content, files);
        tray.clear();
        recordThread(
            {
                cid,
                channelId,
                placeId: channel.sid,
                ...threadChannel(channel),
                rootNo,
                replyNo: 0,
                preview: outgoingMessagePreview(content, files),
                ownerName: viewer.name,
                at: Date.now(),
                mine: true,
            },
            {
                root: {
                    preview: messagePreview(root),
                    ownerName: chatSenderName(root, channel.sid, viewer) || names.get(root.ownerId ?? '') || '',
                },
            }
        );
    };

    let olderReplies: ReactNode = null;
    if (repliesStatus === 'loadingOlder') {
        olderReplies = (
            <div
                role="status"
                className="flex items-center justify-center gap-2 py-1 text-caption text-muted-foreground"
            >
                <Spinner />
                {t('chat.thread.loadingOlder')}
            </div>
        );
    } else if (repliesStatus === 'partial' || repliesStatus === 'olderFailed') {
        olderReplies = (
            <div className="flex flex-col items-center gap-1">
                {repliesStatus === 'olderFailed' && (
                    <p role="status" className="text-caption text-muted-foreground">
                        {t('chat.thread.loadOlderFailed')}
                    </p>
                )}
                <Button size="sm" variant="outline" className="focus-ring tactile" onClick={loadOlderReplies}>
                    {t(repliesStatus === 'olderFailed' ? 'chat.thread.retry' : 'chat.thread.loadOlder')}
                </Button>
            </div>
        );
    }

    return (
        <ResizablePanel
            storageKey={'chatic.threadPanel.width'}
            resizeLabel={t('chat.thread.resize')}
            label={t('chat.thread.title')}
            onClose={closeThread}
            className="bg-background"
        >
            <header className={`${PANE_HEADER} px-6`}>
                <span className={PANEL_TITLE}>{t('chat.thread.title')}</span>
                <Hint label={t('chat.thread.close')}>
                    <button
                        type="button"
                        onClick={closeThread}
                        aria-label={t('chat.thread.close')}
                        className="focus-ring tactile -mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-foreground transition-colors ease-tactile hover:bg-accent"
                    >
                        <X size={20} />
                    </button>
                </Hint>
            </header>
            <div className="relative flex min-h-0 flex-1 flex-col" {...dropHandlers}>
                {root ? (
                    <MessageList
                        key={rootId}
                        messages={threadMessages}
                        reactions={reactions}
                        isLoading={false}
                        viewer={viewer}
                        names={names}
                        mentionables={mentionables}
                        membersLoading={membersLoading}
                        threadReplyCount={replyCount}
                        olderReplies={olderReplies}
                        repliesPartial={repliesStatus !== 'complete'}
                        onRetry={composer.retry}
                        canRetry={composer.canRetry}
                        onDiscard={composer.discard}
                        onCancelUpload={composer.cancelUpload}
                        readCountOf={readCountOf}
                    />
                ) : (
                    <div
                        role="status"
                        aria-live="polite"
                        className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center"
                    >
                        {status === 'loading' && <Spinner />}
                        <p className="max-w-xs text-caption text-muted-foreground">{t(ROOT_NOTICE[status])}</p>
                        {status === 'failed' && (
                            <Button size="sm" variant="outline" className="focus-ring tactile" onClick={retryRoot}>
                                {t('chat.thread.retry')}
                            </Button>
                        )}
                    </div>
                )}
                {root && (
                    <LazyComposer
                        onSend={handleReply}
                        channelId={`${channelId}::thread::${rootId}`}
                        placeholder={t('chat.thread.composerPlaceholder')}
                        mentionables={mentionables}
                        attachments={tray.attachments}
                        onAddFiles={tray.addFiles}
                        onRemoveAttachment={tray.remove}
                        autoFocus
                        compact
                    />
                )}
                {isDragging && root && <AttachmentDropOverlay />}
            </div>
        </ResizablePanel>
    );
};
