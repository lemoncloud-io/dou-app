import type { SessionCommands } from '../session/commands';
import { SESSION_COMMAND_METHODS } from '../bridge/contract';

export const fakeSessionCommands = (commands: Partial<SessionCommands> = {}): SessionCommands => {
    const unexpected = Object.fromEntries(
        SESSION_COMMAND_METHODS.map(method => [
            method,
            () => Promise.reject(new Error(`[fakeSessionCommands] unexpected command: ${method}`)),
        ])
    ) as unknown as SessionCommands;
    return { ...unexpected, ...commands };
};
