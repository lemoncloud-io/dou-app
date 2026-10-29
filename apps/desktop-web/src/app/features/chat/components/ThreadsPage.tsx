import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';

import { MessagesSquare } from 'lucide-react';

import type { DomainChannel, DomainChat } from '@chatic/data';
import { cn } from '@chatic/lib/utils';

import {
    PANE_HEADER,
    formatListTime,
    isThreadUnread,
    messagePreview,
    threadsInScope,
    useMyThreadsStore,
    useNotificationsPanelStore,
    type MyThread,
} from '../../../shared';
import { useThreadCard } from '../hooks/useThreadCard';

const CARD_LINK =
    'focus-ring tactile shrink-0 rounded-md px-2 py-1 text-micro font-medium text-foreground transition-colors ease-tactile hover:bg-accent';

interface ThreadsPageProps {
    /** The active cloud: only its threads are listed. */
    cloudId: string;
    /** Loaded channels (active place) — name a card's channel when the record kept no name. */
    channels: DomainChannel[];
    /** Places whose threads are listed — the active place, or every place on the Default Cloud. */
    placeScope: ReadonlySet<string>;
    /** Open the thread in its channel and place — the same open a saved reply uses. */
    onOpen: (channelId: string, chatNo: number | undefined, placeId: string | undefined, rootNo: string) => void;
}

interface ThreadCardProps {
    thread: MyThread;
    channelLabel: string | undefined;
    /** My join in the thread's channel, when this place lists it. */
    joinedNo?: number;
    onOpen: () => void;
}

/** How long a card stays on screen before its thread counts as looked at — a scroll past is not a read. */
const SEEN_DWELL_MS = 1000;

const ReplyLine = ({ message }: { message: DomainChat }) => (
    <div className="flex flex-col gap-0.5">
        <span className="flex items-baseline gap-2">
            <span className="truncate text-caption font-semibold text-foreground">{message.owner$?.name ?? ''}</span>
            {message.createdAt !== undefined && (
                <span className="shrink-0 text-micro tabular-nums text-muted-foreground">
                    {formatListTime(message.createdAt)}
                </span>
            )}
        </span>
        <p className="line-clamp-4 whitespace-pre-wrap break-words text-callout text-foreground">
            {messagePreview(message)}
        </p>
    </div>
);

/** Whether `ref` intersects the viewport grown by `rootMargin`. */
const useIntersecting = (ref: RefObject<Element | null>, rootMargin: string): boolean => {
    const [intersecting, setIntersecting] = useState(false);
    useEffect(() => {
        const node = ref.current;
        if (!node) return;
        const observer = new IntersectionObserver(([entry]) => setIntersecting(entry.isIntersecting), { rootMargin });
        observer.observe(node);
        return () => observer.disconnect();
    }, [ref, rootMargin]);
    return intersecting;
};

const ThreadCard = ({ thread, channelLabel, joinedNo, onOpen }: ThreadCardProps) => {
    const { t } = useTranslation();
    const markSeen = useMyThreadsStore(s => s.markSeen);
    const ref = useRef<HTMLElement>(null);
    // Read a little ahead of the screen so a card is filled by the time it scrolls in — once: scrolling
    // back to it is not news; a new reply (`lastReplyNo`) is what reads it again.
    const near = useIntersecting(ref, '200px 0px');
    const [read, setRead] = useState(false);
    if (near && !read) setRead(true);
    // Seen counts only the screen itself.
    const onScreen = useIntersecting(ref, '0px');

    const unread = isThreadUnread(thread);
    useEffect(() => {
        if (!onScreen || !unread) return;
        const timer = setTimeout(() => markSeen(thread.cid, thread.channelId, thread.rootNo), SEEN_DWELL_MS);
        return () => clearTimeout(timer);
    }, [onScreen, unread, markSeen, thread.cid, thread.channelId, thread.rootNo]);

    const { state, retry } = useThreadCard({
        cid: thread.cid,
        channelId: thread.channelId,
        rootNo: thread.rootNo,
        lastReplyNo: thread.lastReplyNo,
        joinedNo,
        enabled: read,
    });
    const where = channelLabel ?? t('threads.dm');

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
                        <ReplyLine message={state.root} />
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
                        {state.replies.map(reply => (
                            <ReplyLine key={reply.id ?? reply.chatNo} message={reply} />
                        ))}
                    </div>
                </>
            ) : state.status === 'failed' ? (
                <p role="alert" className="flex items-center gap-2 text-caption text-muted-foreground">
                    {t('chat.thread.failed')}
                    <button type="button" onClick={retry} className={CARD_LINK}>
                        {t('chat.thread.retry')}
                    </button>
                </p>
            ) : (
                // Until the card's messages are read, the record's own previews stand in.
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

/**
 * The Threads page, in the main pane: the threads I take part in (the device-local my-threads list),
 * unread first, each as its root and newest replies. A card's open hands the thread to the host, whose
 * open closes the page.
 */
export const ThreadsPage = ({ cloudId, channels, placeScope, onOpen }: ThreadsPageProps) => {
    const { t } = useTranslation();
    const threads = useMyThreadsStore(s => s.threads);
    const isScanning = useNotificationsPanelStore(s => s.scanningCid === cloudId);
    // Unread when the page opened: a thread read while the page is open keeps its place, not jumping down.
    const [unreadAtOpen] = useState(
        () => new Set(Object.entries(threads).flatMap(([key, thread]) => (isThreadUnread(thread) ? [key] : [])))
    );
    const listed = useMemo(
        () =>
            threadsInScope(threads, cloudId, placeScope).sort(([a, ta], [b, tb]) => {
                const pinned = Number(unreadAtOpen.has(b)) - Number(unreadAtOpen.has(a));
                if (pinned) return pinned;
                // Within the pinned group, reading a thread must not move it: order by activity alone.
                return unreadAtOpen.has(a) ? tb.lastActivityAt - ta.lastActivityAt : 0;
            }),
        [threads, cloudId, placeScope, unreadAtOpen]
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
                            joinedNo={channelById.get(thread.channelId)?.$join?.joinedNo}
                            onOpen={() => onOpen(thread.channelId, undefined, thread.placeId, thread.rootNo)}
                        />
                    ))}
                </div>
            )}
        </section>
    );
};
