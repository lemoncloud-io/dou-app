import type { WebMessageData } from '@chatic/bridge-messages';

import type { SessionOwnerSwitch } from '../../services/runtime/sessionOwnerSwitch';

const isOwner = (value: unknown): value is 'web' | 'native' => value === 'web' || value === 'native';

export interface SessionOwnerHandlerDeps {
    ownerSwitch: SessionOwnerSwitch;
    /** Whether the switch is offered right now; read on every request, since debug mode can change mid-run. */
    allowed: () => boolean;
}

const notOffered = <T extends 'OnFetchSessionOwner' | 'OnSetSessionOwner'>(type: T) => ({
    type,
    success: false as const,
    error: { code: 'NOT_ALLOWED', message: 'The session owner switch is not offered by this build right now.' },
});

/**
 * The overlay's session owner switch (`FetchSessionOwner`, `SetSessionOwner`). Both answer only while
 * `allowed()` holds; otherwise they refuse with `NOT_ALLOWED`, which the overlay shows as "not offered"
 * exactly as it does a build with no handler at all.
 */
export const createSessionOwnerHandlers = ({ ownerSwitch, allowed }: SessionOwnerHandlerDeps) => ({
    handleFetchSessionOwner: async (_message: WebMessageData<'FetchSessionOwner'>) => {
        if (!allowed()) return notOffered('OnFetchSessionOwner');
        return { type: 'OnFetchSessionOwner' as const, success: true as const, data: ownerSwitch.read() };
    },
    handleSetSessionOwner: async (message: WebMessageData<'SetSessionOwner'>) => {
        if (!allowed()) return notOffered('OnSetSessionOwner');
        const owner = message.data?.owner;
        if (!isOwner(owner)) {
            return {
                type: 'OnSetSessionOwner' as const,
                success: false as const,
                error: { code: 'INVALID_OWNER', message: `Unknown session owner: ${String(owner)}` },
            };
        }
        return { type: 'OnSetSessionOwner' as const, success: true as const, data: ownerSwitch.set(owner) };
    },
});
