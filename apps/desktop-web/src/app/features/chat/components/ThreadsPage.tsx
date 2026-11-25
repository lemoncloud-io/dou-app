import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { MessagesSquare } from 'lucide-react';

import type { DomainChannel, DomainChat } from '@chatic/runtime-react';
import { cn } from '@chatic/ui-kit';
import { runtime } from '@chatic/runtime-react';

import {
    PANE_HEADER,
    formatListTime,
    isThreadUnread,
    messagePreview,
    senderNameIn,
    threadsInScope,
    usePlaceProfilesStore,
    toastFailure,
    useMyThreadsStore,
    useNotificationsPanelStore,
    type MyThread,
} from '../../../shared';
import { useChatMutations } from '../../../shared/hooks/useChatMutations';
import { useIntersecting } from '../hooks/useIntersecting';
import { useCardReactionEvents } from '../hooks/useCardReactionEvents';
import { useThreadCard } from '../hooks/useThreadCard';
import { ThreadCardMessages } from './ThreadCardMessages';
import { ThreadCardReply } from './ThreadCardReply';

export const CARD_LINK =
    'focus-ring tactile shrink-0 rounded-md px-2 py-1 text-micro font-medium text-foreground transition-colors ease-tactile hover:bg-accent';

interface ThreadsPageProps {
    cloudId: string;
    channels: DomainChannel[];
    placeScope: ReadonlySet<string>;
    onOpen: (channelId: string, chatNo: number | undefined, placeId: string | undefined, rootNo: string) => void;
}

interface ThreadCardProps {
    thread: MyThread;
    channelLabel: string | undefined;
    channel?: DomainChannel;
    joinedNo?: number;
    onOpen: () => void;
}

const SEEN_DWELL_MS = 1000;

interface ReplyLineProps {
    message: DomainChat;
    author: string;
    onRetry?: () => void;
    onDiscard?: () => void;
}

const ReplyLine = ({ message, author, onRetry, onDiscard }: ReplyLineProps) => {
    const { t } = useTranslation();
    return (
        <div className={cn('flex flex-col gap-0.5', message.isPending && 'opacity-60')}>
            <span className="flex items-baseline gap-2">
                <span className="truncate text-caption font-semibold text-foreground">{author}</span>
                {message.createdAt !== undefined && (
                    <span className="shrink-0 text-micro tabular-nums text-muted-foreground">
                        {formatListTime(message.createdAt)}
                    </span>
                )}
            </span>
            <p className="line-clamp-4 whitespace-pre-wrap break-words text-callout text-foreground">
                {messagePreview(message)}
            </p>
            {message.isFailed && (
                <span className="flex items-center gap-2 text-micro text-destructive">
                    {t('chat.failed')}
                    {onRetry && (
                        <button type="button" onClick={onRetry} className={CARD_LINK}>
                            {t('chat.retry')}
                        </button>
                    )}
                    {onDiscard && (
                        <button type="button" onClick={onDiscard} className={CARD_LINK}>
                            {t('chat.deleteUnsent')}
                        </button>
                    )}
                </span>
            )}
        </div>
    );
};

