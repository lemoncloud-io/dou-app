import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { X } from 'lucide-react';

import { RELAY_CLOUD_ID } from '@chatic/data';
import type { DomainChannel } from '@chatic/data';
import { Button } from '@chatic/ui-kit/components/ui/button';

import {
    Hint,
    lastChatNoOf,
    useAuthorNames,
    useChats,
    ResizablePanel,
    PANE_HEADER,
    PANEL_TITLE,
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
    type ReadCountOf,
} from '../hooks';
import { useThreadStore } from '../stores';
import { Composer } from './Composer';
import { MessageList } from './MessageList';
import { AttachmentDropOverlay } from './images';

interface ThreadPanelProps {
    /** The channel the open thread belongs to (the host's selected channel). */
    channel: DomainChannel;
    /** Thread root id from useThreadStore.openRootId. */
    rootId: string;
    /** Roster shared with the chat pane — used to name reply authors. */
    members: ChannelMember[];
    membersLoading?: boolean;
    /**
     * Per-message read counts, from the one `useReadCounts` the host mounts per channel.
     * A reply carries the same channel-wide chatNo the read cursors point at, so its receipt
     * is the same question the feed asks — and the panel shares the feed's renderer, so a
     * prop the host forgets here is how `foldReactions` went missing in this file (CLAUDE.md).
     */
    readCountOf?: ReadCountOf;
}

const Spinner = () => (
    <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground motion-reduce:animate-none" />
);

/** What the panel says in place of a root it does not have. */
const ROOT_NOTICE = {
    loading: 'chat.thread.loading',
    beforeJoin: 'chat.thread.beforeJoin',
    gone: 'chat.thread.gone',
    failed: 'chat.thread.failed',
    found: 'chat.thread.loading', // unreachable: a found root renders the thread
} as const;

/**
 * Slack-style right-side thread pane. Shows the Thread Root + its direct replies
 * (derived client-side from the loaded cache — see ADR 0008) and a composer that
 * sends with `parentId` so messages land in this thread, hidden from the main
 * feed. Reuses MessageList for rendering; passes no thread props down, so the
 * pane shows no nested reply affordances (threads are root-only).
 */
export const ThreadPanel = ({ channel, rootId, members, membersLoading, readCountOf }: ThreadPanelProps) => {
    const { t } = useTranslation();
    const channelId = channel.id ?? '';
    const closeThread = useThreadStore(s => s.close);
    // Freshness bridge: new replies land via the channel record's chatNo (see useChats).
    const { messages, isLoading, loadOlder, hasMore, isLoadingOlder } = useChats(channelId, lastChatNoOf(channel), {
        persist: false,
    });

    // Same viewer the chat pane builds, so own/optimistic messages name correctly.
    const viewer = useMessageViewer(channel);
    const mentionables = useMentionables(members, viewer);
    const tray = useImageAttachments(`${channelId}::thread::${rootId}`);
    const { isDragging, dropHandlers } = useFileDrop(tray.addFiles);

    // The window holds only the newest messages, so the root can sit below it — then the hook fetches it
    // (and pages the replies in) instead of leaving the reader to scroll the channel for it.
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
        // The panel is another view of the same messages, so a deleted reply reads the
        // same way it does in the feed: a tombstone in place, not a closed gap. Reaction
        // events are the exception — they are chips on a message, never rows.
        const replies = thread.replies.filter(reply => reply.subType !== 'reaction');
        return {
            threadMessages: root ? [root, ...replies] : replies,
            replyCount: replies.length,
        };
    }, [thread, root]);

    // Reactions are derived, not stored: each toggle is its own `subType:'reaction'` chat, and the
    // chips are what the fold makes of them. The panel renders the same messages as the feed, so it
    // has to fold them too — from the UNFILTERED list, since `threadMessages` is exactly the set
    // with those events removed.
    const reactions = useMemo(() => foldReactions(messages, viewer), [messages, viewer]);

    // Resolve author names the same way as the chat pane: cached author names
    // first, channel roster as fallback (own messages name from the viewer).
    const authorIds = useMemo(() => threadMessages.map(m => m.ownerId), [threadMessages]);
    const cachedNames = useAuthorNames(authorIds);
    const names = useMemo(() => buildMemberNames(members, cachedNames), [members, cachedNames]);

    // The server takes the parent's FULL id and 404s on a bare chatNo (it normalises to chatNo
    // itself on store) — so replies go to root.id, not rootId. Addressed to the channel's cloud, like
    // the chat pane's send. No room until the root is here: bound to the channel alone, this panel
    // would be taken for the chat pane's own screen and drop that screen's unsent pictures on leaving.
    const composer = useComposerSend({
        cid: channel.cid || RELAY_CLOUD_ID,
        channelId: root?.id ? channelId : '',
        ...(root?.id ? { parentId: root.id } : {}),
    });

    const handleReply = (content: string, files: File[]) => {
        // Unreachable when !root (Composer isn't rendered then); type guard only.
        if (!root?.id) return;
        composer.send(content, files);
        tray.clear();
    };

    // The row under the root while older replies are still out: progress, the reader's way to ask for the
    // next batch, or a retry. A failure stays on this row — what is already shown is not taken away.
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
                        membersLoading={membersLoading}
                        threadReplyCount={replyCount}
                        olderReplies={olderReplies}
                        repliesPartial={repliesStatus !== 'complete'}
                        onRetry={composer.retry}
                        canRetry={composer.canRetry}
                        onDiscard={composer.discard}
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
                {/* No root → nothing to reply to: don't show a composer at all (the editor
                is always editable, so a disabled-looking one would be typeable-but-dead). */}
                {root && (
                    <Composer
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
