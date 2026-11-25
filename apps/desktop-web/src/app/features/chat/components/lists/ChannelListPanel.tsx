import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import { Hash } from 'lucide-react';

import type { DomainChannel, DomainChat } from '@chatic/runtime-react';
import { runtime } from '@chatic/runtime-react';

import { bareChannelName, messagePreview, senderNameIn, usePlaceProfilesStore } from '../../../../shared';
import { useLastChats } from '../../hooks';
import { isDmBucket, sortByRecency } from '../../utils';
import {
    ConversationList,
    ConversationRow,
    markThreadReply,
    usePickConversation,
    type SelectConversation,
} from './ConversationList';

interface ChannelListPanelProps {
    channels: DomainChannel[];
    selectedChannelId: string | null;
    onSelect: SelectConversation;
    onCreateChannel?: () => void;
    isLoading?: boolean;
}

const CHANNEL_TILE = (
    <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-well text-foreground">
        <Hash size={18} />
    </span>
);

const previewOf = (lastChat: DomainChat | undefined, sender: string, t: TFunction): string => {
    const preview = lastChat ? messagePreview(lastChat) : '';
    if (!lastChat || !preview) return t('lists.noMessages');
    return markThreadReply(lastChat, sender ? t('lists.previewFrom', { name: sender, text: preview }) : preview, t);
};

export const ChannelListPanel = ({
    channels,
    selectedChannelId,
    onSelect,
    onCreateChannel,
    isLoading = false,
}: ChannelListPanelProps) => {
    const { t } = useTranslation();
    const { userId: myUid } = runtime.session.useSessionIdentity();
    const profilesBySid = usePlaceProfilesStore(s => s.bySid);
    const [query, setQuery] = useState('');
    const rooms = useMemo(() => channels.filter(channel => channel.id && !isDmBucket(channel)), [channels]);
    const lastByChannel = useLastChats(rooms);
    const pick = usePickConversation(lastByChannel, onSelect);
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
                        preview={previewOf(
                            lastChat,
                            lastChat
                                ? senderNameIn(lastChat, profilesBySid[channel.sid ?? ''], {
                                      uid: myUid,
                                      name: '',
                                      cloudUid: channel.$join?.userId ?? null,
                                  })
                                : '',
                            t
                        )}
                        unread={channel.unreadCount ?? 0}
                        isActive={channel.id === selectedChannelId}
                        onSelect={pick}
                    />
                );
            })}
        </ConversationList>
    );
};
