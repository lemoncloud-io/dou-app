import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { MessageCircle } from 'lucide-react';

import type { DomainChannel, DomainChat } from '@chatic/runtime-react';
import { runtime } from '@chatic/runtime-react';
import { placeScopeKey } from '@chatic/shared';
import { Avatar, AvatarFallback, AvatarImage } from '@chatic/ui-kit';

import { avatarStyle, isOwnChat, isSelfChannel, messagePreview, type ResolvedDisplay } from '../../../../shared';
import { useDmIdentities, useLastChats, type DmPeerRef } from '../../hooks';
import { isDmBucket, sortByRecency } from '../../utils';
import {
    ConversationList,
    ConversationRow,
    PendingConversationRow,
    markThreadReply,
    usePickConversation,
    type SelectConversation,
} from './ConversationList';

interface DmListPanelProps {
    channels: DomainChannel[];
    selectedChannelId: string | null;
    onSelect: SelectConversation;
    onCreateDm?: () => void;
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
    const pick = usePickConversation(lastByChannel, onSelect);
    const ordered = useMemo(() => sortByRecency(dms, lastByChannel), [dms, lastByChannel]);

    const previewOf = (channel: DomainChannel, lastChat: DomainChat | undefined): string => {
        const preview = lastChat ? messagePreview(lastChat) : '';
        if (!lastChat || !preview) return t('lists.noMessages');
        const mine =
            !isSelfChannel(channel) && isOwnChat(lastChat, { uid: myUid, name: '', cloudUid: channel.$join?.userId });
        return markThreadReply(lastChat, mine ? t('lists.previewMine', { text: preview }) : preview, t);
    };

    const needle = query.trim().toLowerCase();
    const rows = ordered.flatMap(channel => {
        const identity = identityOf(channel);
        const pending = holdSection || identity.pending;
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
                onSelect={pick}
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
