import { useCallback, useEffect, useState } from 'react';

import { useWebSocketV2, useWebSocketV2Store } from '@chatic/socket';

import type { JoinView, UserView } from '@lemoncloud/chatic-socials-api';
import type { WSSEnvelope } from '@lemoncloud/chatic-sockets-api';

/** Extended UserView with embedded $join info */
interface ChannelMemberView extends UserView {
    $join?: JoinView;
}

interface ChannelMembersResponse {
    list: ChannelMemberView[];
    total?: number;
}

interface UseChannelMembersOptions {
    limit?: number;
    page?: number;
    detail?: boolean;
}

export const useChannelMembers = (channelId: string | null, options: UseChannelMembersOptions = {}) => {
    const { emitAuthenticated } = useWebSocketV2();
    const [members, setMembers] = useState<ChannelMemberView[]>([]);
    const [total, setTotal] = useState<number>(0);
    const [isLoading, setIsLoading] = useState(false);
    const [isError, setIsError] = useState(false);

    const { limit = 100, page = 0, detail = true } = options;

    const fetchMembers = useCallback(() => {
        if (!channelId) return;

        setIsLoading(true);
        setIsError(false);

        const unsub = useWebSocketV2Store.subscribe(
            s => s.lastMessage,
            (envelope: WSSEnvelope<ChannelMembersResponse> | null) => {
                if (envelope?.type !== 'chat') return;
                if (envelope.action === 'error') {
                    unsub();
                    setIsLoading(false);
                    setIsError(true);
                    return;
                }
                if (envelope.action !== 'users') return;
                unsub();
                setIsLoading(false);
                const response = envelope.payload as ChannelMembersResponse;
                setMembers(response.list ?? []);
                setTotal(response.total ?? response.list?.length ?? 0);
            }
        );

        emitAuthenticated({
            type: 'chat',
            action: 'users',
            payload: { channelId, limit, page, detail },
        });
    }, [channelId, limit, page, detail, emitAuthenticated]);

    useEffect(() => {
        fetchMembers();
    }, [fetchMembers]);

    return {
        members,
        total,
        isLoading,
        isError,
        refetch: fetchMembers,
    };
};