const ThreadCard = ({ thread, channelLabel, channel, joinedNo, onOpen }: ThreadCardProps) => {
    const { t } = useTranslation();
    const profiles = usePlaceProfilesStore(s => (thread.placeId ? s.bySid[thread.placeId] : undefined));
    const { userId: myUid } = runtime.session.useSessionIdentity();
    const authorOf = (message: DomainChat) => senderNameIn(message, profiles, { uid: myUid, name: '' });
    const markSeen = useMyThreadsStore(s => s.markSeen);
    const ref = useRef<HTMLElement>(null);
    const near = useIntersecting(ref, '200px 0px');
    const [read, setRead] = useState(false);
    if (near && !read) setRead(true);
    const onScreen = useIntersecting(ref, '0px');

    const unread = isThreadUnread(thread);
    const { state, retry } = useThreadCard({
        cid: thread.cid,
        channelId: thread.channelId,
        rootNo: thread.rootNo,
        lastReplyNo: thread.lastReplyNo,
        lastActivityAt: thread.lastActivityAt,
        joinedNo,
        enabled: read,
    });
    const reactionEvents = useCardReactionEvents(thread.cid, thread.channelId, read);
    const shown = state.status === 'ready';
    useEffect(() => {
        if (!onScreen || !unread || !shown) return;
        const timer = setTimeout(() => markSeen(thread.cid, thread.channelId, thread.rootNo), SEEN_DWELL_MS);
        return () => clearTimeout(timer);
    }, [onScreen, unread, shown, markSeen, thread.cid, thread.channelId, thread.rootNo]);
    const where = channelLabel ?? t('threads.dm');
    const [replying, setReplying] = useState(false);
    const { retryMessage, discardMessage } = useChatMutations();
    const settle = (work: Promise<unknown>) => {
        void work.catch(error => toastFailure(t('toast.messageFailed'), error)).finally(retry);
    };

    return (
        <article
            ref={ref}
            aria-label={
                thread.rootOwnerName
                    ? t('threads.cardLabel', { where, owner: thread.rootOwnerName })
                    : t('threads.cardLabelNoOwner', { where })
            }
            className="flex flex-col gap-3 rounded-xl border border-hairline bg-card px-4 py-3"
        >
            <header className="flex min-w-0 items-center gap-2">
                {unread && <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-badge-unread" />}
                <span className={cn('truncate text-caption text-foreground', unread && 'font-semibold')}>{where}</span>
                {unread && <span className="sr-only">{t('threads.unread')}</span>}
                <span className="ml-auto shrink-0 text-micro tabular-nums text-muted-foreground">
                    {formatListTime(thread.lastActivityAt)}
                </span>
                <button type="button" onClick={onOpen} className={CARD_LINK}>
                    {t('threads.open')}
                </button>
            </header>
            {state.status === 'ready' ? (
                <>
                    {state.root ? (
                        channel ? (
                            <ThreadCardMessages
                                channel={channel}
                                messages={[state.root]}
                                onRetry={message => settle(retryMessage(message))}
                                onDiscard={message => settle(discardMessage(message))}
                                reactionEvents={reactionEvents}
                            />
                        ) : (
                            <ReplyLine message={state.root} author={authorOf(state.root)} />
                        )
                    ) : (
                        <p className="text-caption text-muted-foreground">
                            {t(state.rootNotice === 'beforeJoin' ? 'chat.thread.beforeJoin' : 'chat.thread.gone')}
                        </p>
                    )}
                    <div className="flex flex-col gap-3 border-l-2 border-hairline pl-3">
                        {state.earlier !== 0 && (
                            <button type="button" onClick={onOpen} className={cn(CARD_LINK, 'self-start')}>
                                {state.earlier === 'more'
                                    ? t('threads.earlierUncounted')
                                    : t('threads.earlier', { count: state.earlier })}
                            </button>
                        )}
                        {channel ? (
                            <ThreadCardMessages
                                channel={channel}
                                messages={state.replies}
                                onRetry={message => settle(retryMessage(message))}
                                onDiscard={message => settle(discardMessage(message))}
                                reactionEvents={reactionEvents}
                            />
                        ) : (
                            state.replies.map(reply => (
                                <ReplyLine
                                    key={reply.id ?? reply.tempId ?? reply.chatNo}
                                    message={reply}
                                    author={authorOf(reply)}
                                    onRetry={() => settle(retryMessage(reply))}
                                    onDiscard={() => settle(discardMessage(reply))}
                                />
                            ))
                        )}
                    </div>
                    {channel && state.root?.id ? (
                        replying ? (
                            <ThreadCardReply
                                channel={channel}
                                root={{ ...state.root, id: state.root.id }}
                                rootNo={thread.rootNo}
                                onSettled={retry}
                            />
                        ) : (
                            <button
                                type="button"
                                onClick={() => setReplying(true)}
                                className={cn(CARD_LINK, 'self-start')}
                            >
                                {t('threads.reply')}
                            </button>
                        )
                    ) : null}
                </>
            ) : state.status === 'failed' ? (
                <p role="alert" className="flex items-center gap-2 text-caption text-muted-foreground">
                    {t('chat.thread.failed')}
                    <button type="button" onClick={retry} className={CARD_LINK}>
                        {t('chat.thread.retry')}
                    </button>
                </p>
            ) : (
                <div className="flex flex-col gap-1" aria-busy="true">
                    {thread.rootOwnerName && (
                        <span className="truncate text-caption font-semibold text-foreground">
                            {thread.rootOwnerName}
                        </span>
                    )}
                    <p className="line-clamp-3 whitespace-pre-wrap break-words text-callout text-foreground">
                        {thread.rootPreview}
                    </p>
                    {thread.lastReplyPreview && (
                        <p className="line-clamp-2 text-caption text-muted-foreground">
                            <span className="font-semibold text-foreground">{thread.lastReplyOwnerName}</span>{' '}
                            {thread.lastReplyPreview}
                        </p>
                    )}
                </div>
            )}
        </article>
    );
};

export const ThreadsPage = ({ cloudId, channels, placeScope, onOpen }: ThreadsPageProps) => {
    const { t } = useTranslation();
    const threads = useMyThreadsStore(s => s.threads);
    const isScanning = useNotificationsPanelStore(s => s.scanningCid === cloudId);
    const [openOrder] = useState(
        () => new Map(threadsInScope(threads, cloudId, placeScope).map(([key], index) => [key, index]))
    );
    const listed = useMemo(
        () =>
            threadsInScope(threads, cloudId, placeScope).sort(([a, ta], [b, tb]) => {
                const ia = openOrder.get(a);
                const ib = openOrder.get(b);
                if (ia === undefined && ib === undefined) return tb.lastActivityAt - ta.lastActivityAt;
                if (ia === undefined) return -1;
                if (ib === undefined) return 1;
                return ia - ib;
            }),
        [threads, cloudId, placeScope, openOrder]
    );
    const channelById = useMemo(() => new Map(channels.map(channel => [channel.id ?? '', channel])), [channels]);

    const channelLabel = (thread: MyThread): string | undefined => {
        if (thread.channelKind && thread.channelKind !== 'channel') return undefined;
        const name = thread.channelName ?? channelById.get(thread.channelId)?.name;
        return name ? `# ${name}` : undefined;
    };

    return (
        <section aria-label={t('threads.title')} className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
            <header className={`${PANE_HEADER} px-6`}>
                <h1 className="flex min-w-0 items-baseline gap-2 text-heading text-foreground">
                    <span className="truncate">{t('threads.title')}</span>
                    <span className="shrink-0 text-caption tabular-nums text-muted-foreground">{listed.length}</span>
                </h1>
            </header>
            {listed.length === 0 ? (
                <div
                    role="status"
                    className="flex flex-1 flex-col items-center justify-center gap-2 px-8 pb-16 text-center"
                >
                    <span className="mb-3 flex h-20 w-20 items-center justify-center rounded-full bg-primary/[0.16] text-foreground">
                        <MessagesSquare size={28} aria-hidden />
                    </span>
                    <p className="text-heading text-foreground">
                        {isScanning ? t('inbox.scanning') : t('threads.empty')}
                    </p>
                    {!isScanning && (
                        <p className="max-w-xs text-caption text-muted-foreground">{t('threads.emptyHint')}</p>
                    )}
                </div>
            ) : (
                <div className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-6 py-5">
                    <p className="text-micro text-muted-foreground">{t('threads.deviceLocal')}</p>
                    {listed.map(([key, thread]) => (
                        <ThreadCard
                            key={key}
                            thread={thread}
                            channelLabel={channelLabel(thread)}
                            channel={channelById.get(thread.channelId)}
                            joinedNo={channelById.get(thread.channelId)?.$join?.joinedNo}
                            onOpen={() => onOpen(thread.channelId, undefined, thread.placeId, thread.rootNo)}
                        />
                    ))}
                </div>
            )}
        </section>
    );
};
