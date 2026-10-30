import { useEffect, useRef, useState } from 'react';

import { runtime } from '@chatic/app-runtime';
import type { DomainChannel, DomainChat } from '@chatic/data';

import { CopyButton } from '../../components/CopyButton';
import { Section } from '../../components/Section';
import { useRoomScreenStrings } from '../../i18n/screens/RoomScreen';
import {
    findInspectorRow,
    listInspectorRows,
    summarizeChat,
    toRawJson,
    type RoomInspectorScope,
} from '../../lib/roomInspector';
import { useDebugObservation, type DebugRoomObservation } from '../sharedObservationStore';

// Room inspector: the open room's (or thread's) channel and messages as raw JSON, next to the cache
// row and a fresh server copy of the same record. Tracing a wrong bubble means telling apart three
// copies — what the screen holds, what the cache holds, what the server says — and the DB browser
// reaches only the cache, and only by typing a channel id.
//
// The page publishes what it holds into the mirror (`useDebugRoomMirror`); this screen never opens
// its own observation, for the same reason the Unread screen does not: a second read could disagree
// with the screen in exactly the case being traced.
export const RoomScreen = () => {
    const t = useRoomScreenStrings();
    const { room: current, roomFocus } = useDebugObservation();

    if (!current) return <p className="p-4 text-xs text-muted-foreground">{t.noRoom}</p>;

    const focusId =
        roomFocus?.surface === current.surface && roomFocus.channelId === current.channelId
            ? roomFocus.messageId
            : null;

    // Keyed by what is open, so a page moving to another channel without unmounting (a push tap while
    // already in a room) drops the lookups fetched for the previous one instead of showing them beside
    // the new channel.
    return (
        <div key={`${current.surface}:${current.channelId}`} className="space-y-3 p-4">
            <div className="flex items-center gap-2">
                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    {t.surface[current.surface]}
                </span>
                <span className="truncate font-mono text-[11px] text-muted-foreground">{current.channelId}</span>
                <div className="ml-auto">
                    <CopyButton value={() => toRawJson(current)} label={t.copyAll} />
                </div>
            </div>

            <Section title={t.channel.title}>
                {current.channel ? (
                    <ChannelRecord channel={current.channel} />
                ) : (
                    <p className="text-xs text-muted-foreground">{t.channel.missing}</p>
                )}
            </Section>

            {focusId && <FocusSection observation={current} focusId={focusId} />}

            <MessageList observation={current} focusId={focusId} />
        </div>
    );
};

const FocusSection = ({ observation, focusId }: { observation: DebugRoomObservation; focusId: string }) => {
    const t = useRoomScreenStrings();
    const row = findInspectorRow(observation, focusId);
    const ref = useRef<HTMLDivElement>(null);

    // A new long-press brings its message into view; the panel may have been scrolled down the list.
    useEffect(() => {
        ref.current?.scrollIntoView?.({ block: 'nearest' });
    }, [focusId]);

    return (
        <div ref={ref}>
            <Section title={t.focus.title}>
                {row ? (
                    <ChatRecord key={row.id} chat={row} />
                ) : (
                    <p className="text-xs text-muted-foreground">{t.focus.missing(focusId)}</p>
                )}
            </Section>
        </div>
    );
};

const MessageList = ({ observation, focusId }: { observation: DebugRoomObservation; focusId: string | null }) => {
    const t = useRoomScreenStrings();
    const [scope, setScope] = useState<RoomInspectorScope>('rendered');
    const [query, setQuery] = useState('');
    const { rows, total } = listInspectorRows(observation, scope, query);

    return (
        <Section title={t.messages.title(rows.length, total)}>
            <div className="flex gap-1">
                {(['rendered', 'rows'] as const).map(key => (
                    <button
                        key={key}
                        type="button"
                        aria-pressed={scope === key}
                        onClick={() => setScope(key)}
                        className={`rounded-full px-2.5 py-1 text-[12px] ${
                            scope === key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                        }`}
                    >
                        {t.messages[key](observation[key].length)}
                    </button>
                ))}
            </div>
            <input
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder={t.messages.search}
                aria-label={t.messages.search}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
            />
            {rows.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t.messages.empty}</p>
            ) : (
                <div className="space-y-1">
                    {rows.map(chat => (
                        <MessageItem key={chat.id} chat={chat} isFocused={chat.id === focusId} />
                    ))}
                </div>
            )}
        </Section>
    );
};

