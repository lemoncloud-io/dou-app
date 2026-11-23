import { useTranslation } from 'react-i18next';

import { RELAY_CLOUD_ID, type ChatMentionBody, type DomainChannel, type DomainChat } from '@chatic/runtime';

import {
    chatSenderName,
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
    onSettled: () => void;
}

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
            { root: { preview: messagePreview(root), ownerName: chatSenderName(root, channel.sid, viewer) } }
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
