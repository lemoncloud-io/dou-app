import type { WebMessageData } from '@chatic/bridge-messages';

import type { IHapticBridge } from '../../bridge';
import { HAPTIC_KINDS } from '../../bridge/hapticKinds';

export const createHapticHandlers = (haptic: IHapticBridge) => {
    const handleTriggerHaptic = async (message: WebMessageData<'TriggerHaptic'>) => {
        const kind = message.data?.kind;
        const answered = !!message.refId;
        if (!HAPTIC_KINDS.includes(kind)) {
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
