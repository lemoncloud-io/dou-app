import { AgentToolError } from './errors';
import type { Limiter } from './limiter';
import { allowsRoom } from './settings';
import type { Settings } from './settings';

export type Action = { kind: 'read' } | { kind: 'readRoom'; channelId: string } | { kind: 'write'; channelId: string };

export interface Denial {
    code: string;
    message: string;
}

const deny = (code: string, message: string): Denial => ({ code, message });

export const authorize = (settings: Settings, action: Action, limiter: Limiter, now: number): Denial | null => {
    if (settings.tier === 'off') {
        return deny('tier_off', 'Agent access is off. The owner turns it on from the app, never through a tool.');
    }
    if (action.kind === 'read') return null;
    if (action.kind === 'readRoom') {
        return allowsRoom(settings, action.channelId)
            ? null
            : deny('room_not_allowed', `Room ${action.channelId} is not on the allow-list, so it was not read.`);
    }
    if (settings.tier === 'read') {
        return deny('tier_read_only', 'The permission tier is read only, so writes are refused.');
    }
    if (!allowsRoom(settings, action.channelId)) {
        return deny('room_not_allowed', `Room ${action.channelId} is not on the allow-list, so nothing was sent.`);
    }
    if (!limiter.tryAcquire(settings.rateLimit, now)) {
        return deny('rate_limited', 'Too many writes. Wait before sending again.');
    }
    return null;
};

export const assertAuthorized = (settings: Settings, action: Action, limiter: Limiter, now: number): void => {
    const denial = authorize(settings, action, limiter, now);
    if (denial) throw new AgentToolError(denial.code, denial.message);
};
