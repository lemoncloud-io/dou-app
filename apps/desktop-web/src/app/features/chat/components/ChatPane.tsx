import { useTranslation } from 'react-i18next';

import { useWebCoreStore } from '@chatic/web-core';

import type { DomainChannel } from '@chatic/data';

import { useChatMutations, useChats, useReadReceipts } from '../../../shared';
import { ChannelHeaderMenu } from './ChannelHeaderMenu';
import { Composer } from './Composer';
import { MessageList } from './MessageList';

interface ChatPaneProps {
    channel: DomainChannel | undefined;
}

export const ChatPane = ({ channel }: ChatPaneProps) => {
    const { t } = useTranslation();
    const channelId = channel?.id ?? null;
    const myUid = useWebCoreStore(s => s.profile?.uid ?? null);
    const { messages, isLoading } = useChats(channelId);
    const { sendMessage, isSending } = useChatMutations();

    // Report read position while this channel is open + the window is focused.
    useReadReceipts(channelId, messages);

    if (!channelId || !channel) {
        return (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                {t('chat.empty')}
            </div>
        );
    }

    const handleSend = (content: string) => {
        void sendMessage({ channelId, content });
    };

    const memberCount = channel.memberNo ?? 0;

    return (
        <>
            <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
                <div className="flex items-baseline gap-2 truncate">
                    <span className="truncate text-sm font-semibold text-foreground">
                        <span className="text-muted-foreground">#</span> {channel.name ?? channelId}
                    </span>
                    {memberCount > 0 && (
                        <span className="shrink-0 text-xs text-muted-foreground">
                            {t('channels.settings.memberCount', { count: memberCount })}
                        </span>
                    )}
                </div>
                <ChannelHeaderMenu channel={channel} myUid={myUid} />
            </header>
            <MessageList messages={messages} isLoading={isLoading} />
            <Composer disabled={isSending} onSend={handleSend} />
        </>
    );
};
