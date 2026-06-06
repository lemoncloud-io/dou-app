import { useTranslation } from 'react-i18next';

import type { DomainChannel } from '@chatic/data';

import { useChatMutations, useChats } from '../../../shared';
import { Composer } from './Composer';
import { MessageList } from './MessageList';

interface ChatPaneProps {
    channel: DomainChannel | undefined;
}

export const ChatPane = ({ channel }: ChatPaneProps) => {
    const { t } = useTranslation();
    const channelId = channel?.id ?? null;
    const { messages, isLoading } = useChats(channelId);
    const { sendMessage, isSending } = useChatMutations();

    if (!channelId) {
        return (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                {t('chat.empty')}
            </div>
        );
    }

    const handleSend = (content: string) => {
        void sendMessage({ channelId, content });
    };

    return (
        <>
            <header className="flex h-12 shrink-0 items-center border-b border-border px-4">
                <span className="text-sm font-semibold text-foreground">
                    <span className="text-muted-foreground">#</span> {channel?.name ?? channelId}
                </span>
            </header>
            <MessageList messages={messages} isLoading={isLoading} />
            <Composer disabled={isSending} onSend={handleSend} />
        </>
    );
};
