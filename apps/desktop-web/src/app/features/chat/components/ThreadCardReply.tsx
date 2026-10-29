import { useTranslation } from 'react-i18next';

import { RELAY_CLOUD_ID, type DomainChannel, type DomainChat } from '@chatic/data';

import {
    messagePreview,
    outgoingMessagePreview,
    threadChannel,
    toastFailure,
    useMyThreadsStore,
} from '../../../shared';
import { useChatMutations } from '../../../shared/hooks/useChatMutations';
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
 * not hold an editor each. Text only — a file reply, and @ suggestions that need the room's members, go
 * through the thread panel. The reply shows on the card as the cache's own row for it — pending, then
 * sent or failed — so the card says what the room would.
 */
export const ThreadCardReply = ({ channel, root, rootNo, onSettled }: ThreadCardReplyProps) => {
    const { t } = useTranslation();
    const channelId = channel.id ?? '';
    const cid = channel.cid || RELAY_CLOUD_ID;
    const viewer = useMessageViewer(channel);
    const record = useMyThreadsStore(s => s.record);
    const { sendMessage } = useChatMutations();

    const handleSend = (content: string, files: File[]) => {
        if (!content) return;
        // The server takes the root's full id, as the thread panel's composer does.
        void sendMessage(cid, { channelId, content, parentId: root.id })
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
                preview: outgoingMessagePreview(content, files),
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
            autoFocus
            compact
        />
    );
};
