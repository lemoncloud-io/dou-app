import { useTranslation } from 'react-i18next';

import type { DomainChannel } from '@chatic/data';
import { cn } from '@chatic/lib/utils';

interface ChannelListProps {
    channels: DomainChannel[];
    isLoading: boolean;
    selectedChannelId: string | null;
    onSelect: (channelId: string) => void;
}

export const ChannelList = ({ channels, isLoading, selectedChannelId, onSelect }: ChannelListProps) => {
    const { t } = useTranslation();

    if (isLoading) {
        return <div className="p-4 text-sm text-muted-foreground">{t('chat.loading')}</div>;
    }

    if (channels.length === 0) {
        return <div className="p-4 text-sm text-muted-foreground">{t('chat.noChannels')}</div>;
    }

    return (
        <nav className="flex flex-col gap-0.5 p-2">
            {channels.map(channel => {
                const id = channel.id ?? '';
                const isActive = id === selectedChannelId;
                return (
                    <button
                        key={id}
                        onClick={() => onSelect(id)}
                        className={cn(
                            'flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm',
                            isActive
                                ? 'bg-accent font-semibold text-accent-foreground'
                                : 'text-muted-foreground hover:bg-accent/50'
                        )}
                    >
                        <span className="text-muted-foreground">#</span>
                        <span className="truncate">{channel.name ?? id}</span>
                    </button>
                );
            })}
        </nav>
    );
};