const MessageItem = ({ chat, isFocused }: { chat: DomainChat; isFocused: boolean }) => {
    const t = useRoomScreenStrings();
    const [expanded, setExpanded] = useState(false);
    const { label, flags, stereo } = summarizeChat(chat);
    // The stereo is the server's own value, shown as data rather than translated.
    const badges = [...flags.map(flag => t.flags[flag]), ...(stereo ? [stereo] : [])];

    return (
        <div className={`rounded-lg border text-xs ${isFocused ? 'border-primary' : 'border-border'} bg-card`}>
            <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setExpanded(value => !value)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left"
            >
                <span className="shrink-0">{expanded ? '▼' : '▶'}</span>
                <span className="truncate">{label}</span>
                {badges.map(badge => (
                    <span key={badge} className="shrink-0 rounded bg-muted px-1 text-[10px] text-muted-foreground">
                        {badge}
                    </span>
                ))}
            </button>
            {expanded && (
                <div className="border-t border-border px-3 py-2">
                    <ChatRecord chat={chat} />
                </div>
            )}
        </div>
    );
};

const ChatRecord = ({ chat }: { chat: DomainChat }) => (
    <RawRecord
        value={chat}
        readCache={() => runtime.data.getCloudRepositories(chat.cid ?? '').chat.cacheRead(chat.id)}
        // A row with no chat number exists only on this device; the server has nothing to answer with.
        readServer={
            chat.chatNo ? () => runtime.data.getCloudRepositories(chat.cid ?? '').chat.getChat({ id: chat.id }) : null
        }
    />
);

const ChannelRecord = ({ channel }: { channel: DomainChannel }) => (
    <RawRecord
        value={channel}
        readCache={() => runtime.data.getCloudRepositories(channel.cid ?? '').channel.cacheRead(channel.id)}
        readServer={() =>
            runtime.data
                .getCloudRepositories(channel.cid ?? '')
                .channel.refreshOneInCloud(channel.id, channel.sid ?? '')
        }
    />
);

type Lookup = { state: 'loading' } | { state: 'done'; value: unknown } | { state: 'failed'; message: string };

/**
 * One record three ways: the value the screen holds, always shown, and the cache and server copies,
 * each fetched only when asked for — a server read is a real request, and the panel stays quiet
 * until someone wants it.
 */
const RawRecord = ({
    value,
    readCache,
    readServer,
}: {
    value: unknown;
    readCache: () => Promise<unknown>;
    readServer: (() => Promise<unknown>) | null;
}) => {
    const t = useRoomScreenStrings();
    const [cache, setCache] = useState<Lookup | null>(null);
    const [server, setServer] = useState<Lookup | null>(null);

    const run = (read: () => Promise<unknown>, set: (lookup: Lookup) => void) => {
        set({ state: 'loading' });
        read().then(
            result => set({ state: 'done', value: result }),
            (error: unknown) =>
                set({ state: 'failed', message: error instanceof Error ? error.message : String(error) })
        );
    };

    return (
        <div className="space-y-2">
            <JsonBlock title={t.record.held} json={toRawJson(value)} />
            <div className="flex flex-wrap gap-1">
                <button
                    type="button"
                    // Disabled while in flight, so a slower earlier answer cannot land over a newer one.
                    disabled={cache?.state === 'loading'}
                    onClick={() => run(readCache, setCache)}
                    className="rounded-full bg-muted px-2.5 py-1 text-[12px] text-muted-foreground disabled:opacity-50"
                >
                    {t.record.cache}
                </button>
                {readServer && (
                    <button
                        type="button"
                        disabled={server?.state === 'loading'}
                        onClick={() => run(readServer, setServer)}
                        className="rounded-full bg-muted px-2.5 py-1 text-[12px] text-muted-foreground disabled:opacity-50"
                    >
                        {t.record.server}
                    </button>
                )}
            </div>
            {cache && <LookupBlock title={t.record.cache} lookup={cache} />}
            {server && <LookupBlock title={t.record.server} lookup={server} />}
            {server && <p className="text-[11px] text-muted-foreground">{t.record.serverWritesCache}</p>}
        </div>
    );
};

const LookupBlock = ({ title, lookup }: { title: string; lookup: Lookup }) => {
    const t = useRoomScreenStrings();
    if (lookup.state === 'loading') return <p className="text-xs text-muted-foreground">{t.record.loading}</p>;
    if (lookup.state === 'failed') return <p className="text-xs text-destructive">{t.record.failed(lookup.message)}</p>;
    if (lookup.value === null || lookup.value === undefined) {
        return <p className="text-xs text-muted-foreground">{t.record.notCached}</p>;
    }
    return <JsonBlock title={title} json={toRawJson(lookup.value)} />;
};

const JsonBlock = ({ title, json }: { title: string; json: string }) => (
    <div className="rounded-md border border-border">
        <div className="flex items-center justify-between px-2 py-1">
            <span className="text-[11px] font-semibold text-muted-foreground">{title}</span>
            <CopyButton value={() => json} />
        </div>
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all border-t border-border px-2 py-1 font-mono text-[10px] text-muted-foreground">
            {json}
        </pre>
    </div>
);
