import { useTranslation } from 'react-i18next';

import { RELAY_CLOUD_ID, type ChatMentionBody, type DomainChannel, type DomainChat } from '@chatic/data';

import {
    messagePreview,
    outgoingMessagePreview,
    threadChannel,
    toastFailure,
    useMyThreadsStore,
} from '../../../shared';
import { useChatMutations } from '../../../shared/hooks/useChatMutations';
import { useChannelMembers } from '../../channels';
import { useMentionables } from '../hooks/useMentionables';
import { useMessageViewer } from '../hooks/useMessageViewer';
import { LazyComposer } from './LazyComposer';

interface ThreadCardReplyProps {
    channel: DomainChannel;
    root: DomainChat & { id: string };
    rootNo: string;
    /** Read the card again: the send has written its row to the cache, or settled. */
    onSettled: () => void;
}

/**
 * A Threads page card's reply box. Mounted only once the reader asks to reply, so a page of cards does
 * not hold an editor — or fetch a roster — each. Text only: a file reply goes through the thread panel.
 * The @ list is the card's own room, read here rather than handed down: the page shows threads from
 * every room of the place, and the members the sidebar holds are the selected room's. The reply shows
 * on the card as the cache's own row for it — pending, then sent or failed — so the card says what the
 * room would.
 */
export const ThreadCardReply = ({ channel, root, rootNo, onSettled }: ThreadCardReplyProps) => {
    const { t } = useTranslation();
    const channelId = channel.id ?? '';
    const cid = channel.cid || RELAY_CLOUD_ID;
    const viewer = useMessageViewer(channel);
    const { members } = useChannelMembers(channelId, channel.ownerId);
    const mentionables = useMentionables(members, viewer, channel);
    const record = useMyThreadsStore(s => s.record);
    const { sendMessage } = useChatMutations();

    const handleSend = (content: string, _files: File[], mention?: ChatMentionBody) => {
        if (!content) return;
        // The server takes the root's full id, as the thread panel's composer does. The mention is who
        // the reader picked: the server reads it, never the text, to decide who is told.
        void sendMessage(cid, { channelId, content, parentId: root.id, ...(mention ? { mention } : {}) })
            .catch(error => toastFailure(t('toast.messageFailed'), error))
            .finally(onSettled);
        record(
            {
                cid,
                channelId,
                placeId: channel.sid,
                ...threadChannel(channel),
                rootNo,
                replyNo: 0,
                preview: outgoingMessagePreview(content, []),
                ownerName: viewer.name,
                at: Date.now(),
                mine: true,
            },
            { root: { preview: messagePreview(root), ownerName: root.owner$?.name ?? '' } }
        );
    };

    return (
        <LazyComposer
            onSend={handleSend}
            channelId={`${channelId}::threads-page::${rootNo}`}
            placeholder={t('chat.thread.composerPlaceholder')}
            mentionables={mentionables}
            autoFocus
            compact
        />
    );
};
