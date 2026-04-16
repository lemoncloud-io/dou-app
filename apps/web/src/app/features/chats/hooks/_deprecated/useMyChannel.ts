import { useMyChannels } from '../../../home/hooks/useMyChannels';

/**
 * @deprecated deprecated by raine; 신규 훅으로 대체
 */
export const useMyChannel = (channelId: string | null) => {
    const { channels, isLoading, isError } = useMyChannels();

    if (!channelId) {
        return { channel: null, isLoading, isError };
    }

    const channel = channels.find(ch => ch.id === channelId) || null;

    return { channel, isLoading, isError };
};
