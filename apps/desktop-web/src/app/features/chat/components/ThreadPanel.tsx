import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { X } from 'lucide-react';

import type { DomainChannel, DomainChat } from '@chatic/data';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import { lastChatNoOf, useAuthorNames, useChatMutations, useChats, usePanelWidth } from '../../../shared';
import type { ChannelMember } from '../../channels';
import { buildMemberNames, buildThread } from '../utils';
import { useMentionables, useMessageViewer } from '../hooks';
import { useThreadStore } from '../stores';
import { Composer } from './Composer';
import { MessageList } from './MessageList';

interface ThreadPanelProps {
    /** The channel the open thread belongs to (the host's selected channel). */
    channel: DomainChannel;
    /** Thread root id from useThreadStore.openRootId. */
    rootId: string;
    /** Roster shared with the chat pane — used to name reply authors. */
    members: ChannelMember[];
    membersLoading?: boolean;
}

/**
 * Slack-style right-side thread pane. Shows the Thread Root + its direct replies
 * (derived client-side from the loaded cache — see ADR 0008) and a composer that
 * sends with `parentId` so messages land in this thread, hidden from the main
 * feed. Reuses MessageList for rendering; passes no thread props down, so the
 * pane shows no nested reply affordances (threads are root-only).
 */
export const ThreadPanel = ({ channel, rootId, members, membersLoading }: ThreadPanelProps) => {
    const { t } = useTranslation();
    const channelId = channel.id ?? '';
    const closeThread = useThreadStore(s => s.close);
    const { width, minWidth, maxWidth, panelRef, startResize, resizeByKey } = usePanelWidth({
        storageKey: 'chatic.threadPanel.width',
        defaultWidth: 384,
    });
    // Freshness bridge: new replies land via the channel record's chatNo (see useChats).
    const { messages } = useChats(channelId, lastChatNoOf(channel));
    const { sendMessage, retryMessage, discardMessage } = useChatMutations();
    // Stable identity — MessageRow is memo'd; an inline closure would re-render
    // every visible thread row on each panel render.
    const handleDiscard = useCallback((message: DomainChat) => void discardMessage(message), [discardMessage]);

    // Same viewer the chat pane builds, so own/optimistic messages name correctly.
    const viewer = useMessageViewer(channel);
    const mentionables = useMentionables(members);

    const { root, threadMessages, replyCount } = useMemo(() => {
        const thread = buildThread(messages, rootId);
        // A deleted reply is gone here too — the panel is another view of the same
        // messages, and a delete that only took effect in the main feed would leave the
        // message readable one click away. The root is kept even when deleted: it renders
        // as a tombstone so the replies below it still have something to hang from.
        const replies = thread.replies.filter(reply => !reply.hidden);
        return {
            root: thread.root,
            threadMessages: thread.root ? [thread.root, ...replies] : replies,
            replyCount: replies.length,
        };
    }, [messages, rootId]);

    // Resolve author names the same way as the chat pane: cached author names
    // first, channel roster as fallback (own messages name from the viewer).
    const authorIds = useMemo(() => threadMessages.map(m => m.ownerId), [threadMessages]);
    const cachedNames = useAuthorNames(authorIds);
    const names = useMemo(() => buildMemberNames(members, cachedNames), [members, cachedNames]);

    const handleReply = (content: string) => {
        // The server takes the parent's FULL id and 404s on a bare chatNo (it
        // normalises to chatNo itself on store) — so send root.id, not rootId.
        // Unreachable when !root (Composer isn't rendered then); type guard only.
        if (!root?.id) return;
        void sendMessage({ channelId, content, parentId: root.id }).catch(() =>
            toast({ variant: 'destructive', description: t('toast.messageFailed') })
        );
    };

    return (
        <aside
            ref={panelRef}
            style={{ width }}
            className="absolute inset-y-0 right-0 z-30 flex max-w-[85vw] shrink-0 flex-col overflow-hidden border-l border-hairline bg-background shadow-raised xl:relative xl:z-auto xl:max-w-none xl:shadow-none"
        >
            {/* Drag the panel's left edge to resize (arrow keys when focused). */}
            <div
                role="separator"
                aria-orientation="vertical"
                aria-label={t('chat.thread.resize')}
                aria-valuenow={width}
                aria-valuemin={minWidth}
                aria-valuemax={maxWidth}
                tabIndex={0}
                onPointerDown={startResize}
                onKeyDown={resizeByKey}
                className="focus-ring absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize transition-colors ease-tactile hover:bg-primary/40 active:bg-primary/60"
            />
            <header className="flex h-14 shrink-0 items-center justify-between border-b border-hairline px-4">
                <span className="truncate text-title text-foreground">{t('chat.thread.title')}</span>
                <button
                    type="button"
                    onClick={closeThread}
                    title={t('chat.thread.close')}
                    aria-label={t('chat.thread.close')}
                    className="focus-ring tactile flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors ease-tactile hover:bg-accent hover:text-foreground"
                >
                    <X size={18} />
                </button>
            </header>
            {root ? (
                <MessageList
                    key={rootId}
                    messages={threadMessages}
                    isLoading={false}
                    viewer={viewer}
                    names={names}
                    membersLoading={membersLoading}
                    threadReplyCount={replyCount}
                    onRetry={retryMessage}
                    onDiscard={handleDiscard}
                />
            ) : (
                <div
                    role="status"
                    aria-live="polite"
                    className="flex flex-1 flex-col items-center justify-center px-6 text-center"
                >
                    <p className="max-w-xs text-caption text-muted-foreground">{t('chat.thread.unavailable')}</p>
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
                />
            )}
        </aside>
    );
};
