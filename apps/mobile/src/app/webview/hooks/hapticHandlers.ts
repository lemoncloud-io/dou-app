import type { HapticKind, WebMessageData } from '@chatic/app-messages';

import type { IHapticBridge } from '../../bridge';

const KINDS: readonly HapticKind[] = ['selection', 'impact'];

export const createHapticHandlers = (haptic: IHapticBridge) => {
    /**
     * The web's first haptic is a request, and the answer is how it tells this shell from one built
     * before the message (which answers `NOT_FOUND`). Every later one is a post — no `refId`, nobody
     * waiting — and gets no answer, since a reply would cost a UI-thread trip mid-gesture for nothing.
     */
    const handleTriggerHaptic = async (message: WebMessageData<'TriggerHaptic'>) => {
        const kind = message.data?.kind;
        const answered = !!message.refId;
        if (!KINDS.includes(kind)) {
            if (!answered) return undefined;
            return {
                type: 'OnTriggerHaptic' as const,
                success: false,
                error: { code: 'INVALID_KIND', message: `Unknown haptic kind: ${String(kind)}` },
            };
        }
        haptic.trigger(kind);
        if (!answered) return undefined;
        return { type: 'OnTriggerHaptic' as const, success: true, data: {} };
    };

    return { handleTriggerHaptic };
};
