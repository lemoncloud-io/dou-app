import { useCallback, useState } from 'react';

import type { ChatStartPayload } from '@lemoncloud/chatic-sockets-api';

import type { DomainChannel } from '@chatic/data';
import { useRepositories } from '@chatic/app-runtime';

/**
 * Thin desktop channel-write hook.
 *
 * WHY HERE (not libs/app-runtime): the engine already exposes the channel
 * repository via useRepositories(); apps/web wraps it in its own feature-level
 * useChannelMutations. We mirror that app-side convention rather than widen the
 * shared engine surface for a single create call. Scope is intentionally
 * minimal (create only) — leave/delete/invite/update are deferred until the
 * desktop UI needs them.
 */
export const useDesktopChannelMutations = () => {
    const { channel: channelRepository } = useRepositories();
    const [isCreating, setIsCreating] = useState(false);

    const createChannel = useCallback(
        (payload: ChatStartPayload): Promise<DomainChannel> => {
            if (!payload.stereo) return Promise.reject(new Error('stereo is required'));
            setIsCreating(true);
            return channelRepository.createChannel(payload).finally(() => setIsCreating(false));
        },
        [channelRepository]
    );

    return { createChannel, isCreating };
};
