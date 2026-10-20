import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { MessageCircle } from 'lucide-react';

import type { DomainChannel, DomainChat } from '@chatic/data';
import { runtime } from '@chatic/app-runtime';
import { placeScopeKey } from '@chatic/shared';
import { Avatar, AvatarFallback, AvatarImage } from '@chatic/ui-kit/components/ui/avatar';

import { avatarStyle, isOwnChat, isSelfChannel, messagePreview, type ResolvedDisplay } from '../../../../shared';
import { useDmIdentities, useLastChats, type DmPeerRef } from '../../hooks';
import { isDmBucket, sortByRecency } from '../../utils';
import { ConversationList, ConversationRow, PendingConversationRow } from './ConversationList';

interface DmListPanelProps {
    /** The active place's channels; only its 1:1s and my notes-to-self room are listed. */
    channels: DomainChannel[];
    selectedChannelId: string | null;
    onSelect: (channelId: string) => void;
    /** Absent where a 1:1 cannot be started (no place, or the place does not allow it). */
    onCreateDm?: () => void;
    /** While the place's channels load, an empty list is not yet an empty place. */
    isLoading?: boolean;
}

const NO_MEMBERS: DmPeerRef[] = [];

const PersonAvatar = ({ seed, display }: { seed: string; display: ResolvedDisplay }) => (
    <Avatar className="h-9 w-9 shrink-0">
        {display.thumbnail && <AvatarImage src={display.thumbnail} alt="" />}
        <AvatarFallback className="text-caption font-semibold" style={avatarStyle(seed || display.name)}>
            {display.name.charAt(0).toUpperCase() || '?'}
        </AvatarFallback>
    </Avatar>
);

/**
 * The DM destination's sidebar column: the place's 1:1s, and my notes-to-self room among them,
 * most recently active first. Each row carries the person's avatar and name, the last message (mine
 * marked as mine — in a 1:1 the other sender needs no name, and in my notes-to-self room nothing
 * needs marking), its time and the unread count. The
 * search field narrows by the person's name. Previews come from one cache observation for the
 * whole list, shared with the Channels list (`useLastChats`).
 */
export const DmListPanel = ({
    channels,
    selectedChannelId,
    onSelect,
    onCreateDm,
    isLoading = false,
}: DmListPanelProps) => {
    const { t } = useTranslation();
    const [query, setQuery] = useState('');
    const myUid = runtime.session.useSessionIdentity().userId;
    const { selectedCloudId, selectedSiteId } = runtime.session.useSessionSelection();
    const dms = useMemo(() => channels.filter(channel => channel.id && isDmBucket(channel)), [channels]);
    const { identityOf, holdSection } = useDmIdentities(
        dms,
        NO_MEMBERS,
        placeScopeKey(selectedCloudId, selectedSiteId) ?? ''
    );
    const lastByChannel = useLastChats(dms);
    const ordered = useMemo(() => sortByRecency(dms, lastByChannel), [dms, lastByChannel]);

    const previewOf = (channel: DomainChannel, lastChat: DomainChat | undefined): string => {
        const preview = lastChat ? messagePreview(lastChat) : '';
        if (!lastChat || !preview) return t('lists.noMessages');
        // In my notes-to-self room every message is mine, so none needs saying so.
        if (isSelfChannel(channel)) return preview;
        const mine = isOwnChat(lastChat, { uid: myUid, name: '', cloudUid: channel.$join?.userId });
        return mine ? t('lists.previewMine', { text: preview }) : preview;
    };

    const needle = query.trim().toLowerCase();
    const rows = ordered.flatMap(channel => {
        const identity = identityOf(channel);
        const pending = holdSection || identity.pending;
        // A search matches what the rows show: a placeholder shows no name, so it matches nothing.
        if (needle && (pending || !identity.label.toLowerCase().includes(needle))) return [];
        if (pending) return [<PendingConversationRow key={channel.id} />];
        const lastChat = lastByChannel.get(channel.id);
        return [
            <ConversationRow
                key={channel.id}
                id={channel.id}
                leading={<PersonAvatar seed={identity.seed} display={identity.display} />}
                label={identity.label}
                time={lastChat ? Number(lastChat.createdAtMs ?? lastChat.createdAt) : undefined}
                preview={previewOf(channel, lastChat)}
                unread={channel.unreadCount ?? 0}
                isActive={channel.id === selectedChannelId}
                onSelect={onSelect}
            />,
        ];
    });

    return (
        <ConversationList
            title={t('lists.dms.title')}
            create={onCreateDm && { label: t('dm.new.open'), onClick: onCreateDm }}
            search={{ label: t('lists.dms.search'), query, onChange: setQuery }}
            empty={{
                icon: <MessageCircle size={32} aria-hidden />,
                title: t('lists.dms.empty'),
                hint: t('lists.dms.emptyHint'),
            }}
            noMatch={t('lists.dms.noMatch', { query: query.trim() })}
            isEmpty={dms.length === 0}
            isLoading={isLoading}
        >
            {rows}
        </ConversationList>
    );
};
