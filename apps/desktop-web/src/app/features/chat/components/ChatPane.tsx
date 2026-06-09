import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useWebCoreStore } from '@chatic/web-core';
import { useWebSocketV2Store } from '@chatic/socket';

import type { DomainChannel } from '@chatic/data';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import {
    displayName,
    isPlaceholderName,
    useAuthorNames,
    useChatMutations,
    useChats,
    useReadCursorStore,
    useReadReceipts,
} from '../../../shared';
import type { ChannelMember } from '../../channels';
import { useChannelSettingsStore } from '../../channels';
import { ChannelHeaderMenu } from './ChannelHeaderMenu';
import { Composer } from './Composer';
import { MessageList } from './MessageList';

interface ChatPaneProps {
    channel: DomainChannel | undefined;
    /** Roster for the open channel (lifted to HomePage so it's fetched once). */
    members: ChannelMember[];
    /** Roster still loading — message headers show a name skeleton, not "Unknown". */
    membersLoading?: boolean;
}

export const ChatPane = ({ channel, members, membersLoading }: ChatPaneProps) => {
    const { t } = useTranslation();
    const channelId = channel?.id ?? null;
    const myUid = useWebCoreStore(s => s.profile?.uid ?? null);
    // Guest accounts carry a UUID as their name — drop it so own messages fall back
    // to a friendly label ("You") instead of showing the raw UUID.
    const rawMyName = useWebCoreStore(s => s.profile?.$user?.name ?? '');
    const myName = isPlaceholderName(rawMyName) ? '' : rawMyName;
    // My cloud user id for this channel: the server rewrites my own messages'
    // ownerId from my account id to this once they persist, so it also identifies
    // my messages (and my optimistic→persisted swap) — see resolveOwnerName.
    const cloudUid = channel?.$join?.userId ?? null;
    const viewer = useMemo(() => ({ uid: myUid, name: myName, cloudUid }), [myUid, myName, cloudUid]);
    const { messages, isLoading, loadOlder, hasMore, isLoadingOlder } = useChats(channelId);
    const { sendMessage, retryMessage, isSending } = useChatMutations();
    const openSettings = useChannelSettingsStore(s => s.open);
    const isVerified = useWebSocketV2Store(s => s.isVerified);
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
    const memberNames = useMemo(() => {
        const map = new Map<string, string>();
        for (const member of members) {
            const name = displayName(member);
            // displayName falls back to the id — skip so a raw id never shows as a name.
            if (name && name !== member.id) map.set(member.id, name);
        }
        for (const [id, name] of cachedNames) map.set(id, name);
        return map;
    }, [members, cachedNames]);

    // Report read position while this channel is open + the window is focused.
    useReadReceipts(channelId, messages);

    if (!channelId || !channel) {
        return (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-2xl font-semibold text-primary">
                    #
                </div>
                <p className="text-sm font-medium text-foreground">{t('chat.empty')}</p>
                <p className="max-w-xs text-xs text-muted-foreground">{t('chat.emptyHint')}</p>
            </div>
        );
    }

    const handleSend = (content: string) => {
        setSendTick(tick => tick + 1);
        void sendMessage({ channelId, content }).catch(() =>
            toast({ variant: 'destructive', description: t('toast.messageFailed') })
        );
    };

    const memberCount = channel.memberNo ?? 0;
    const desc = channel.desc?.trim();

    return (
        <>
            <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
                <button
                    type="button"
                    onClick={() => openSettings(channelId)}
                    title={t('chat.header.settings')}
                    className="flex min-w-0 items-center gap-2 rounded-md py-1 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-sm font-bold text-primary">
                        #
                    </span>
                    <span className="truncate text-base font-bold text-foreground">{channel.name ?? channelId}</span>
                    {desc && <span className="truncate text-xs text-muted-foreground">{desc}</span>}
                    {memberCount > 0 && (
                        <span className="shrink-0 border-l border-border pl-2 text-xs tabular-nums text-muted-foreground">
                            {t('channels.settings.memberCount', { count: memberCount })}
                        </span>
                    )}
                </button>
                <div className="flex shrink-0 items-center gap-2">
                    {!isVerified && (
                        <span className="flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500 motion-reduce:animate-none" />
                            {t('chat.connecting')}
                        </span>
                    )}
                    <ChannelHeaderMenu channel={channel} myUid={myUid} />
                </div>
            </header>
            <MessageList
                key={channelId}
                messages={messages}
                isLoading={isLoading}
                viewer={viewer}
                names={memberNames}
                membersLoading={membersLoading}
                baselineReadNo={baselineReadNo}
                onRetry={retryMessage}
                onLoadOlder={() => void loadOlder()}
                hasMore={hasMore}
                isLoadingOlder={isLoadingOlder}
                scrollSignal={sendTick}
            />
            <Composer
                disabled={isSending}
                onSend={handleSend}
                channelId={channelId}
                placeholder={t('chat.composer.placeholderChannel', { name: channel.name ?? channelId })}
            />
        </>
    );
};
