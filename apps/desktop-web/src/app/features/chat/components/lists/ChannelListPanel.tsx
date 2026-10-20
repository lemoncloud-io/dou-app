import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import { Hash } from 'lucide-react';

import type { DomainChannel, DomainChat } from '@chatic/data';

import { bareChannelName, messagePreview } from '../../../../shared';
import { useLastChats } from '../../hooks';
import { isDmBucket, sortByRecency } from '../../utils';
import { ConversationList, ConversationRow } from './ConversationList';

interface ChannelListPanelProps {
    /** The active place's channels; its DMs are left to the DM list. */
    channels: DomainChannel[];
    selectedChannelId: string | null;
    onSelect: (channelId: string) => void;
    /** Absent where channels cannot be created (the default cloud, a guest). */
    onCreateChannel?: () => void;
    /** While the place's channels load, an empty list is not yet an empty place. */
    isLoading?: boolean;
}

/** Module-level so its identity is stable and the memo'd rows can skip re-rendering. */
const CHANNEL_TILE = (
    <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-well text-foreground">
        <Hash size={18} />
    </span>
);

/** A channel's preview line: who said the last message and what, or that there is none. */
const previewOf = (lastChat: DomainChat | undefined, t: TFunction): string => {
    const preview = lastChat ? messagePreview(lastChat) : '';
    if (!preview) return t('lists.noMessages');
    const sender = lastChat?.owner$?.name;
    return sender ? t('lists.previewFrom', { name: sender, text: preview }) : preview;
};

/**
 * The Channels destination's sidebar column: the place's channels, most recently active first,
 * each with its last message, its time and its unread count, filtered by name from the search
 * field. Previews come from one cache observation for the whole list (`useLastChats`).
 */
export const ChannelListPanel = ({
    channels,
    selectedChannelId,
    onSelect,
    onCreateChannel,
    isLoading = false,
}: ChannelListPanelProps) => {
    const { t } = useTranslation();
    const [query, setQuery] = useState('');
    const rooms = useMemo(() => channels.filter(channel => channel.id && !isDmBucket(channel)), [channels]);
    const lastByChannel = useLastChats(rooms);
    const ordered = useMemo(() => sortByRecency(rooms, lastByChannel), [rooms, lastByChannel]);
    const needle = query.trim().toLowerCase();
    const shown = needle
        ? ordered.filter(channel => bareChannelName(channel.name).toLowerCase().includes(needle))
        : ordered;

    return (
        <ConversationList
            title={t('lists.channels.title')}
            create={onCreateChannel && { label: t('lists.channels.create'), onClick: onCreateChannel }}
            search={{ label: t('lists.channels.search'), query, onChange: setQuery }}
            empty={{
                icon: <Hash size={32} aria-hidden />,
                title: t('lists.channels.empty'),
                hint: t('lists.channels.emptyHint'),
            }}
            noMatch={t('lists.channels.noMatch', { query: query.trim() })}
            isEmpty={rooms.length === 0}
            isLoading={isLoading}
        >
            {shown.map(channel => {
                const lastChat = lastByChannel.get(channel.id);
                return (
                    <ConversationRow
                        key={channel.id}
                        id={channel.id}
                        leading={CHANNEL_TILE}
                        label={bareChannelName(channel.name)}
                        time={lastChat ? Number(lastChat.createdAtMs ?? lastChat.createdAt) : undefined}
                        preview={previewOf(lastChat, t)}
                        unread={channel.unreadCount ?? 0}
                        isActive={channel.id === selectedChannelId}
                        onSelect={onSelect}
                    />
                );
            })}
        </ConversationList>
    );
};
